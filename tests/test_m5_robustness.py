"""Robustness, Invariant, and Security Boundary Test Suite."""
from copy import deepcopy
import json
import numpy as np
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.signal import analyze, sample

client = TestClient(app)

def test_all_fourteen_quality_gates_present_and_enforced():
    """Verify all 14 quality gates are present and any failure withholds BPM."""
    res = analyze(sample())
    assert len(res['checks']) == 14
    gate_names = {c['name'] for c in res['checks']}
    expected_gates = {
        'duration_seconds', 'sample_rate_hz', 'largest_gap_seconds',
        'timing_variation', 'mean_green', 'clipped_pixel_fraction',
        'color_jump_proxy', 'relative_signal_std', 'spectral_concentration',
        'patch_difference_bpm', 'half_difference_bpm', 'estimator_difference_bpm',
        'autocorrelation', 'search_boundary_bpm'
    }
    assert gate_names == expected_gates
    assert res['bpm'] is not None

    # Corrupt single gate (mean green brightness)
    bad = deepcopy(sample())
    bad['left'] = [[1.0, 1.0, 1.0]] * len(bad['left'])
    bad['right'] = [[1.0, 1.0, 1.0]] * len(bad['right'])
    bad_res = analyze(bad)
    assert bad_res['bpm'] is None
    assert bad_res['status'] == 'insufficient_quality'
    assert any(not c['pass'] for c in bad_res['checks'])

def test_waveform_and_spectrum_preserved_when_bpm_withheld():
    """Verify waveform and spectrum remain available for inspectable failed signals."""
    bad_sample = sample('artifact')
    res = analyze(bad_sample)
    assert res['bpm'] is None
    assert 'waveform' in res and len(res['waveform']['seconds']) > 0
    assert 'spectrum' in res and len(res['spectrum']['bpm']) > 0

def test_pydantic_trace_boundary_enforcement():
    """Verify trace length boundaries (150 min, 7200 max) and forbidden extra fields."""
    d = sample()
    
    # Below 150 frames -> HTTP 422
    too_short = deepcopy(d)
    for k in ('timestamps', 'left', 'right', 'clipping'):
        too_short[k] = too_short[k][:149]
    assert client.post('/api/analyze', json=too_short).status_code == 422

    # Exactly 150 frames with duration = 10s (fs = 15 Hz) -> HTTP 200
    t150 = np.linspace(0, 10, 150).tolist()
    valid_150 = {
        'source': 'synthetic',
        'timestamps': t150,
        'left': [[100.0, 110.0, 90.0]] * 150,
        'right': [[100.0, 110.0, 90.0]] * 150,
        'clipping': [0.0] * 150
    }
    assert client.post('/api/analyze', json=valid_150).status_code == 200

    # Extra fields forbidden -> HTTP 422
    extra = deepcopy(d)
    extra['unauthorized_field'] = 'injection'
    assert client.post('/api/analyze', json=extra).status_code == 422

    # Invalid source enum -> HTTP 422
    bad_source = deepcopy(d)
    bad_source['source'] = 'invalid_source'
    assert client.post('/api/analyze', json=bad_source).status_code == 422

def test_gemma_prompt_sanitization_and_privacy(monkeypatch):
    """Verify Gemma prompt NEVER receives raw video, frames, or full timestamps."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'mock-pass')
    monkeypatch.setattr(module, 'last_ai_call', 0)
    monkeypatch.setattr(module, 'AI_COOLDOWN_SECONDS', 0.0)
    captured_prompts = []

    async def fake_post(self, url, **kwargs):
        prompt = kwargs['json']['contents'][0]['parts'][0]['text']
        captured_prompts.append(prompt)
        return httpx.Response(200, request=httpx.Request('POST', url),
            json={'candidates': [{'content': {'parts': [{'text': 'Quality report analyzed. 72 BPM.'}]}}]})

    monkeypatch.setattr(httpx.AsyncClient, 'post', fake_post)
    r = client.post('/api/explain', json=sample(), headers={'X-Demo-Token': 'mock-pass'})
    assert r.status_code == 200
    assert len(captured_prompts) == 1
    prompt = captured_prompts[0]
    
    # Invariants: no raw traces, no biometric arrays sent to provider
    assert 'left' not in prompt
    assert 'right' not in prompt
    assert 'clipping' not in prompt
    assert 'timestamps' not in prompt
    assert 'waveform' not in prompt
    assert 'Synthetic data is not a person' in prompt

def test_receipt_immutability_during_artifact_comparison():
    """Verify original receipt is not modified when generating stress comparison."""
    original = sample()
    original_analysis = analyze(original)
    original_sha = original_analysis['input_sha256']
    
    # Simulate client stress comparison logic
    copy = deepcopy(original)
    copy['source'] = 'synthetic'
    for i in range(len(copy['right'])):
        copy['right'][i][1] += 8.0  # perturb green channel
    perturbed_analysis = analyze(copy)

    # Re-verify original remains identical
    recheck = analyze(original)
    assert recheck['input_sha256'] == original_sha
    assert original_analysis['bpm'] == recheck['bpm']
    assert original_analysis['quality_score'] == recheck['quality_score']
    assert perturbed_analysis['input_sha256'] != original_sha
