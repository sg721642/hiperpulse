import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.signal import sample

client=TestClient(app)


def test_sample_to_result_and_headers():
    d=client.get('/api/sample/clean').json()
    r=client.post('/api/analyze',json=d)
    assert r.status_code==200
    assert r.json()['bpm']==72
    assert r.headers['cache-control']=='no-store'
    assert "frame-ancestors 'none'" in r.headers['content-security-policy']


def test_frontend_and_health():
    assert client.get('/api/health').json()['ok']
    assert 'HiperPulse' in client.get('/').text
    assert client.get('/app.js').status_code==200
    assert client.get('/.env').status_code==404


def test_unknown_sample_and_extra_fields():
    assert client.get('/api/sample/missing').status_code==404
    d=sample();d['bpm']=72
    assert client.post('/api/analyze',json=d).status_code==422


def test_invalid_trace_validation():
    d=sample();d['timestamps'][5]=d['timestamps'][4]
    assert client.post('/api/analyze',json=d).status_code==422


def test_body_cap():
    assert client.post('/api/analyze',content=b' '*2_000_001).status_code==413


def test_fallback_no_credentials(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    r=client.post('/api/explain',json=sample('flat')).json()
    assert r['provider']=='deterministic'
    assert 'No BPM' in r['text']


def test_password_required(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','fake-test-key')
    monkeypatch.setenv('DEMO_TOKEN','test-only')
    assert client.post('/api/explain',json=sample()).status_code==401


@pytest.mark.parametrize('failure',[False,True])
def test_provider_mock_and_failure(monkeypatch,failure):
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY','fake-test-key')
    monkeypatch.setenv('DEMO_TOKEN','test-only')
    monkeypatch.setattr(module,'last_ai_call',0)
    async def fake_post(self,url,**kwargs):
        assert 'gemma-4-' in url
        prompt=kwargs['json']['contents'][0]['parts'][0]['text']
        assert 'waveform' not in prompt and 'timestamps' not in prompt
        assert '"bpm": null' in prompt
        return httpx.Response(503 if failure else 200,request=httpx.Request('POST',url),
            json={'candidates':[{'content':{'parts':[{'text':'Quality checks failed. Retry in steady lighting.'}]}}]})
    monkeypatch.setattr(httpx.AsyncClient,'post',fake_post)
    r=client.post('/api/explain',json=sample('flat'),headers={'X-Demo-Token':'test-only'})
    assert r.status_code==200
    assert r.json()['provider']==('deterministic' if failure else 'Gemma 4')


@pytest.mark.parametrize('payload', [None, {'candidates':None},
    {'candidates':[{'content':{'parts':[None]}}]},
    {'candidates':[{'content':{'parts':[{'text':None}]}}]}])
def test_malformed_provider_shape_falls_back(monkeypatch,payload):
    import app.main as module
    monkeypatch.setenv('GEMINI_API_KEY','fake-test-key')
    monkeypatch.setenv('DEMO_TOKEN','test-only')
    monkeypatch.setattr(module,'last_ai_call',0)
    async def fake_post(self,url,**kwargs):
        import json
        return httpx.Response(200,request=httpx.Request('POST',url),content=json.dumps(payload))
    monkeypatch.setattr(httpx.AsyncClient,'post',fake_post)
    r=client.post('/api/explain',json=sample(),headers={'X-Demo-Token':'test-only'})
    assert r.status_code==200
    assert r.json()['provider']=='deterministic'
