"""Regression tests for video fixture timing, decoding, and quality gate abstention."""
import subprocess
from pathlib import Path
import numpy as np
import pytest
from app.signal import analyze

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

ROOT = Path(__file__).resolve().parent.parent


def decode_video_to_trace(video_path: Path, source: str = 'synthetic') -> dict:
    """Decodes a video file to derived RGB patch traces matching the browser 160x120 pipeline."""
    cmd = [
        FFMPEG, '-i', str(video_path),
        '-fps_mode', 'passthrough',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-s', '160x120',
        '-'
    ]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    frames_bytes = p.stdout.read()
    p.wait()
    assert p.returncode == 0, f"FFmpeg failed to decode {video_path}"

    num_frames = len(frames_bytes) // (160 * 120 * 3)
    raw = np.frombuffer(frames_bytes, dtype=np.uint8).reshape((num_frames, 120, 160, 3))

    # Normalized cheek ROIs matching web/app.js colors():
    # Left: x=51..70, y=58..72 (19x14)
    # Right: x=90..109, y=58..72 (19x14)
    x1, x2, w = 51, 90, 19
    y, h = 58, 14

    left_means = raw[:, y:y+h, x1:x1+w, :].mean(axis=(1, 2))
    right_means = raw[:, y:y+h, x2:x2+w, :].mean(axis=(1, 2))

    # Also inspect actual frame presentation timestamps using showinfo
    cmd_info = [FFMPEG, '-i', str(video_path), '-vf', 'showinfo', '-f', 'null', '-']
    p_info = subprocess.run(cmd_info, capture_output=True, text=True)
    pts = [float(l.split('pts_time:')[1].split()[0]) for l in p_info.stderr.splitlines() if 'pts_time:' in l]
    if len(pts) != num_frames:
        raise ValueError(f"Timestamp extraction mismatch: extracted {len(pts)} timestamps for {num_frames} frames from {video_path}")

    return {
        'source': source,
        'timestamps': pts,
        'left': left_means.round(5).tolist(),
        'right': right_means.round(5).tolist(),
        'clipping': [0.0] * num_frames
    }


def test_normal_30s_video_passes_all_14_gates():
    video_path = ROOT / 'samples' / 'test_video_30s.webm'
    assert video_path.is_file(), f"Missing {video_path}"
    trace = decode_video_to_trace(video_path, source='synthetic')

    assert len(trace['timestamps']) == 900
    duration = trace['timestamps'][-1] - trace['timestamps'][0]
    assert 29.8 <= duration <= 30.2

    # Verify no gap exceeds the 0.2s gate threshold
    dt = np.diff(trace['timestamps'])
    assert dt.max() <= 0.05, f"Unexpected timestamp gap: {dt.max():.4f}s"
    assert (np.std(dt) / np.mean(dt)) <= 0.05

    result = analyze(trace)
    assert result['status'] == 'accepted_experimental'
    assert result['bpm'] is not None
    assert abs(result['bpm'] - 72) <= 1
    assert result['quality_score'] == 100
    assert all(c['pass'] for c in result['checks'])


def test_short_12s_video_withholds_bpm_on_duration_gate():
    video_path = ROOT / 'samples' / 'test_video_12s.webm'
    assert video_path.is_file(), f"Missing {video_path}"
    trace = decode_video_to_trace(video_path, source='synthetic')

    assert len(trace['timestamps']) == 360
    duration = trace['timestamps'][-1] - trace['timestamps'][0]
    assert 11.8 <= duration <= 12.2

    result = analyze(trace)
    assert result['bpm'] is None
    assert result['status'] == 'insufficient_quality'
    failed = [c['name'] for c in result['checks'] if not c['pass']]
    assert failed == ['duration_seconds'], f"Expected only duration_seconds to fail, got {failed}"
    assert result['quality_score'] == round(100 * 13 / 14)


def test_gapped_video_withholds_bpm_on_timing_gates():
    video_path = ROOT / 'samples' / 'test_video_gapped.webm'
    assert video_path.is_file(), f"Missing {video_path}"
    trace = decode_video_to_trace(video_path, source='synthetic')

    result = analyze(trace)
    assert result['bpm'] is None
    assert result['status'] == 'insufficient_quality'
    failed = [c['name'] for c in result['checks'] if not c['pass']]
    assert 'largest_gap_seconds' in failed
    assert 'timing_variation' in failed


def test_irregular_frame_timing_gate():
    from app.signal import sample
    d = sample()
    rng = np.random.default_rng(77)
    # Add random jitter to timestamps to violate timing_variation <= 0.35
    t = np.sort(np.array(d['timestamps']) + rng.normal(0, 0.03, len(d['timestamps'])))
    # Ensure strictly increasing
    for i in range(1, len(t)):
        if t[i] <= t[i-1]:
            t[i] = t[i-1] + 0.001
    d['timestamps'] = t.tolist()
    r = analyze(d)
    assert r['bpm'] is None
    assert not next(c for c in r['checks'] if c['name'] == 'timing_variation')['pass']


def test_repeated_frame_callbacks_rejected():
    from app.signal import sample
    d = sample()
    # Duplicate a frame timestamp to simulate duplicate callback
    d['timestamps'][10] = d['timestamps'][9]
    with pytest.raises(ValueError, match="Timestamps must be strictly increasing seconds"):
        analyze(d)


def test_non_monotonic_timestamps_rejected():
    from app.signal import sample
    d = sample()
    d['timestamps'][20] = d['timestamps'][19] - 0.01
    with pytest.raises(ValueError, match="Timestamps must be strictly increasing seconds"):
        analyze(d)


def test_out_of_bounds_duration_rejected():
    from app.signal import sample
    # Less than 10 seconds rejected at validation boundary
    d = sample()
    d['timestamps'] = d['timestamps'][:200]  # 6.66 seconds
    d['left'] = d['left'][:200]
    d['right'] = d['right'][:200]
    d['clipping'] = d['clipping'][:200]
    with pytest.raises(ValueError, match="Use 10-60 seconds"):
        analyze(d)
