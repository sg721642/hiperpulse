from copy import deepcopy
import numpy as np
import pytest
from app.signal import analyze, sample


def test_known_synthetic_rate():
    r = analyze(sample())
    assert r['status'] == 'accepted_experimental'
    assert abs(r['bpm']-72) <= 2
    assert r['quality_score'] == 100
    assert len(r['waveform']['seconds']) <= 600


@pytest.mark.parametrize('kind', ['artifact','flat'])
def test_bad_samples_withhold(kind):
    r = analyze(sample(kind))
    assert r['bpm'] is None
    assert r['status'] == 'insufficient_quality'
    assert any(not c['pass'] for c in r['checks'])


@pytest.mark.parametrize('bpm', [48,60,90,120,150,168])
def test_frequency_range(bpm):
    d=sample();t=np.array(d['timestamps'])
    for k in ['left','right']:
        d[k]=np.column_stack([100+np.sin(2*np.pi*bpm/60*t)]*3).tolist()
    r=analyze(d)
    assert r['bpm'] is not None
    assert abs(r['bpm']-bpm)<=2


def test_noise_is_not_a_heart_rate():
    d=sample();rng=np.random.default_rng(9)
    for k in ['left','right']:
        d[k]=(100+rng.normal(0,1,(900,3))).tolist()
    assert analyze(d)['bpm'] is None


def test_gap_is_not_interpolated_into_accepted_estimate():
    d=sample()
    for k in ['timestamps','left','right','clipping']:
        d[k]=d[k][:200]+d[k][230:]
    r=analyze(d)
    assert r['bpm'] is None
    assert not next(c for c in r['checks'] if c['name']=='largest_gap_seconds')['pass']


def test_short_signal_withheld():
    d=sample()
    for k in ['timestamps','left','right','clipping']: d[k]=d[k][:450]
    assert analyze(d)['bpm'] is None


def test_clipping_withholds():
    d=sample();d['clipping']=[.3]*900
    assert analyze(d)['bpm'] is None


@pytest.mark.parametrize('mutation', ['duplicate','reverse','nan','length','range','too_short'])
def test_invalid_data(mutation):
    d=sample()
    if mutation=='duplicate':d['timestamps'][3]=d['timestamps'][2]
    if mutation=='reverse':d['timestamps'].reverse()
    if mutation=='nan':d['left'][2][1]=float('nan')
    if mutation=='length':d['right'].pop()
    if mutation=='range':d['left'][2][0]=300
    if mutation=='too_short':d['timestamps']=d['timestamps'][:50]
    with pytest.raises(ValueError):analyze(d)


def test_receipt_hash_reproducible_and_sensitive():
    d=sample();copy=deepcopy(d)
    assert analyze(d)['input_sha256']==analyze(copy)['input_sha256']
    copy['left'][0][0]+=.01
    assert analyze(d)['input_sha256']!=analyze(copy)['input_sha256']


def test_common_mode_artifact_can_pass_documented_limit():
    # A periodic lamp/non-biological synthetic signal can pass every check.
    # This is a regression test of a known limitation, not clinical validation.
    d=sample()
    assert analyze(d)['bpm'] is not None
    assert 'Lighting or motion can imitate' in analyze(d)['limitations']
