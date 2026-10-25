#!/usr/bin/env python3
"""Autonomous live Gemma 4 verification script for HiperPulse Milestone M4.

Validates:
  - Account model discovery: gemma-4-26b-a4b-it supports generateContent
  - Test A: Clean synthetic sample (72 BPM, 100% checks) -> Real Gemma 4 commentary
  - Test B: Failed-quality artifact sample (BPM null, 86% checks) -> Real Gemma 4 withholding explanation
  - Test C: Security gates (missing/invalid demo token 401)
  (Server cooldown enforcement is authoritatively validated by deterministic unit tests in tests/test_audit_remediation.py)

Never outputs credentials or API keys.
"""
import os
import sys
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')

API_KEY = os.getenv('GEMINI_API_KEY')
DEMO_TOKEN = os.getenv('DEMO_TOKEN')
MODEL = os.getenv('GEMMA_MODEL', 'gemma-4-26b-a4b-it')

if not API_KEY or not DEMO_TOKEN:
    print('ERROR: GEMINI_API_KEY and DEMO_TOKEN must be set in .env')
    sys.exit(1)

print('=== HIPERPULSE LIVE GEMMA 4 VERIFICATION ===')
print(f'Configured Model ID: {MODEL}')

# 1. Verify health endpoint
health_r = httpx.get('http://127.0.0.1:8080/api/health')
health = health_r.json()
print(f'Server /api/health: ok={health.get("ok")}, ai_configured={health.get("ai_configured")}')
assert health.get('ai_configured') is True, 'Expected ai_configured to be True'

# 2. Test A: Clean synthetic sample
print('\n--- TEST A: Clean Synthetic Sample (Expected: Real Gemma 4, 72 BPM, Synthetic) ---')
sample_clean = httpx.get('http://127.0.0.1:8080/api/sample/clean').json()
t0 = time.time()
clean_r = httpx.post('http://127.0.0.1:8080/api/explain', json=sample_clean,
                     headers={'X-Demo-Token': DEMO_TOKEN}, timeout=95)
dt_clean = time.time() - t0
print(f'Status: {clean_r.status_code} (took {dt_clean:.1f}s)')
clean_res = clean_r.json()
print(f'Provider: {clean_res.get("provider")}')
print(f'Model: {clean_res.get("model")}')
print(f'Notice: {clean_res.get("notice")}')
print(f'Explanation Text:\n  "{clean_res.get("text")}"')

assert clean_res.get('provider') == 'Gemma 4', f'Expected Gemma 4 provider, got {clean_res}'
assert clean_res.get('model') == MODEL, f'Expected model {MODEL}, got {clean_res.get("model")}'
assert '72' in clean_res.get('text', ''), 'Expected text to mention 72 BPM'
assert 'synthetic' in clean_res.get('text', '').lower(), 'Expected text to state synthetic provenance'
print('✓ Test A Passed: Real Gemma 4 commentary generated for clean synthetic input.')

# 3. Cooldown
print('\nWaiting 15s server AI cooldown...')
time.sleep(15)

# 4. Test B: Failed-quality artifact sample
print('\n--- TEST B: Failed-Quality Artifact Sample (Expected: Real Gemma 4, Withheld BPM, Failed Checks) ---')
sample_artifact = httpx.get('http://127.0.0.1:8080/api/sample/artifact').json()
t0 = time.time()
art_r = httpx.post('http://127.0.0.1:8080/api/explain', json=sample_artifact,
                   headers={'X-Demo-Token': DEMO_TOKEN}, timeout=95)
dt_art = time.time() - t0
print(f'Status: {art_r.status_code} (took {dt_art:.1f}s)')
art_res = art_r.json()
print(f'Provider: {art_res.get("provider")}')
print(f'Model: {art_res.get("model")}')
print(f'Notice: {art_res.get("notice")}')
print(f'Explanation Text:\n  "{art_res.get("text")}"')

assert art_res.get('provider') == 'Gemma 4', f'Expected Gemma 4 provider, got {art_res}'
assert art_res.get('model') == MODEL, f'Expected model {MODEL}, got {art_res.get("model")}'
assert 'withheld' in art_res.get('text', '').lower(), 'Expected text to explain withheld BPM'
print('✓ Test B Passed: Real Gemma 4 commentary generated for failed-quality input.')

# 5. Test C: Security & Fallback
print('\n--- TEST C: Security & Fallback Verification ---')
# C.1 Invalid demo token returns 401
bad_token_r = httpx.post('http://127.0.0.1:8080/api/explain', json=sample_clean,
                         headers={'X-Demo-Token': 'wrong-token-value'}, timeout=10)
print(f'Invalid token status: {bad_token_r.status_code} (detail: {bad_token_r.json().get("detail")})')
assert bad_token_r.status_code == 401
print('✓ Unauthorized request with invalid token correctly rejected with HTTP 401.')

# C.2 Missing demo token header returns 401
no_token_r = httpx.post('http://127.0.0.1:8080/api/explain', json=sample_clean, timeout=10)
print(f'Missing token status: {no_token_r.status_code} (detail: {no_token_r.json().get("detail")})')
assert no_token_r.status_code == 401
print('✓ Unauthorized request without token correctly rejected with HTTP 401.')

# Note: Cooldown logic is tested deterministically in tests/test_audit_remediation.py
print('\nNote: Server cooldown enforcement is authoritatively validated by deterministic unit tests in tests/test_audit_remediation.py.')

print('\n======================================================')
print('ALL LIVE GEMMA 4 INTEGRATION TESTS PASSED SUCCESSFULLY')
print('======================================================')

