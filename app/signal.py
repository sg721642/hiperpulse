"""Experimental GREEN baseline; quality heuristics are not accuracy probabilities."""
import hashlib
import json
import numpy as np
from scipy import signal as sp

VERSION = 'green-evidence-1.1'
LIMITATION = ('Experimental pulse-like periodicity only. Not clinically validated. '
              'Lighting or motion can imitate a pulse even when checks pass. '
              'No diagnosis, blood pressure, or oxygen saturation.')


def sample(kind='clean'):
    """Deterministic synthetic RGB traces, never patient measurements."""
    rng = np.random.default_rng(42)
    t = np.arange(900) / 30
    p = np.sin(2*np.pi*1.2*t) + .15*np.sin(2*np.pi*2.4*t)
    left = 110 + 1.2*p + rng.normal(0, .12, len(t))
    right = 108 + 1.1*p + rng.normal(0, .12, len(t))
    if kind == 'artifact':
        right = 108 + 3*np.sin(2*np.pi*1.85*t) + rng.normal(0, .3, len(t))
    if kind == 'flat':
        left[:] = 110
        right[:] = 108
    rgb = lambda g: np.column_stack([g*.9, g, g*.75]).round(5).tolist()
    return {'source': 'synthetic', 'timestamps': t.tolist(), 'left': rgb(left),
            'right': rgb(right), 'clipping': [0.0]*len(t)}


def _peak(x, fs):
    f, power = sp.welch(x, fs=fs, nperseg=min(len(x), round(fs*10)),
                       nfft=max(2048, len(x)), detrend='linear')
    mask = (f >= .7) & (f <= 3)
    f, power = f[mask], power[mask]
    index = int(np.argmax(power))
    frequency = float(f[index])
    concentration = float(power[np.abs(f-frequency) <= .12].sum() / (power.sum()+1e-20))
    return frequency*60, concentration, f, power


def analyze(data):
    t = np.asarray(data['timestamps'], dtype=float)
    left, right = [np.asarray(data[k], dtype=float) for k in ('left', 'right')]
    clipping = np.asarray(data['clipping'], dtype=float)
    if t.ndim != 1 or not 150 <= len(t) <= 7200:
        raise ValueError('Provide 150 to 7200 timestamped samples.')
    if left.shape != (len(t), 3) or right.shape != left.shape or clipping.shape != t.shape:
        raise ValueError('timestamps, left RGB, right RGB and clipping must have equal lengths.')
    if not all(np.isfinite(v).all() for v in (t, left, right, clipping)):
        raise ValueError('All samples must be finite numbers.')
    if any(np.any((a < 0) | (a > 255)) for a in (left, right)):
        raise ValueError('RGB means must be in 0..255.')
    if np.any((clipping < 0) | (clipping > 1)):
        raise ValueError('Clipping fractions must be in 0..1.')
    dt = np.diff(t)
    if np.any(dt <= 0):
        raise ValueError('Timestamps must be strictly increasing seconds.')
    duration = float(t[-1]-t[0])
    fs = float(1/np.median(dt))
    if not 10 <= duration <= 60 or not 10 <= fs <= 120:
        raise ValueError('Use 10-60 seconds with a median sample rate of 10-120 Hz.')
    t = t-t[0]
    grid = np.arange(0, duration, 1/fs)
    sos = sp.butter(3, [.7, 3], btype='bandpass', fs=fs, output='sos')
    waves, peaks, concentrations = [], [], []
    for rgb in (left, right):
        green = np.interp(grid, t, rgb[:, 1])
        normalized = green / max(float(np.mean(green)), 1) - 1
        filtered = sp.sosfiltfilt(sos, sp.detrend(normalized))
        waves.append(filtered)
        bpm, concentration, _, _ = _peak(filtered, fs)
        peaks.append(bpm)
        concentrations.append(concentration)
    wave = (waves[0]+waves[1])/2
    candidate, concentration, freqs, power = _peak(wave, fs)
    half = len(wave)//2
    split_delta = abs(_peak(wave[:half], fs)[0]-_peak(wave[half:], fs)[0])
    ac = sp.correlate(wave, wave, mode='full', method='fft')[len(wave)-1:]
    ac = ac / max(float(ac[0]), 1e-20)
    lo, hi = int(np.ceil(fs/3)), int(np.floor(fs/.7))
    lag = lo + int(np.argmax(ac[lo:hi+1]))
    ac_bpm = 60*fs/lag
    amplitude = float(min(np.std(waves[0]), np.std(waves[1])))
    jitter = float(np.std(dt) / np.mean(dt))
    jump = float(max(np.quantile(np.abs(np.diff(a[:,1])), .95) /
                     max(np.mean(a[:,1]), 1) for a in (left,right)))
    patch1_mean = float(left[:,1].mean())
    patch2_mean = float(right[:,1].mean())
    min_light = min(patch1_mean, patch2_mean)
    max_light = max(patch1_mean, patch2_mean)
    exposure_passed = bool(20.0 <= min_light and max_light <= 235.0)
    reported_light = max_light if max_light > 235.0 else min_light
    def check(name, value, passed, rule, action, **extra):
        c = {'name':name, 'value':round(float(value),4), 'pass':bool(passed),
             'rule':rule, 'action':action}
        c.update(extra)
        return c
    checks = [
        check('duration_seconds', duration, duration >= 20, '>= 20 s', 'Record for 30 seconds.'),
        check('sample_rate_hz', fs, fs >= 15, '>= 15 Hz', 'Use a faster device; close other apps.'),
        check('largest_gap_seconds', dt.max(), dt.max() <= .2, '<= 0.2 s', 'Keep the tab visible and retry.'),
        check('timing_variation', jitter, jitter <= .35, '<= 0.35', 'Keep the tab visible and retry.'),
        check('mean_green', reported_light, exposure_passed, 'both 20..235 /255',
              'Use even, indirect lighting; ensure neither patch is dark (<20) or washed out (>235).',
              patch1_mean=round(patch1_mean, 4), patch2_mean=round(patch2_mean, 4)),
        check('clipped_pixel_fraction', clipping.mean(), clipping.mean() <= .05, '<= 0.05', 'Reduce glare or deep shadows.'),
        check('color_jump_proxy', jump, jump <= .025, '<= 0.025', 'Hold still and keep lighting steady.'),
        check('relative_signal_std', amplitude, amplitude >= .0002, '>= 0.0002', 'Re-align both patches onto bare cheeks.'),
        check('spectral_concentration', min(concentrations), min(concentrations) >= .50, '>= 0.50', 'Reduce motion and lighting changes.'),
        check('patch_difference_bpm', abs(peaks[0]-peaks[1]), abs(peaks[0]-peaks[1]) <= 8, '<= 8 BPM', 'Keep both patches on cheeks.'),
        check('half_difference_bpm', split_delta, split_delta <= 10, '<= 10 BPM', 'Record a stable, stationary interval.'),
        check('estimator_difference_bpm', abs(candidate-ac_bpm), abs(candidate-ac_bpm) <= 10, '<= 10 BPM', 'Retry; repeating patterns are ambiguous.'),
        check('autocorrelation', ac[lag], ac[lag] >= .45, '>= 0.45', 'Reduce noise and repeat the capture.'),
        check('search_boundary_bpm', candidate, 45 <= candidate <= 177, '45..177 BPM', 'Estimate is near the supported search boundary; do not interpret it.'),
    ]
    accepted = all(c['pass'] for c in checks)
    score = round(100*sum(c['pass'] for c in checks)/len(checks))
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',',':'),
                                      allow_nan=False).encode()).hexdigest()
    canonical_signal = {
        'timestamps': [round(float(t), 5) for t in data['timestamps']],
        'left': [[round(float(v), 5) for v in row] for row in data['left']],
        'right': [[round(float(v), 5) for v in row] for row in data['right']],
        'clipping': [round(float(c), 5) for c in data['clipping']]
    }
    signal_digest = hashlib.sha256(json.dumps(canonical_signal, sort_keys=True,
                                             separators=(',',':'), allow_nan=False).encode()).hexdigest()
    stride = max(1, int(np.ceil(len(grid)/600)))
    display = wave / max(float(np.std(wave)), 1e-12)
    return {'schema_version':1, 'algorithm':VERSION, 'source':data['source'],
            'ingestion':data.get('ingestion', 'direct'),
            'input_sha256':digest, 'signal_sha256':signal_digest,
            'exposure_metrics':{'patch1_mean':round(patch1_mean, 4), 'patch2_mean':round(patch2_mean, 4),
                                'min_mean':round(min_light, 4), 'max_mean':round(max_light, 4)},
            'status':'accepted_experimental' if accepted else 'insufficient_quality',
            'bpm':round(candidate) if accepted else None, 'quality_score':score,
            'quality_label':'Checks passed' if accepted else 'Retake / inspect sample',
            'score_meaning':'Percent of heuristic checks passed; not a probability of accuracy.',
            'checks':checks, 'limitations':LIMITATION,
            'waveform':{'seconds':grid[::stride].round(4).tolist(),
                        'normalized_amplitude':display[::stride].round(5).tolist()},
            'spectrum':{'bpm':(freqs*60).round(2).tolist(),
                        'relative_power':(power/max(float(power.max()),1e-20)).round(5).tolist()}}
