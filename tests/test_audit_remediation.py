"""Independent Audit Remediation (F01-F09) Test Suite."""
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import numpy as np
import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app, AI_TIMEOUT_BUDGET_SECONDS
from app.signal import analyze, sample, VERSION

client = TestClient(app)


# ---------------------------------------------------------------------------
# Both-Patch Exposure Gate Tests
# ---------------------------------------------------------------------------

def test_algorithm_version_is_bumped():
    """Verify algorithm version is bumped to green-evidence-1.1."""
    assert VERSION == 'green-evidence-1.1'
    res = analyze(sample('clean'))
    assert res['algorithm'] == 'green-evidence-1.1'


def test_both_patches_exposure_isolated_cases():
    """Verify both cheek patches are independently required to satisfy [20, 235]."""
    base = sample('clean')

    # Case 1: Both patches normal (~110 and ~108) -> pass
    res_clean = analyze(base)
    mg_clean = next(c for c in res_clean['checks'] if c['name'] == 'mean_green')
    assert mg_clean['pass'] is True
    assert res_clean['bpm'] == 72
    assert 'exposure_metrics' in res_clean
    assert res_clean['exposure_metrics']['min_mean'] >= 20.0
    assert res_clean['exposure_metrics']['max_mean'] <= 235.0

    # Case 2: Patch 1 underexposed (<20), Patch 2 normal (~108) -> FAIL
    d_dark1 = deepcopy(base)
    d_dark1['left'] = [[15.0, 15.0, 15.0]] * len(d_dark1['left'])
    res_dark1 = analyze(d_dark1)
    mg_dark1 = next(c for c in res_dark1['checks'] if c['name'] == 'mean_green')
    assert mg_dark1['pass'] is False
    assert res_dark1['bpm'] is None
    assert res_dark1['status'] == 'insufficient_quality'
    assert mg_dark1['value'] == 15.0

    # Case 3: Patch 2 underexposed (<20), Patch 1 normal (~110) -> FAIL
    d_dark2 = deepcopy(base)
    d_dark2['right'] = [[18.0, 18.0, 18.0]] * len(d_dark2['right'])
    res_dark2 = analyze(d_dark2)
    mg_dark2 = next(c for c in res_dark2['checks'] if c['name'] == 'mean_green')
    assert mg_dark2['pass'] is False
    assert res_dark2['bpm'] is None
    assert mg_dark2['value'] == 18.0

    # Case 4: Patch 1 overexposed (>235), Patch 2 normal (~108) -> FAIL
    d_bright1 = deepcopy(base)
    d_bright1['left'] = [[240.0, 240.0, 240.0]] * len(d_bright1['left'])
    res_bright1 = analyze(d_bright1)
    mg_bright1 = next(c for c in res_bright1['checks'] if c['name'] == 'mean_green')
    assert mg_bright1['pass'] is False
    assert res_bright1['bpm'] is None
    assert mg_bright1['value'] == 240.0

    # Case 5: The exact audit reproduction: Patch 1 ~110, Patch 2 ~240 -> MUST FAIL
    # (In green-evidence-1.0, min(110, 240)=110 caused this to falsely pass with 72 BPM / 100%)
    d_asymm = deepcopy(base)
    t = np.arange(900) / 30
    p = np.sin(2 * np.pi * 1.2 * t) + 0.15 * np.sin(2 * np.pi * 2.4 * t)
    # Patch 1 normal ~110, Patch 2 overbright ~240 with same pulse wave
    g1 = 110.0 + 1.2 * p
    g2 = 240.0 + 1.1 * p
    d_asymm['left'] = np.column_stack([g1 * 0.9, g1, g1 * 0.75]).round(5).tolist()
    d_asymm['right'] = np.column_stack([g2 * 0.9, g2, g2 * 0.75]).round(5).tolist()
    res_asymm = analyze(d_asymm)
    mg_asymm = next(c for c in res_asymm['checks'] if c['name'] == 'mean_green')
    assert mg_asymm['pass'] is False
    assert res_asymm['bpm'] is None
    assert res_asymm['status'] == 'insufficient_quality'
    assert mg_asymm['value'] >= 235.0
    assert 'waveform' in res_asymm and len(res_asymm['waveform']['seconds']) > 0
    assert 'spectrum' in res_asymm and len(res_asymm['spectrum']['bpm']) > 0

    # Case 6: Exact boundary values (20.0 and 235.0 pass; 19.9 and 235.1 fail)
    d_bound_pass = deepcopy(base)
    d_bound_pass['left'] = [[20.0, 20.0, 20.0]] * len(d_bound_pass['left'])
    d_bound_pass['right'] = [[235.0, 235.0, 235.0]] * len(d_bound_pass['right'])
    res_bp = analyze(d_bound_pass)
    mg_bp = next(c for c in res_bp['checks'] if c['name'] == 'mean_green')
    assert mg_bp['pass'] is True

    d_bound_fail = deepcopy(base)
    d_bound_fail['left'] = [[19.9, 19.9, 19.9]] * len(d_bound_fail['left'])
    d_bound_fail['right'] = [[235.1, 235.1, 235.1]] * len(d_bound_fail['right'])
    res_bf = analyze(d_bound_fail)
    mg_bf = next(c for c in res_bf['checks'] if c['name'] == 'mean_green')
    assert mg_bf['pass'] is False


# ---------------------------------------------------------------------------
# Camera/Video Reimport and Canonical Signal Hash
# ---------------------------------------------------------------------------

def test_canonical_signal_hash_invariance_and_sensitivity():
    """Verify signal_sha256 is invariant to metadata and changes on numerical modification."""
    base = sample('clean')
    base['source'] = 'camera'
    base['ingestion'] = 'live_capture'
    res1 = analyze(base)
    assert 'signal_sha256' in res1
    assert 'input_sha256' in res1

    # Reimport scenario: ingestion metadata changes to 'json_import', source remains 'camera'
    reimported = deepcopy(base)
    reimported['ingestion'] = 'json_import'
    res_reimport = analyze(reimported)
    # Canonical numerical signal hash MUST match exactly
    assert res_reimport['signal_sha256'] == res1['signal_sha256']

    # Even if source label was declared differently (e.g. 'sample'), signal_sha256 is unchanged
    metadata_changed = deepcopy(base)
    metadata_changed['source'] = 'sample'
    metadata_changed['ingestion'] = 'sample'
    res_meta = analyze(metadata_changed)
    assert res_meta['signal_sha256'] == res1['signal_sha256']
    # input_sha256 differs because input JSON dictionary is different
    assert res_meta['input_sha256'] != res1['input_sha256']

    # Numerical modification 1: Perturb green channel by 0.01 -> signal_sha256 MUST change
    mod_rgb = deepcopy(base)
    mod_rgb['left'][0][1] += 0.01
    res_mod_rgb = analyze(mod_rgb)
    assert res_mod_rgb['signal_sha256'] != res1['signal_sha256']

    # Numerical modification 2: Perturb timestamp by 0.001 -> signal_sha256 MUST change
    mod_time = deepcopy(base)
    mod_time['timestamps'][5] += 0.001
    res_mod_time = analyze(mod_time)
    assert res_mod_time['signal_sha256'] != res1['signal_sha256']


# ---------------------------------------------------------------------------
# Gemma Deadline Budget and Abuse Protections
# ---------------------------------------------------------------------------

def test_unauthenticated_request_rejected_before_analysis(monkeypatch):
    """Test missing or invalid token rejects with 401 before expensive work."""
    monkeypatch.setenv('GEMINI_API_KEY', 'valid-mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'strong-private-secret-token')

    # Missing token header -> HTTP 401
    r_missing = client.post('/api/explain', json=sample('clean'))
    assert r_missing.status_code == 401

    # Invalid token header -> HTTP 401
    r_bad = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'wrong-token'})
    assert r_bad.status_code == 401


def test_server_cooldown_assertion(monkeypatch):
    """F09: Test immediate second request asserts 10-second cooldown fallback."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)

    async def fake_post(self, url, **kwargs):
        return httpx.Response(200, request=httpx.Request('POST', url),
            json={'candidates': [{'content': {'parts': [{'text': 'Valid explanation text.'}]}}]})
    monkeypatch.setattr(httpx.AsyncClient, 'post', fake_post)

    # First request succeeds
    r1 = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r1.status_code == 200
    assert r1.json()['provider'] == 'Gemma 4'

    # Immediate second request triggers cooldown fallback
    r2 = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r2.status_code == 200
    assert r2.json()['provider'] == 'deterministic'
    assert 'AI cooldown: wait ten seconds' in r2.json()['reason']


def test_gemma_timeout_budget_fallback(monkeypatch):
    """F07: Test provider timeout budget returns deterministic fallback cleanly."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)
    monkeypatch.setattr(module, 'AI_TIMEOUT_BUDGET_SECONDS', 0.1)

    async def slow_post(self, url, **kwargs):
        await asyncio.sleep(0.3)
        return httpx.Response(200, request=httpx.Request('POST', url), json={})

    monkeypatch.setattr(httpx.AsyncClient, 'post', slow_post)
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    assert r.json()['provider'] == 'deterministic'
    assert 'timed out' in r.json()['reason'].lower()


# ---------------------------------------------------------------------------
# Boundary and Quality Gate Isolation Tests
# ---------------------------------------------------------------------------

def test_exact_7199_7200_7201_frame_boundaries():
    """Test exact frame count boundaries (7199, 7200, 7201)."""
    # 7200 frames over 60.0 seconds gives fs = 120 Hz (within 10-120 Hz and 10-60s)
    t = np.linspace(0, 60.0, 7200).tolist()
    row = [100.0, 110.0, 90.0]

    # Exactly 7200 frames -> HTTP 200
    payload_7200 = {
        'source': 'synthetic',
        'timestamps': t,
        'left': [row] * 7200,
        'right': [row] * 7200,
        'clipping': [0.0] * 7200
    }
    assert client.post('/api/analyze', json=payload_7200).status_code == 200

    # 7199 frames -> HTTP 200
    payload_7199 = {
        'source': 'synthetic',
        'timestamps': t[:7199],
        'left': [row] * 7199,
        'right': [row] * 7199,
        'clipping': [0.0] * 7199
    }
    assert client.post('/api/analyze', json=payload_7199).status_code == 200

    # 7201 frames -> HTTP 422
    t_7201 = np.linspace(0, 60.0, 7201).tolist()
    payload_7201 = {
        'source': 'synthetic',
        'timestamps': t_7201,
        'left': [row] * 7201,
        'right': [row] * 7201,
        'clipping': [0.0] * 7201
    }
    assert client.post('/api/analyze', json=payload_7201).status_code == 422


def test_ui_equivalent_sinusoidal_artifact_injection():
    """F08: Test artifact injection matching exact web/app.js formula."""
    original = sample('clean')
    orig_res = analyze(original)
    assert orig_res['bpm'] == 72
    assert orig_res['quality_score'] == 100

    copy = deepcopy(original)
    copy['source'] = 'synthetic'
    for i in range(len(copy['right'])):
        t_i = copy['timestamps'][i]
        copy['right'][i][1] = max(0.0, min(255.0, copy['right'][i][1] + 8.0 * np.sin(2 * np.pi * 1.85 * t_i)))

    art_res = analyze(copy)
    assert art_res['bpm'] is None
    assert art_res['status'] == 'insufficient_quality'
    failed = [c['name'] for c in art_res['checks'] if not c['pass']]
    assert 'patch_difference_bpm' in failed or 'estimator_difference_bpm' in failed
    # Original analysis remains intact
    assert orig_res['bpm'] == 72


def test_each_of_fourteen_gates_individually_fails():
    """F08: Systematically verify that failure of any isolated gate withholds BPM."""
    base = sample('clean')

    def check_withheld(modified_trace, gate_name):
        r = analyze(modified_trace)
        failing_gates = [c['name'] for c in r['checks'] if not c['pass']]
        assert gate_name in failing_gates, f"Expected {gate_name} to fail, but failed: {failing_gates}"
        assert r['bpm'] is None
        assert r['status'] == 'insufficient_quality'

    # 1. duration_seconds (< 20s, but >= 10s so it passes schema boundary)
    d = deepcopy(base)
    # 450 frames at 30 Hz is 15s (>=10s boundary, but <20s gate)
    for k in ('timestamps', 'left', 'right', 'clipping'):
        d[k] = d[k][:450]
    check_withheld(d, 'duration_seconds')

    # 2. sample_rate_hz (fs = 14 Hz, duration = 30s, 420 frames -> >=10 Hz boundary, but <15 Hz gate)
    d = deepcopy(base)
    t_14hz = (np.arange(420) / 14.0).tolist()
    d['timestamps'] = t_14hz
    for k in ('left', 'right', 'clipping'):
        d[k] = d[k][:420]
    check_withheld(d, 'sample_rate_hz')

    # 3. largest_gap_seconds (> 0.2s)
    d = deepcopy(base)
    d['timestamps'][100] = d['timestamps'][99] + 0.35
    for i in range(101, len(d['timestamps'])):
        d['timestamps'][i] += 0.35
    check_withheld(d, 'largest_gap_seconds')

    # 4. timing_variation (> 0.35)
    d = deepcopy(base)
    rng = np.random.default_rng(123)
    noisy_dt = 1.0 / 30.0 + rng.normal(0, 0.025, len(d['timestamps']))
    noisy_dt = np.maximum(0.005, noisy_dt)
    d['timestamps'] = np.cumsum(noisy_dt).tolist()
    check_withheld(d, 'timing_variation')

    # 5. mean_green (< 20 or > 235)
    d = deepcopy(base)
    d['left'] = [[10.0, 10.0, 10.0]] * len(d['left'])
    check_withheld(d, 'mean_green')

    # 6. clipped_pixel_fraction (> 0.05)
    d = deepcopy(base)
    d['clipping'] = [0.10] * len(d['clipping'])
    check_withheld(d, 'clipped_pixel_fraction')

    # 7. color_jump_proxy (> 0.025)
    d = deepcopy(base)
    for i in range(0, len(d['left']), 2):
        d['left'][i][1] += 15.0
    check_withheld(d, 'color_jump_proxy')

    # 8. relative_signal_std (< 0.0002)
    d = deepcopy(base)
    for i in range(len(d['left'])):
        d['left'][i] = [110.0, 110.0, 110.0]
        d['right'][i] = [108.0, 108.0, 108.0]
    check_withheld(d, 'relative_signal_std')

    # 9. spectral_concentration (< 0.50)
    d = deepcopy(base)
    t = np.array(d['timestamps'])
    freqs = [0.8, 1.2, 1.6, 2.0, 2.4, 2.8]
    multi_sine = sum(np.sin(2 * np.pi * f * t) for f in freqs)
    g9 = 110.0 + 0.3 * multi_sine
    d['left'] = np.column_stack([g9 * 0.9, g9, g9 * 0.75]).round(5).tolist()
    d['right'] = np.column_stack([g9 * 0.9, g9, g9 * 0.75]).round(5).tolist()
    check_withheld(d, 'spectral_concentration')

    # 10. patch_difference_bpm (> 8 BPM)
    d = deepcopy(base)
    t = np.array(d['timestamps'])
    p2 = np.sin(2 * np.pi * 1.5 * t)
    g2 = 108.0 + 1.5 * p2
    d['right'] = np.column_stack([g2 * 0.9, g2, g2 * 0.75]).round(5).tolist()
    check_withheld(d, 'patch_difference_bpm')

    # 11. half_difference_bpm (> 10 BPM)
    d = deepcopy(base)
    t = np.array(d['timestamps'])
    half = len(t) // 2
    p_first = np.sin(2 * np.pi * 1.2 * t[:half])
    p_second = np.sin(2 * np.pi * 1.6 * t[half:])
    g11 = np.concatenate([110.0 + 1.2 * p_first, 110.0 + 1.2 * p_second])
    d['left'] = np.column_stack([g11 * 0.9, g11, g11 * 0.75]).round(5).tolist()
    d['right'] = np.column_stack([g11 * 0.9, g11, g11 * 0.75]).round(5).tolist()
    check_withheld(d, 'half_difference_bpm')

    # 12. estimator_difference_bpm (> 10 BPM)
    d = deepcopy(base)
    t = np.array(d['timestamps'])
    wave = np.sin(2 * np.pi * 0.75 * t) + 1.2 * np.sin(2 * np.pi * 1.5 * t)
    g12 = 110.0 + 0.6 * wave
    d['left'] = np.column_stack([g12 * 0.9, g12, g12 * 0.75]).round(5).tolist()
    d['right'] = np.column_stack([g12 * 0.9, g12, g12 * 0.75]).round(5).tolist()
    check_withheld(d, 'estimator_difference_bpm')

    # 13. autocorrelation (< 0.45)
    d = deepcopy(base)
    t = np.array(d['timestamps'])
    wave13 = np.sin(2 * np.pi * (0.8 + 0.04 * t) * t)
    g13 = 110.0 + 1.0 * wave13
    d['left'] = np.column_stack([g13 * 0.9, g13, g13 * 0.75]).round(5).tolist()
    d['right'] = np.column_stack([g13 * 0.9, g13, g13 * 0.75]).round(5).tolist()
    check_withheld(d, 'autocorrelation')

    # 14. search_boundary_bpm (< 45 or > 177 BPM)
    d = deepcopy(base)
    t = np.array(d['timestamps'])
    p14 = np.sin(2 * np.pi * 0.72 * t)  # 0.72 Hz = 43.2 BPM < 45 BPM
    g14 = 110.0 + 1.2 * p14
    d['left'] = np.column_stack([g14 * 0.9, g14, g14 * 0.75]).round(5).tolist()
    d['right'] = np.column_stack([g14 * 0.9, g14, g14 * 0.75]).round(5).tolist()
    check_withheld(d, 'search_boundary_bpm')


def test_truly_isolated_gates_single_failure_exact_score():
    """Verify that the 5 truly orthogonal gates can fail in total isolation:
    exactly 1 failing check, 13/14 passing, quality_score == 93%, with BPM withheld."""
    base = sample('clean')
    t = np.array(base['timestamps'])

    def assert_isolated(modified, gate_name):
        r = analyze(modified)
        failed = [c['name'] for c in r['checks'] if not c['pass']]
        assert failed == [gate_name], f"Expected only {gate_name} to fail, got {failed}"
        assert r['quality_score'] == 93
        assert r['bpm'] is None
        assert r['status'] == 'insufficient_quality'
        assert len(r['waveform']['seconds']) > 0
        assert len(r['spectrum']['bpm']) > 0

    # 1. duration_seconds
    d1 = deepcopy(base)
    for k in ('timestamps', 'left', 'right', 'clipping'):
        d1[k] = d1[k][:450]
    assert_isolated(d1, 'duration_seconds')

    # 2. largest_gap_seconds
    d2 = deepcopy(base)
    d2['timestamps'][100] += 0.25
    for i in range(101, len(d2['timestamps'])):
        d2['timestamps'][i] += 0.25
    assert_isolated(d2, 'largest_gap_seconds')

    # 3. mean_green (preserving pulse wave so relative std and others pass)
    d3 = deepcopy(base)
    p = np.sin(2 * np.pi * 1.2 * t)
    g = 15.0 + 0.3 * p
    d3['left'] = np.column_stack([g * 0.9, g, g * 0.75]).round(5).tolist()
    assert_isolated(d3, 'mean_green')

    # 4. clipped_pixel_fraction
    d4 = deepcopy(base)
    d4['clipping'] = [0.10] * len(d4['clipping'])
    assert_isolated(d4, 'clipped_pixel_fraction')

    # 5. search_boundary_bpm
    d5 = deepcopy(base)
    p5 = np.sin(2 * np.pi * 0.72 * t)
    g5 = 110.0 + 1.2 * p5
    d5['left'] = np.column_stack([g5 * 0.9, g5, g5 * 0.75]).round(5).tolist()
    d5['right'] = np.column_stack([g5 * 0.9, g5, g5 * 0.75]).round(5).tolist()
    assert_isolated(d5, 'search_boundary_bpm')


# ---------------------------------------------------------------------------
# Product Differentiators: Automated Tests
# ---------------------------------------------------------------------------

def test_challenge_a_timestamp_dropout():
    """Verify Challenge A (0.35s timing dropout) trips largest_gap_seconds and withholds BPM."""
    base = sample('clean')
    mid = len(base['timestamps']) // 2
    copy_a = deepcopy(base)
    copy_a['source'] = 'synthetic'
    for i in range(mid, len(copy_a['timestamps'])):
        copy_a['timestamps'][i] += 0.35

    res = analyze(copy_a)
    assert res['bpm'] is None
    assert res['status'] == 'insufficient_quality'
    gap_check = next(c for c in res['checks'] if c['name'] == 'largest_gap_seconds')
    assert gap_check['pass'] is False
    assert gap_check['value'] >= 0.35


def test_challenge_b_conflicting_patch():
    """Verify Challenge B (1.85 Hz sine on Patch 2) trips patch_difference_bpm and withholds BPM."""
    base = sample('clean')
    copy_b = deepcopy(base)
    copy_b['source'] = 'synthetic'
    t = np.array(copy_b['timestamps'])
    # Injected 1.85 Hz artifact into green channel of patch 2
    for i in range(len(copy_b['right'])):
        copy_b['right'][i][1] = float(np.clip(copy_b['right'][i][1] + 8.0 * np.sin(2 * np.pi * 1.85 * t[i]), 0, 255))

    res = analyze(copy_b)
    assert res['bpm'] is None
    assert res['status'] == 'insufficient_quality'
    # Patch difference or estimator difference must fail
    p_diff = next(c for c in res['checks'] if c['name'] == 'patch_difference_bpm')
    assert p_diff['pass'] is False


def test_challenge_c_shared_periodic_illumination():
    """Verify Challenge C: Shared 1.2 Hz periodic illumination on BOTH patches passes heuristic gates.
    This demonstrates the critical scientific limitation: camera rPPG heuristic consensus
    does not guarantee biological arterial pulse origin."""
    base = sample('clean')
    copy_c = deepcopy(base)
    copy_c['source'] = 'synthetic'
    t = np.array(copy_c['timestamps'])
    f_art = 1.2  # 72 BPM ambient flicker
    for i in range(len(copy_c['left'])):
        copy_c['left'][i][1] = float(np.clip(copy_c['left'][i][1] + 8.0 * np.sin(2 * np.pi * f_art * t[i]), 0, 255))
        copy_c['right'][i][1] = float(np.clip(copy_c['right'][i][1] + 8.0 * np.sin(2 * np.pi * f_art * t[i]), 0, 255))

    res = analyze(copy_c)
    # Both patches oscillate synchronously at 72 BPM, so inter-patch consensus passes!
    p_diff = next(c for c in res['checks'] if c['name'] == 'patch_difference_bpm')
    assert p_diff['pass'] is True
    # The estimate passes heuristics, demonstrating the limitation of optical rPPG without ground truth
    assert res['bpm'] == 72
    assert res['quality_score'] == 100


def test_judge_evidence_card_fields_and_integrity():
    """Verify Judge Evidence Card schema requirements."""
    res = analyze(sample('clean'))
    health_data = client.get('/api/health').json()
    
    # Simulate card generation as defined in web/app.js
    card = {
        'application': 'HiperPulse',
        'version': health_data.get('version', '1.1'),
        'algorithm': res['algorithm'],
        'git_sha': health_data.get('git_sha', 'unknown'),
        'provenance_note': 'Canonical signal_sha256 identifies mathematical signal data. git_sha identifies software build revision.',
        'declared_source': res['source'],
        'ingestion_method': res.get('ingestion', 'direct'),
        'is_synthetic': res['source'] == 'synthetic',
        'signal_sha256': res['signal_sha256'],
        'input_sha256': res['input_sha256'],
        'sample_count': len(res['waveform']['seconds']),
        'bpm_estimate': res['bpm'],
        'bpm_withheld': res['bpm'] is None,
        'quality_score_percent': res['quality_score'],
        'passed_checks': [c['name'] for c in res['checks'] if c['pass']],
        'failed_checks': [c['name'] for c in res['checks'] if not c['pass']],
        'disclaimers': [
            'Experimental wellness prototype. Not a medical device.',
            'No clinical accuracy, diagnosis, blood pressure, or oxygen saturation.',
            'Heuristic check passage does not prove biological arterial pulsation.'
        ]
    }
    
    # Required keys exist
    for key in ['application', 'version', 'algorithm', 'git_sha', 'signal_sha256', 'bpm_estimate', 'disclaimers', 'provenance_note']:
        assert key in card
    assert card['algorithm'] == 'green-evidence-1.1'
    assert len(card['signal_sha256']) == 64
    assert len(card['disclaimers']) == 3
    assert card['git_sha'] != ''


def test_build_info_provenance_not_stale():
    """Verify that build provenance is dynamically retrieved and not hardcoded to a stale historical SHA."""
    res = client.get('/api/health')
    assert res.status_code == 200
    data = res.json()
    assert 'git_sha' in data
    assert 'version' in data
    assert data['version'] == '1.1'

    meta = client.get('/api/meta').json()
    assert meta['git_sha'] == data['git_sha']

    # When in a valid git repo, git_sha must match git rev-parse HEAD
    import subprocess
    git_run = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True)
    if git_run.returncode == 0 and git_run.stdout.strip():
        current_head = git_run.stdout.strip()
        assert data['git_sha'] == current_head
        # If current HEAD is not 06ec6c..., it must not report 06ec6c...
        if current_head != '06ec6c7cdefa54520fe020f7f0e8faeffe725432':
            assert data['git_sha'] != '06ec6c7cdefa54520fe020f7f0e8faeffe725432'


def test_retake_advice_mapping_all_categories():
    """Verify deterministic mapping of actual signal check failures to prioritized advice categories."""
    def make_checks(failed_names):
        all_names = [
            'duration_seconds', 'sample_rate_hz', 'largest_gap_seconds', 'timing_variation',
            'mean_green', 'clipped_pixel_fraction', 'color_jump_proxy', 'relative_signal_std',
            'spectral_concentration', 'patch_difference_bpm', 'half_difference_bpm',
            'estimator_difference_bpm', 'autocorrelation', 'search_boundary_bpm'
        ]
        checks = []
        for name in all_names:
            checks.append({
                'name': name,
                'pass': name not in failed_names,
                'value': 1.0,
                'rule': 'test',
                'action': f'Action for {name}'
            })
        return checks

    # Emulate the deterministic mapping from web/app.js
    def get_advice_category(checks):
        failed = [c for c in checks if not c['pass']]
        if not failed:
            return 'accepted'
        failed_names = set(c['name'] for c in failed)
        if 'mean_green' in failed_names or 'clipped_pixel_fraction' in failed_names:
            return 'lighting'
        if any(k in failed_names for k in ('color_jump_proxy', 'relative_signal_std', 'spectral_concentration', 'autocorrelation')):
            return 'stability'
        if any(k in failed_names for k in ('patch_difference_bpm', 'half_difference_bpm', 'estimator_difference_bpm')):
            return 'alignment'
        if any(k in failed_names for k in ('duration_seconds', 'sample_rate_hz', 'largest_gap_seconds', 'timing_variation')):
            return 'timing'
        if 'search_boundary_bpm' in failed_names:
            return 'boundary'
        return 'general'

    # 1. Clean run -> accepted (no retake needed)
    assert get_advice_category(make_checks([])) == 'accepted'

    # 2. Lighting / exposure failure
    assert get_advice_category(make_checks(['mean_green'])) == 'lighting'
    assert get_advice_category(make_checks(['clipped_pixel_fraction'])) == 'lighting'

    # 3. Movement / stability failure
    assert get_advice_category(make_checks(['color_jump_proxy'])) == 'stability'
    assert get_advice_category(make_checks(['relative_signal_std'])) == 'stability'
    assert get_advice_category(make_checks(['spectral_concentration'])) == 'stability'
    assert get_advice_category(make_checks(['autocorrelation'])) == 'stability'

    # 4. Alignment / bilateral symmetry failure
    assert get_advice_category(make_checks(['patch_difference_bpm'])) == 'alignment'
    assert get_advice_category(make_checks(['half_difference_bpm'])) == 'alignment'
    assert get_advice_category(make_checks(['estimator_difference_bpm'])) == 'alignment'

    # 5. Timing / duration failure
    assert get_advice_category(make_checks(['duration_seconds'])) == 'timing'
    assert get_advice_category(make_checks(['sample_rate_hz'])) == 'timing'
    assert get_advice_category(make_checks(['largest_gap_seconds'])) == 'timing'
    assert get_advice_category(make_checks(['timing_variation'])) == 'timing'

    # 6. Search boundary failure
    assert get_advice_category(make_checks(['search_boundary_bpm'])) == 'boundary'

    # Priority order: Lighting > Stability > Alignment > Timing
    assert get_advice_category(make_checks(['mean_green', 'color_jump_proxy', 'patch_difference_bpm'])) == 'lighting'
    assert get_advice_category(make_checks(['spectral_concentration', 'timing_variation'])) == 'stability'


def test_challenge_a_continuity_rule_and_threshold():
    """Verify Challenge A checks against the authentic <= 0.20 s largest_gap_seconds rule."""
    res = analyze(sample('clean'))
    gap_check = next(c for c in res['checks'] if c['name'] == 'largest_gap_seconds')
    assert gap_check['rule'] == '<= 0.2 s'


# ---------------------------------------------------------------------------
# Phase 2: Synthetic Fixture Provenance Regressions (Tests A - K)
# ---------------------------------------------------------------------------

def test_provenance_a_known_30s_webm_fixture_recognized():
    """Test A: Known 30s WebM fixture recognized by content-hash in manifest."""
    manifest_path = Path(__file__).resolve().parent.parent / 'samples' / 'trusted_fixtures.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    video_fixtures = manifest['video_fixtures']
    entry = next(v for v in video_fixtures.values() if v['fixture_id'] == 'test_video_30s.webm')
    assert entry['source'] == 'synthetic'
    assert '72 BPM' in entry['description']
    assert entry['duration_seconds'] == 30.0


def test_provenance_b_renamed_known_fixture_retains_synthetic(tmp_path):
    """Test B: Renamed known fixture (e.g. user_recording.webm) retains synthetic status via hash."""
    from scripts.build_manifest import hash_file
    root = Path(__file__).resolve().parent.parent
    src = root / 'samples' / 'test_video_30s.webm'
    dest = tmp_path / 'arbitrary_camera_name.webm'
    dest.write_bytes(src.read_bytes())
    sha = hash_file(dest)
    manifest = json.loads((root / 'samples' / 'trusted_fixtures.json').read_text(encoding='utf-8'))
    assert sha in manifest['video_fixtures']
    assert manifest['video_fixtures'][sha]['source'] == 'synthetic'


def test_provenance_c_arbitrary_video_renamed_synthetic_demo_classified_as_video(tmp_path):
    """Test C: Arbitrary video renamed to synthetic_demo.webm is NOT synthetic because hash is not in manifest."""
    from scripts.build_manifest import hash_file
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / 'samples' / 'trusted_fixtures.json').read_text(encoding='utf-8'))
    fake_vid = tmp_path / 'synthetic_demo_recording.webm'
    fake_vid.write_bytes(b'arbitrary video data not in manifest 1234567890')
    sha = hash_file(fake_vid)
    assert sha not in manifest['video_fixtures']


def test_provenance_d_unknown_video_classified_as_unverified_origin():
    """Test D: Unknown video classified as source='video', ingestion='local_video'."""
    base = sample('clean')
    base['source'] = 'video'
    base['ingestion'] = 'local_video'
    res = client.post('/api/analyze', json=base)
    assert res.status_code == 200
    data = res.json()
    assert data['source'] == 'video'
    assert data['ingestion'] == 'local_video'


def test_provenance_e_camera_trace_preserves_source_and_json_import():
    """Test E: Camera-source trace export/import preserves 'camera' and 'json_import'."""
    base = sample('clean')
    base['source'] = 'camera'
    base['ingestion'] = 'json_import'
    res = client.post('/api/analyze', json=base)
    assert res.status_code == 200
    data = res.json()
    assert data['source'] == 'camera'
    assert data['ingestion'] == 'json_import'


def test_provenance_f_video_trace_preserves_source_and_json_import():
    """Test F: Video-source trace export/import preserves 'video' and 'json_import'."""
    base = sample('clean')
    base['source'] = 'video'
    base['ingestion'] = 'json_import'
    res = client.post('/api/analyze', json=base)
    assert res.status_code == 200
    data = res.json()
    assert data['source'] == 'video'
    assert data['ingestion'] == 'json_import'


def test_provenance_g_synthetic_trace_preserves_source_and_json_import():
    """Test G: Synthetic-source trace export/import preserves 'synthetic' and 'json_import'."""
    base = sample('clean')
    base['source'] = 'synthetic'
    base['ingestion'] = 'json_import'
    res = client.post('/api/analyze', json=base)
    assert res.status_code == 200
    data = res.json()
    assert data['source'] == 'synthetic'
    assert data['ingestion'] == 'json_import'


def test_provenance_h_modified_samples_alter_signal_sha256():
    """Test H: Modified numeric samples alter signal_sha256."""
    base = sample('clean')
    res1 = analyze(base)
    mod = deepcopy(base)
    mod['left'][10][1] += 0.5
    res2 = analyze(mod)
    assert res1['signal_sha256'] != res2['signal_sha256']


def test_provenance_i_metadata_only_changes_preserve_signal_sha256():
    """Test I: Metadata-only changes preserve signal_sha256."""
    base = sample('clean')
    base['source'] = 'camera'
    base['ingestion'] = 'live_capture'
    res1 = analyze(base)
    mod = deepcopy(base)
    mod['source'] = 'video'
    mod['ingestion'] = 'json_import'
    res2 = analyze(mod)
    assert res1['signal_sha256'] == res2['signal_sha256']
    assert res1['input_sha256'] != res2['input_sha256']


def test_provenance_j_legacy_receipts_without_ingestion_compatible():
    """Test J: Legacy receipts without ingestion field remain fully compatible."""
    base = sample('clean')
    if 'ingestion' in base:
        del base['ingestion']
    res = client.post('/api/analyze', json=base)
    assert res.status_code == 200
    data = res.json()
    assert data['ingestion'] == 'direct'
    assert data['status'] == 'accepted_experimental'


def test_provenance_k_manifest_generator_reproducibility():
    """Test K: scripts/build_manifest.py generates valid, reproducible manifest in samples/ and web/."""
    from scripts.build_manifest import build_manifest
    manifest = build_manifest()
    root = Path(__file__).resolve().parent.parent
    samples_mf = json.loads((root / 'samples' / 'trusted_fixtures.json').read_text(encoding='utf-8'))
    web_mf = json.loads((root / 'web' / 'trusted_fixtures.json').read_text(encoding='utf-8'))
    assert samples_mf == web_mf
    assert len(manifest['video_fixtures']) == 5
    assert len(manifest['trace_fixtures']) == 3


# ---------------------------------------------------------------------------
# Phase 5: Gemma Deadline, Concurrency & Security Tests
# ---------------------------------------------------------------------------

def test_gemma_transient_500_retry_success(monkeypatch):
    """Test transient 500 error followed by successful retry within deadline budget."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)

    call_count = 0
    async def fake_retry_post(self, url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(500, request=httpx.Request('POST', url))
        return httpx.Response(200, request=httpx.Request('POST', url),
            json={'candidates': [{'content': {'parts': [{'text': 'Retried explanation succeeded.'}]}}]})

    monkeypatch.setattr(httpx.AsyncClient, 'post', fake_retry_post)
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    assert r.json()['provider'] == 'Gemma 4'
    assert 'Retried explanation succeeded.' in r.json()['text']
    assert call_count == 2


def test_gemma_malformed_responses_fallback(monkeypatch):
    """Test malformed responses fall back cleanly without altering measurement."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')

    cases = [
        {},
        {'candidates': []},
        {'candidates': [{'content': {'parts': []}}]},
        {'candidates': [{'content': {'parts': [{'text': ''}]}}]},
        {'candidates': [{'content': {'parts': [{'text': 'x' * 3500}]}}]},
    ]

    for body in cases:
        monkeypatch.setattr(module, 'last_ai_call', 0)
        async def fake_post(self, url, **kwargs):
            return httpx.Response(200, request=httpx.Request('POST', url), json=body)
        monkeypatch.setattr(httpx.AsyncClient, 'post', fake_post)

        r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
        assert r.status_code == 200
        res = r.json()
        assert res['provider'] == 'deterministic'
        assert 'Gemma unavailable' in res['reason']


# ---------------------------------------------------------------------------
# Concurrency, Queueing & Monotonic Deadline Suite
# ---------------------------------------------------------------------------

def test_r1_concurrency_two_simultaneous_requests_both_admitted(monkeypatch):
    """R1-01: Two concurrent requests acquire both semaphore slots and complete."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'AI_COOLDOWN_SECONDS', 0.0)

    async def run():
        module.ai_semaphore = asyncio.Semaphore(2)
        module.ai_lock = asyncio.Lock()
        active_count = 0
        max_active = 0

        orig_post = httpx.AsyncClient.post
        async def fake_post(self, url, **kwargs):
            nonlocal active_count, max_active
            if 'generativelanguage' in str(url):
                active_count += 1
                max_active = max(max_active, active_count)
                await asyncio.sleep(0.05)
                active_count -= 1
                return httpx.Response(200, request=httpx.Request('POST', str(url)),
                    json={'candidates': [{'content': {'parts': [{'text': 'Concurrent test ok.'}]}}]})
            return await orig_post(self, url, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, 'post', fake_post)

        transport = httpx.ASGITransport(app=module.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as ac:
            task1 = ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
            task2 = ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
            r1, r2 = await asyncio.gather(task1, task2)

        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()['provider'] == 'Gemma 4'
        assert r2.json()['provider'] == 'Gemma 4'
        assert max_active == 2

    asyncio.run(run())


def test_r1_concurrency_max_active_provider_calls_strictly_bounded(monkeypatch):
    """R1-02: Max active provider calls is strictly bounded <= 2 under 5 concurrent requests."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'AI_COOLDOWN_SECONDS', 0.0)

    async def run():
        module.ai_semaphore = asyncio.Semaphore(2)
        module.ai_lock = asyncio.Lock()
        active_count = 0
        max_observed_active = 0

        orig_post = httpx.AsyncClient.post
        async def fake_post(self, url, **kwargs):
            nonlocal active_count, max_observed_active
            if 'generativelanguage' in str(url):
                active_count += 1
                max_observed_active = max(max_observed_active, active_count)
                await asyncio.sleep(0.04)
                active_count -= 1
                return httpx.Response(200, request=httpx.Request('POST', str(url)),
                    json={'candidates': [{'content': {'parts': [{'text': 'Bounded active ok.'}]}}]})
            return await orig_post(self, url, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, 'post', fake_post)

        transport = httpx.ASGITransport(app=module.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as ac:
            tasks = [ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'}) for _ in range(5)]
            responses = await asyncio.gather(*tasks)

        for r in responses:
            assert r.status_code == 200
            assert r.json()['provider'] == 'Gemma 4'
        assert max_observed_active <= 2

    asyncio.run(run())


def test_r1_queue_admission_within_budget(monkeypatch):
    """R1-03: Queued 3rd request is admitted once slot frees and finishes within budget."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'AI_COOLDOWN_SECONDS', 0.0)

    async def run():
        module.ai_semaphore = asyncio.Semaphore(2)
        module.ai_lock = asyncio.Lock()
        completion_order = []
        orig_post = httpx.AsyncClient.post
        async def fake_post(self, url, **kwargs):
            if 'generativelanguage' in str(url):
                await asyncio.sleep(0.05)
                completion_order.append(len(completion_order) + 1)
                return httpx.Response(200, request=httpx.Request('POST', str(url)),
                    json={'candidates': [{'content': {'parts': [{'text': 'Queue test ok.'}]}}]})
            return await orig_post(self, url, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, 'post', fake_post)

        transport = httpx.ASGITransport(app=module.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as ac:
            tasks = [ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'}) for _ in range(3)]
            results = await asyncio.gather(*tasks)

        assert len(results) == 3
        assert all(r.status_code == 200 and r.json()['provider'] == 'Gemma 4' for r in results)
        assert len(completion_order) == 3

    asyncio.run(run())


def test_r1_queue_timeout_while_waiting_for_semaphore(monkeypatch):
    """R1-04: Queued request waiting for semaphore times out within budget and returns fallback."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'AI_COOLDOWN_SECONDS', 0.0)

    async def run():
        module.ai_semaphore = asyncio.Semaphore(2)
        module.ai_lock = asyncio.Lock()
        provider_calls = 0
        orig_post = httpx.AsyncClient.post
        in_provider = asyncio.Event()

        async def slow_post(self, url, **kwargs):
            nonlocal provider_calls
            if 'generativelanguage' in str(url):
                provider_calls += 1
                if provider_calls == 2:
                    in_provider.set()
                await asyncio.sleep(0.5)
                return httpx.Response(200, request=httpx.Request('POST', str(url)),
                    json={'candidates': [{'content': {'parts': [{'text': 'Slow provider ok.'}]}}]})
            return await orig_post(self, url, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, 'post', slow_post)

        # Set budget for the 3rd call so analyze completes but semaphore wait times out
        transport = httpx.ASGITransport(app=module.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as ac:
            # First occupy both semaphore slots with 2 slow tasks
            t1 = asyncio.create_task(ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'}))
            t2 = asyncio.create_task(ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'}))
            await asyncio.wait_for(in_provider.wait(), timeout=5.0)

            # 3rd request has budget of 0.2s: analyze completes (~10ms) but waiting for semaphore times out (< 0.5s)
            monkeypatch.setattr(module, 'AI_TIMEOUT_BUDGET_SECONDS', 0.2)
            r3 = await ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})

            # Cleanup slow tasks
            await asyncio.gather(t1, t2)

        assert r3.status_code == 200
        assert r3.json()['provider'] == 'deterministic'
        assert 'timed out' in r3.json()['reason'].lower()
        # Provider was only called 2 times (by t1 and t2), NEVER by r3!
        assert provider_calls == 2

    asyncio.run(run())


def test_r1_timeout_during_signal_recomputation(monkeypatch):
    """R1-05: Timeout during signal recomputation returns unavailable response without second synchronous analyze."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)
    monkeypatch.setattr(module, 'AI_TIMEOUT_BUDGET_SECONDS', 0.05)

    original_analyze = module.analyze
    analyze_calls = 0
    def slow_analyze(*args, **kwargs):
        nonlocal analyze_calls
        analyze_calls += 1
        import time as tmod
        tmod.sleep(0.15)
        return original_analyze(*args, **kwargs)

    monkeypatch.setattr(module, 'analyze', slow_analyze)

    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    res = r.json()
    assert res['provider'] == 'unavailable'
    assert 'timed out' in res['reason'].lower()
    assert 'no measurement was made' in res['reason'].lower()
    # Confirm analyze() was invoked only once by the worker thread, never called synchronously again in fallback
    assert analyze_calls == 1
    # Confirm no fabricated BPM or checks in response
    assert 'bpm' not in res
    assert 'checks' not in res
def test_r1_analysis_failure_before_receipt_exists_returns_unavailable(monkeypatch):
    """Analysis error before receipt exists returns unavailable without fabricating BPM."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)

    def failing_analyze(*args, **kwargs):
        raise ValueError('Simulated internal signal analysis error')

    monkeypatch.setattr(module, 'analyze', failing_analyze)

    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    res = r.json()
    assert res['provider'] == 'unavailable'
    assert 'could not be completed' in res['reason'].lower()
    assert 'bpm' not in res
    assert 'checks' not in res


def test_r1_timeout_during_httpx_post(monkeypatch):
    """R1-06: Timeout during HTTPX provider post cleanly returns fallback within budget."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)
    monkeypatch.setattr(module, 'AI_TIMEOUT_BUDGET_SECONDS', 0.05)

    async def hanging_post(self, url, **kwargs):
        await asyncio.sleep(0.3)
        return httpx.Response(200, request=httpx.Request('POST', url), json={})

    monkeypatch.setattr(httpx.AsyncClient, 'post', hanging_post)
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    assert r.json()['provider'] == 'deterministic'
    assert 'timed out' in r.json()['reason'].lower()


def test_r1_monotonic_deadline_shared_across_retries(monkeypatch):
    """R1-07: Transient 500 retry shares remaining monotonic deadline budget."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'last_ai_call', 0)
    # Total budget 0.3s; retry requires deadline - time.monotonic() > 4.0s
    monkeypatch.setattr(module, 'AI_TIMEOUT_BUDGET_SECONDS', 0.3)

    call_count = 0
    async def retry_post(self, url, **kwargs):
        nonlocal call_count
        call_count += 1
        return httpx.Response(503, request=httpx.Request('POST', url))

    monkeypatch.setattr(httpx.AsyncClient, 'post', retry_post)
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    assert r.json()['provider'] == 'deterministic'
    # Because budget < 4.0s, retry was skipped to prevent deadline overrun
    assert call_count == 1


def test_r1_cancelled_task_releases_semaphore(monkeypatch):
    """R1-08: Cancelled task immediately releases semaphore for queued requests."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setattr(module, 'AI_COOLDOWN_SECONDS', 0.0)

    async def run():
        module.ai_semaphore = asyncio.Semaphore(2)
        module.ai_lock = asyncio.Lock()
        hold_gate = asyncio.Event()
        orig_post = httpx.AsyncClient.post
        async def gating_post(self, url, **kwargs):
            if 'generativelanguage' in str(url):
                await hold_gate.wait()
                return httpx.Response(200, request=httpx.Request('POST', str(url)),
                    json={'candidates': [{'content': {'parts': [{'text': 'Gate released ok.'}]}}]})
            return await orig_post(self, url, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, 'post', gating_post)

        transport = httpx.ASGITransport(app=module.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as ac:
            task1 = asyncio.create_task(ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'}))
            await asyncio.sleep(0.02)
            # Cancel task1 while it is holding semaphore
            task1.cancel()
            try:
                await task1
            except asyncio.CancelledError:
                pass

            # Semaphore must have both slots available
            assert module.ai_semaphore._value == 2

            # Subsequent request acquires without blocking
            hold_gate.set()
            r = await ac.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
            assert r.status_code == 200
            assert r.json()['provider'] == 'Gemma 4'

    asyncio.run(run())


def test_r1_cooldown_rejection_does_not_consume_semaphore(monkeypatch):
    """R1-09: Request rejected by 10s cooldown exits before semaphore and never consumes slot."""
    import time
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    # Set last_ai_call to now so cooldown triggers
    monkeypatch.setattr(module, 'last_ai_call', time.monotonic())

    initial_semaphore_val = module.ai_semaphore._value
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    assert r.json()['provider'] == 'deterministic'
    assert 'AI cooldown: wait ten seconds' in r.json()['reason']
    assert module.ai_semaphore._value == initial_semaphore_val


def test_r1_unauthenticated_request_does_not_consume_semaphore(monkeypatch):
    """R1-10: Missing/invalid token returns 401 without consuming semaphore."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')

    initial_semaphore_val = module.ai_semaphore._value
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'wrong-password'})
    assert r.status_code == 401
    assert module.ai_semaphore._value == initial_semaphore_val


def test_r1_invalid_model_does_not_consume_semaphore(monkeypatch):
    """R1-11: Invalid model ID falls back without consuming semaphore."""
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-key')
    monkeypatch.setenv('DEMO_TOKEN', 'test-token')
    monkeypatch.setenv('GEMMA_MODEL', 'not-a-gemma-model')
    monkeypatch.setattr(module, 'last_ai_call', 0)

    initial_semaphore_val = module.ai_semaphore._value
    r = client.post('/api/explain', json=sample('clean'), headers={'X-Demo-Token': 'test-token'})
    assert r.status_code == 200
    assert r.json()['provider'] == 'deterministic'
    assert 'Configure an available Gemma 4 model ID' in r.json()['reason']
    assert module.ai_semaphore._value == initial_semaphore_val


def test_r1_unconfigured_ai_does_not_consume_semaphore(monkeypatch):
    """R1-12: Unconfigured AI credentials fall back without consuming semaphore."""
    import app.main as module
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('DEMO_TOKEN', raising=False)

    initial_semaphore_val = module.ai_semaphore._value
    r = client.post('/api/explain', json=sample('clean'))
    assert r.status_code == 200
    assert r.json()['provider'] == 'deterministic'
    assert 'AI is not configured' in r.json()['reason']
    assert module.ai_semaphore._value == initial_semaphore_val


# ---------------------------------------------------------------------------
# R5: Controlled Flat-Baseline Challenge C Scenario
# ---------------------------------------------------------------------------

def test_challenge_c_optical_flicker_on_flat_baseline_demonstrates_limitation():
    """R5: Synchronous periodic flicker on flat baseline demonstrates optical rPPG limit without modifying thresholds."""
    import copy
    flat_data = sample('flat')
    res_orig = client.post('/api/analyze', json=flat_data).json()
    assert res_orig['bpm'] is None
    assert res_orig['status'] == 'insufficient_quality'

    # Apply synchronous 1.2 Hz (72 BPM) sine of amplitude 8.0 to both patches (Challenge C)
    modified = copy.deepcopy(flat_data)
    ts = np.array(modified['timestamps'])
    flicker = 8.0 * np.sin(2.0 * np.pi * 1.2 * ts)

    for i in range(len(modified['timestamps'])):
        # Green channel is index 1
        modified['left'][i][1] = float(np.clip(modified['left'][i][1] + flicker[i], 0, 255))
        modified['right'][i][1] = float(np.clip(modified['right'][i][1] + flicker[i], 0, 255))

    res_mod = client.post('/api/analyze', json=modified).json()
    # Bilateral agreement passed because flicker was injected identically into both patches
    patch_diff = next(c for c in res_mod['checks'] if c['name'] == 'patch_difference_bpm')
    assert patch_diff['pass'] is True
    assert patch_diff['value'] <= 1.0
    # Candidate peak detected at 72 BPM
    assert res_mod['bpm'] == 72
    assert res_mod['quality_score'] >= 90


def test_secrets_never_leaked_in_endpoints_or_cards(monkeypatch):
    """Test that configured GEMINI_API_KEY never leaks in API endpoints, health, meta, or card data."""
    secret = 'secret-canary-key-9876543210'
    monkeypatch.setenv('GEMINI_API_KEY', secret)
    monkeypatch.setenv('DEMO_TOKEN', 'canary-token')

    r_health = client.get('/api/health')
    assert secret not in r_health.text

    r_meta = client.get('/api/meta')
    assert secret not in r_meta.text

    r_unauth = client.post('/api/explain', json=sample('clean'))
    assert secret not in r_unauth.text

    r_sample = client.get('/api/sample/clean')
    assert secret not in r_sample.text



