#!/usr/bin/env python3
"""Generate trusted fixture manifest containing cryptographic hashes of project fixtures.
Enforces deterministic content-hash verification instead of filename-based inference.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / 'samples'
WEB = ROOT / 'web'

def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def build_manifest():
    manifest = {
        'schema_version': '1.0',
        'description': 'Authoritative content hashes for HiperPulse deterministic synthetic fixtures',
        'video_fixtures': {},
        'trace_fixtures': {}
    }

    # Video fixtures in samples/
    video_files = [
        ('test_video_30s.webm', 30.0, 'Synthetic constant 30s WebM face pulse fixture (72 BPM)'),
        ('test_video_12s.webm', 12.0, 'Synthetic short 12s WebM face pulse fixture (fails duration gate)'),
        ('test_video_gapped.webm', 27.0, 'Synthetic 27s WebM face pulse fixture with 2s gap (fails continuity gate)'),
        ('test_video_30s.mp4', 30.0, 'Synthetic constant 30s MP4 face pulse fixture (72 BPM)'),
        ('test_video_12s.mp4', 12.0, 'Synthetic short 12s MP4 face pulse fixture')
    ]

    for fname, duration, desc in video_files:
        fpath = SAMPLES / fname
        if fpath.is_file():
            sha = hash_file(fpath)
            manifest['video_fixtures'][sha] = {
                'fixture_id': fname,
                'duration_seconds': duration,
                'sha256': sha,
                'size_bytes': fpath.stat().st_size,
                'source': 'synthetic',
                'description': desc
            }

    # Trace fixtures
    trace_files = [
        ('clean.json', 'Synthetic clean 72 BPM two-patch RGB trace (100% checks passed)'),
        ('artifact.json', 'Synthetic artifact two-patch RGB trace (withheld estimate)'),
        ('flat.json', 'Synthetic flat two-patch RGB trace (withheld estimate)')
    ]

    for fname, desc in trace_files:
        fpath = SAMPLES / fname
        if fpath.is_file():
            data = json.loads(fpath.read_text(encoding='utf-8'))
            # Compute canonical signal SHA
            canonical = {
                'timestamps': [round(float(t), 5) for t in data['timestamps']],
                'left': [[round(float(v), 5) for v in row] for row in data['left']],
                'right': [[round(float(v), 5) for v in row] for row in data['right']],
                'clipping': [round(float(c), 5) for c in data.get('clipping', [])]
            }
            signal_sha = hashlib.sha256(
                json.dumps(canonical, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
            ).hexdigest()
            file_sha = hash_file(fpath)
            manifest['trace_fixtures'][signal_sha] = {
                'fixture_id': fname,
                'file_sha256': file_sha,
                'signal_sha256': signal_sha,
                'source': 'synthetic',
                'description': desc
            }

    out_json = json.dumps(manifest, indent=2, sort_keys=True)
    (SAMPLES / 'trusted_fixtures.json').write_text(out_json, encoding='utf-8')
    (WEB / 'trusted_fixtures.json').write_text(out_json, encoding='utf-8')
    print(f"Generated trusted_fixtures.json with {len(manifest['video_fixtures'])} video fixtures and {len(manifest['trace_fixtures'])} trace fixtures.")
    return manifest

if __name__ == '__main__':
    build_manifest()
