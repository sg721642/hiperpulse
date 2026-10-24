"""Explicit network check: run after setting .env. Never prints API keys."""
import os
from pathlib import Path
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env')
key=os.getenv('GEMINI_API_KEY')
model=os.getenv('GEMMA_MODEL','gemma-4-26b-a4b-it')
if not key:raise SystemExit('Set GEMINI_API_KEY in .env first.')
token=None;found=False
with httpx.Client(timeout=20) as client:
    while True:
        params={'pageSize':100}
        if token:params['pageToken']=token
        r=client.get('https://generativelanguage.googleapis.com/v1beta/models',
                     headers={'x-goog-api-key':key},params=params)
        if r.status_code!=200:raise SystemExit(f'Model listing failed: HTTP {r.status_code}; check account access.')
        data=r.json()
        for item in data.get('models',[]):
            if 'gemma-4-' in item.get('name',''):
                print(item['name'],item.get('supportedGenerationMethods',[]))
            if item.get('name')=='models/'+model and 'generateContent' in item.get('supportedGenerationMethods',[]):found=True
        token=data.get('nextPageToken')
        if not token:break
if not found:raise SystemExit('Configured Gemma 4 model unavailable. Ask organizers about access; do not silently substitute Gemini.')
print('Configured Gemma 4 model supports generation. A live app explanation is still required for integration verification.')
