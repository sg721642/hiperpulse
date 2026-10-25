#!/usr/bin/env python3
"""
HiperPulse Local Offline Trace Diagnostic Tool.
Privacy-preserving: Runs entirely locally with NO network or cloud API calls.
Inspects a consented RGB trace JSON file and prints a comprehensive
signal-processing and quality gate report.
"""
import argparse
import json
from pathlib import Path
import sys

import numpy as np
from scipy import signal as sp

# Add repo root to import path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.signal import analyze, _SPECTRAL_LOW_HZ, _SPECTRAL_HIGH_HZ, _ACCEPT_LOW_BPM, _ACCEPT_HIGH_BPM


def diagnose(trace_data: dict, verbose: bool = False):
    print("=" * 68)
    print("         HIPERPULSE LOCAL TRACE SIGNAL DIAGNOSTICS")
    print("=" * 68)

    # 1. Run standard signal analysis
    try:
        receipt = analyze(trace_data)
    except Exception as e:
        print(f"\n[ERROR] Analysis failed: {e}")
        return

    # 2. Extract trace properties
    timestamps = np.asarray(trace_data['timestamps'], dtype=float)
    left = np.asarray(trace_data['left'], dtype=float)
    right = np.asarray(trace_data['right'], dtype=float)
    clipping = np.asarray(trace_data.get('clipping', [0.0] * len(timestamps)), dtype=float)

    dt = np.diff(timestamps)
    duration = float(timestamps[-1] - timestamps[0])
    fs = float(1.0 / np.median(dt))
    jitter = float(np.std(dt) / np.mean(dt))
    largest_gap = float(dt.max())

    p1_mean = float(left[:, 1].mean())
    p2_mean = float(right[:, 1].mean())
    p_diff = abs(p1_mean - p2_mean)

    print(f"\n[INPUT PROVENANCE & TIMING]")
    print(f"  Declared Source:    {trace_data.get('source', 'unknown')}")
    print(f"  Ingestion Method:   {trace_data.get('ingestion', 'direct')}")
    print(f"  Sample Count:       {len(timestamps)} frames")
    print(f"  Duration:           {duration:.4f} s (minimum: 20.0 s)")
    print(f"  Median Sample Rate: {fs:.3f} Hz (minimum: 15.0 Hz)")
    print(f"  Timing Variation:   {jitter:.4f} (maximum: 0.35)")
    print(f"  Largest Frame Gap:  {largest_gap:.4f} s (maximum: 0.20 s)")
    print(f"  Canonical Hash:     {receipt['signal_sha256'][:16]}...")

    print(f"\n[PHOTOMETRIC EXPOSURE]")
    print(f"  Left Patch Green:   {p1_mean:.2f} / 255")
    print(f"  Right Patch Green:  {p2_mean:.2f} / 255")
    print(f"  Bilateral Delta:    {p_diff:.2f} units (warning if > 35)")
    print(f"  Clipped Fraction:   {clipping.mean():.4f} (maximum: 0.05)")

    sc_check = next(c for c in receipt['checks'] if c['name'] == 'spectral_concentration')
    ac_check = next(c for c in receipt['checks'] if c['name'] == 'autocorrelation')
    sb_check = next(c for c in receipt['checks'] if c['name'] == 'search_boundary_bpm')

    print(f"\n[PERIODICITY & ESTIMATOR EVIDENCE]")
    print(f"  Left Cheek Spectral:  {sc_check.get('left_concentration', 'N/A')} conc @ {sc_check.get('left_peak_bpm', 'N/A')} BPM")
    print(f"  Right Cheek Spectral: {sc_check.get('right_concentration', 'N/A')} conc @ {sc_check.get('right_peak_bpm', 'N/A')} BPM")
    print(f"  Weaker Cheek:         {sc_check.get('weaker_cheek', 'N/A').upper()}")
    print(f"  Min Concentration:    {sc_check['value']} (required: >= 0.50) -> {'PASS' if sc_check['pass'] else 'FAIL'}")
    print(f"  Autocorrelation Lag:  {ac_check.get('ac_lag_samples', 'N/A')} samples ≈ {ac_check.get('ac_lag_bpm', 'N/A')} BPM")
    print(f"  Autocorrelation Peak: {ac_check['value']} (required: >= 0.45) -> {'PASS' if ac_check['pass'] else 'FAIL'}")
    print(f"  Candidate Frequency:  {sb_check['value']} BPM (search range: {_SPECTRAL_LOW_HZ*60:.0f}–{_SPECTRAL_HIGH_HZ*60:.0f} BPM, acceptance: {_ACCEPT_LOW_BPM}–{_ACCEPT_HIGH_BPM} BPM)")

    print(f"\n[QUALITY GATE BREAKDOWN (14 CHECKS)]")
    for c in receipt['checks']:
        status_icon = "✓ PASS" if c['pass'] else "✗ FAIL"
        print(f"  {status_icon:8s} | {c['name']:24s} | value: {str(c['value']):>8s} | rule: {c['rule']}")

    pass_count = sum(1 for c in receipt['checks'] if c['pass'])
    print(f"\n[DECISION SUMMARY]")
    print(f"  Quality Score: {receipt['quality_score']}% ({pass_count}/14 checks passed)")
    print(f"  Result Status: {receipt['status'].upper()}")
    print(f"  Reported BPM:  {receipt['bpm'] if receipt['bpm'] is not None else 'WITHHELD (null)'}")

    if receipt['bpm'] is None:
        failed_checks = [c['name'] for c in receipt['checks'] if not c['pass']]
        print(f"\n[DIAGNOSTIC GUIDANCE FOR RETAKE]")
        print(f"  Failed gates: {', '.join(failed_checks)}")
        if 'spectral_concentration' in failed_checks or 'autocorrelation' in failed_checks:
            weaker = sc_check.get('weaker_cheek', 'unknown')
            print(f"  • Periodicity issue: The {weaker} cheek had weaker spectral evidence.")
            print(f"    Check that the {weaker} guide box squarely covers smooth cheek skin without hair or shadows.")
            print(f"  • Rest chin on a stable surface to eliminate micro-motion during the 30 seconds.")
            print(f"  • Ensure lighting is indirect and steady (avoid backlight or AC mains flicker).")

    print("=" * 68)


def main():
    parser = argparse.ArgumentParser(description="HiperPulse Local Trace Diagnostic Tool")
    parser.add_argument("trace_file", type=str, help="Path to a trace JSON file")
    parser.add_argument("--verbose", action="store_true", help="Show additional debugging info")
    args = parser.parse_args()

    path = Path(args.trace_file)
    if not path.is_file():
        print(f"Error: File not found: {path}")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"Error: Failed to parse JSON: {e}")
            sys.exit(1)

    diagnose(data, verbose=args.verbose)


if __name__ == "__main__":
    main()
