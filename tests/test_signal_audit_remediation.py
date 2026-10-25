"""Targeted regression tests for signal-processing audit and diagnostics."""
from copy import deepcopy
import numpy as np
import pytest
from app.signal import analyze, sample, VERSION, _SPECTRAL_LOW_HZ, _SPECTRAL_HIGH_HZ, _ACCEPT_LOW_BPM, _ACCEPT_HIGH_BPM


def test_clean_sample_retains_identical_acceptance():
    """Verify clean synthetic sample maintains 72 BPM and 100% quality score."""
    res = analyze(sample('clean'))
    assert res['bpm'] == 72
    assert res['quality_score'] == 100
    assert res['status'] == 'accepted_experimental'
    assert res['algorithm'] == 'green-evidence-1.1'
    assert len(res['checks']) == 14
    assert all(c['pass'] for c in res['checks'])


def test_spectral_concentration_per_cheek_diagnostics():
    """Verify per-cheek spectral concentration and peak frequencies are exposed as diagnostics."""
    res = analyze(sample('clean'))
    sc = next(c for c in res['checks'] if c['name'] == 'spectral_concentration')
    assert 'left_concentration' in sc
    assert 'right_concentration' in sc
    assert 'left_peak_bpm' in sc
    assert 'right_peak_bpm' in sc
    assert 'weaker_cheek' in sc
    assert sc['weaker_cheek'] in ('left', 'right')
    assert 0.0 <= sc['left_concentration'] <= 1.0
    assert 0.0 <= sc['right_concentration'] <= 1.0
    assert 40.0 <= sc['left_peak_bpm'] <= 180.0
    assert 40.0 <= sc['right_peak_bpm'] <= 180.0


def test_weaker_cheek_identification_asymmetric():
    """Verify weaker cheek is accurately identified when one cheek has degraded periodicity."""
    base = sample('clean')
    
    # Degrade left cheek with noise
    d_left_noisy = deepcopy(base)
    rng = np.random.default_rng(101)
    for i in range(len(d_left_noisy['left'])):
        d_left_noisy['left'][i][1] += rng.normal(0, 3.0)
    res_ln = analyze(d_left_noisy)
    sc_ln = next(c for c in res_ln['checks'] if c['name'] == 'spectral_concentration')
    assert sc_ln['weaker_cheek'] == 'left'
    assert sc_ln['left_concentration'] < sc_ln['right_concentration']

    # Degrade right cheek with noise
    d_right_noisy = deepcopy(base)
    for i in range(len(d_right_noisy['right'])):
        d_right_noisy['right'][i][1] += rng.normal(0, 3.0)
    res_rn = analyze(d_right_noisy)
    sc_rn = next(c for c in res_rn['checks'] if c['name'] == 'spectral_concentration')
    assert sc_rn['weaker_cheek'] == 'right'
    assert sc_rn['right_concentration'] < sc_rn['left_concentration']


def test_autocorrelation_diagnostic_metadata():
    """Verify autocorrelation check exposes lag, candidate BPM, and search range diagnostics."""
    res = analyze(sample('clean'))
    ac = next(c for c in res['checks'] if c['name'] == 'autocorrelation')
    assert 'ac_lag_samples' in ac
    assert 'ac_lag_bpm' in ac
    assert 'ac_search_bpm_range' in ac
    assert isinstance(ac['ac_lag_samples'], int)
    assert ac['ac_lag_samples'] > 0
    assert isinstance(ac['ac_lag_bpm'], float)
    assert abs(ac['ac_lag_bpm'] - 72.0) <= 2.0
    assert len(ac['ac_search_bpm_range']) == 2
    assert ac['ac_search_bpm_range'][0] < ac['ac_search_bpm_range'][1]


def test_search_band_vs_acceptance_window_semantics():
    """Verify search range (0.7-3.0 Hz / 42-180 BPM) vs acceptance window (45-177 BPM)."""
    assert _SPECTRAL_LOW_HZ == 0.7
    assert _SPECTRAL_HIGH_HZ == 3.0
    assert _ACCEPT_LOW_BPM == 45
    assert _ACCEPT_HIGH_BPM == 177

    # Synthetic signal at 43 BPM (inside 0.7-3.0 Hz search range, outside 45-177 BPM acceptance window)
    t = np.arange(900) / 30.0
    p43 = np.sin(2 * np.pi * (43.0 / 60.0) * t)
    g43 = 110.0 + 1.2 * p43
    rgb43 = np.column_stack([g43 * 0.9, g43, g43 * 0.75]).round(5).tolist()
    d43 = {
        'source': 'synthetic',
        'timestamps': t.tolist(),
        'left': rgb43,
        'right': rgb43,
        'clipping': [0.0] * len(t)
    }
    r43 = analyze(d43)
    sb_check = next(c for c in r43['checks'] if c['name'] == 'search_boundary_bpm')
    assert sb_check['pass'] is False
    assert r43['bpm'] is None
    assert 'acceptance window' in sb_check['rule']


def test_canonical_signal_hash_unaffected_by_diagnostic_fields():
    """Verify signal_sha256 is derived strictly from raw numeric traces and is invariant."""
    d = sample('clean')
    res1 = analyze(d)
    res2 = analyze(deepcopy(d))
    assert res1['signal_sha256'] == res2['signal_sha256']
    assert res1['input_sha256'] == res2['input_sha256']


def test_no_false_acceptance_on_noise_and_artifacts():
    """Verify all standard negative cases continue to withhold BPM strictly."""
    # Flat trace
    assert analyze(sample('flat'))['bpm'] is None

    # Artifact trace
    assert analyze(sample('artifact'))['bpm'] is None

    # Pure Gaussian noise
    rng = np.random.default_rng(2026)
    noise_trace = deepcopy(sample('clean'))
    noise_trace['left'] = (100.0 + rng.normal(0, 5.0, (900, 3))).tolist()
    noise_trace['right'] = (100.0 + rng.normal(0, 5.0, (900, 3))).tolist()
    r_noise = analyze(noise_trace)
    assert r_noise['bpm'] is None
    assert r_noise['status'] == 'insufficient_quality'
