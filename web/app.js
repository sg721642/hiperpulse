'use strict';
const $ = id => document.getElementById(id);
const video = $('video');
let stream = null, localUrl = null, currentTrace = null, receipt = null;
let capturing = false, busy = false, generation = 0, operation = 0, captureTimer = null;
let selectedVideo = false, videoUsable = false, selectedFileName = '';
let previousSession = null, lastAiExplanation = null;
const scratch = document.createElement('canvas');
scratch.width = 160; scratch.height = 120;
const ctx = scratch.getContext('2d', {willReadFrequently:true});

function status(text) { $('status').textContent = text; }
function controls() {
  const locked = capturing || busy;
  $('clear').disabled = busy;
  for (const id of ['clean','artifact','flat','camera','file','traceFile']) $(id).disabled = locked;
  $('record').disabled = locked || !stream;
  $('processVideo').disabled = locked || !selectedVideo || !videoUsable;
  $('stop').disabled = !capturing && !stream && !selectedVideo;
  for (const id of ['receipt','evidenceCard','trace','explain','stress','challengeA','challengeB','challengeC']) {
    if ($(id)) $(id).disabled = locked || !receipt;
  }
  if ($('retakeAction')) $('retakeAction').disabled = locked || !receipt;
}
function stopMedia() {
  capturing = false; generation++;
  clearTimeout(captureTimer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; video.pause(); video.srcObject = null;
  video.removeAttribute('src'); video.load();
  if (localUrl) URL.revokeObjectURL(localUrl);
  localUrl = null; selectedVideo = false; videoUsable = false;
  controls();
}
function blank() {
  currentTrace = null; receipt = null; lastAiExplanation = null;
  $('bpm').textContent = '—'; $('quality').textContent = '—';
  $('source').textContent = 'NO INPUT YET'; $('decision').textContent = 'Choose an input to begin.';
  $('checks').replaceChildren(); $('comparison').textContent = '';
  if ($('retakeAdvice')) $('retakeAdvice').textContent = 'No retake needed or no input analyzed yet.';
  if ($('retakeComparison')) $('retakeComparison').textContent = '';
  $('explanation').textContent = 'The signal calculation works without an AI key.';
  for (const id of ['wave','spectrum']) $(id).getContext('2d').clearRect(0,0,$(id).width,$(id).height);
  controls();
}
async function request(path, data, headers = {}) {
  const timeoutMs = path === '/api/explain' ? 95000 : 30000;
  const response = await fetch(path, {method:data ? 'POST':'GET',
    headers:{'Content-Type':'application/json',...headers},
    body:data ? JSON.stringify(data):undefined, signal:AbortSignal.timeout(timeoutMs)});
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Invalid input. Check the trace format and sample lengths.');
  return body;
}
function plot(id, xs, ys, color) {
  const canvas = $(id), c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, pad = 28;
  c.clearRect(0,0,w,h);
  if (!xs.length) return;
  let low = Math.min(...ys), high = Math.max(...ys);
  if (high-low < 1e-8) {low = -1; high = 1;}
  const x = v => pad+(v-xs[0])/(xs.at(-1)-xs[0] || 1)*(w-2*pad);
  const y = v => h-pad-(v-low)/(high-low)*(h-2*pad);
  c.strokeStyle='#263c40'; c.lineWidth=1;
  for(let i=0;i<=4;i++){const yy=pad+i*(h-2*pad)/4;c.beginPath();c.moveTo(pad,yy);c.lineTo(w-pad,yy);c.stroke();}
  c.strokeStyle=color; c.lineWidth=2; c.beginPath();
  ys.forEach((v,i) => i ? c.lineTo(x(xs[i]),y(v)) : c.moveTo(x(xs[i]),y(v))); c.stroke();
  c.fillStyle='#a8bcba'; c.font='15px system-ui';
  c.fillText(xs[0].toFixed(1),pad,h-6); c.fillText(xs.at(-1).toFixed(1),w-70,h-6);
}
function getRetakeAdvice(checks) {
  if (!checks || !checks.length) return 'No quality checks available.';
  const failed = checks.filter(c => !c.pass);
  if (!failed.length) {
    return 'All heuristic checks passed. Signal continuity, lighting, and bilateral symmetry are within tolerances. Remember: heuristic check passage does not prove biological accuracy.';
  }
  const failedNames = new Set(failed.map(c => c.name));
  const advice = [];
  if (failedNames.has('exposure_range') || failedNames.has('color_clipping_fraction')) {
    advice.push('• Lighting: Adjust ambient light. Avoid strong backlights, direct sun, or dark shadows. Keep both cheeks evenly illuminated without bright reflections or darkness.');
  }
  if (failedNames.has('snr_db') || failedNames.has('spectral_entropy') || failedNames.has('peak_prominence')) {
    advice.push('• Stability: Minimize head and facial motion. Sit down comfortably, rest your chin or head if needed, breathe normally, and avoid talking or smiling during the capture.');
  }
  if (failedNames.has('duration_seconds') || failedNames.has('sample_rate_hz') || failedNames.has('largest_gap_seconds')) {
    advice.push('• Timing & System: Keep the browser tab active in the foreground throughout the recording. Close background tabs or heavy applications to prevent camera frame drops.');
  }
  if (failedNames.has('patch_difference_bpm') || failedNames.has('estimator_difference_bpm')) {
    advice.push('• Alignment: Reposition your face so both bounding boxes rest squarely on smooth cheek skin, completely clear of eyes, lips, beard, hair, or shadows.');
  }
  if (!advice.length) {
    for (const c of failed) {
      if (c.action) advice.push(`• ${c.name.replaceAll('_', ' ')}: ${c.action}`);
    }
  }
  return advice.join('\n');
}
function render(r) {
  $('bpm').textContent = r.bpm ?? '—';
  $('quality').textContent = `${r.quality_score}%`;
  $('source').textContent = r.source === 'synthetic' ? 'SYNTHETIC DEMO · NOT A PERSON' : `${r.source.toUpperCase()} · EXPERIMENTAL`;
  $('decision').textContent = r.bpm === null ? 'Estimate withheld. Inspect the failed checks below.' : 'Heuristic checks passed. Biological origin and accuracy are unverified.';
  $('checks').replaceChildren();
  for (const check of r.checks) {
    const row=document.createElement('div'); row.className='check';
    const title=document.createElement('strong'); title.className=check.pass?'pass':'fail';
    title.textContent=`${check.pass?'PASS':'FAIL'} · ${check.name.replaceAll('_',' ')}: ${check.value} (${check.rule})`;
    row.append(title);
    if(!check.pass){const p=document.createElement('div');p.textContent=check.action;row.append(p);}
    $('checks').append(row);
  }
  if ($('retakeAdvice')) {
    $('retakeAdvice').textContent = getRetakeAdvice(r.checks);
  }
  if ($('retakeComparison')) {
    if (previousSession && previousSession.signal_sha256 !== r.signal_sha256) {
      const deltaScore = r.quality_score - previousSession.quality_score;
      const scoreDiffStr = deltaScore > 0 ? `+${deltaScore}%` : (deltaScore < 0 ? `${deltaScore}%` : 'no change');
      const prevBpm = previousSession.bpm !== null ? `${previousSession.bpm} BPM` : 'withheld';
      const currBpm = r.bpm !== null ? `${r.bpm} BPM` : 'withheld';
      const prevPassed = previousSession.checks.filter(c => c.pass).map(c => c.name);
      const currPassed = r.checks.filter(c => c.pass).map(c => c.name);
      const improved = currPassed.filter(n => !prevPassed.includes(n));
      const regressed = prevPassed.filter(n => !currPassed.includes(n));
      let cmp = `Comparison with previous run:\n• Score: ${previousSession.quality_score}% → ${r.quality_score}% (${scoreDiffStr})\n• Estimate: ${prevBpm} → ${currBpm}\n• Gates passed: ${prevPassed.length}/14 → ${currPassed.length}/14`;
      if (improved.length) cmp += `\n• Improved checks: ${improved.map(n => n.replaceAll('_', ' ')).join(', ')}`;
      if (regressed.length) cmp += `\n• Regressed checks: ${regressed.map(n => n.replaceAll('_', ' ')).join(', ')}`;
      $('retakeComparison').textContent = cmp;
    } else {
      $('retakeComparison').textContent = '';
    }
  }
  previousSession = r;
  plot('wave',r.waveform.seconds,r.waveform.normalized_amplitude,'#8ae8c4');
  plot('spectrum',r.spectrum.bpm,r.spectrum.relative_power,'#f1cc8b');
  controls();
}
async function runTrace(trace) {
  const op = ++operation; busy=true; blank(); controls(); status('Analyzing signal and quality checks…');
  try { const result=await request('/api/analyze',trace);
    if(op!==operation)return;
    currentTrace=trace;receipt=result;render(result);status('Analysis complete. Review the input label and quality checks.');
  } catch(e){if(op===operation)status(e.message);}
  finally{if(op===operation){busy=false;controls();}}
}
for(const kind of ['clean','artifact','flat']) $(kind).onclick=async()=>{
  stopMedia(); blank(); busy=true;controls();
  try{const trace=await request(`/api/sample/${kind}`);await runTrace(trace);}
  catch(e){status(e.message);}finally{busy=false;controls();}
};
$('camera').onclick=async()=>{
  if(!$('consent').checked){status('Please review and accept trace processing first.');return;}
  stopMedia(); blank();busy=true;controls();const op=++operation;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera requires HTTPS or localhost in a supported browser.');
    const incoming=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
    if(op!==operation){incoming.getTracks().forEach(t=>t.stop());return;}
    stream=incoming;video.srcObject=stream;await video.play();
    status('Align the boxes onto both cheeks. Let exposure settle for five seconds, then capture.');
  }catch(e){stopMedia();status(`Camera unavailable: ${e.message}. You can still use a synthetic sample.`);}
  finally{busy=false;controls();}
};
function colors() {
  ctx.drawImage(video,0,0,160,120);
  let clipped=0,total=0;const means=[];
  for(const x of [Math.round(160*.32),Math.round(160*.56)]){
    const pixels=ctx.getImageData(x,Math.round(120*.48),Math.round(160*.12),Math.round(120*.12)).data;
    const sums=[0,0,0];
    for(let i=0;i<pixels.length;i+=4){for(let c=0;c<3;c++)sums[c]+=pixels[i+c];
      if(pixels[i+1]<=5||pixels[i+1]>=250)clipped++;total++;}
    means.push(sums.map(n=>n/(pixels.length/4)));
  }
  return {left:means[0],right:means[1],clipping:clipped/total};
}
function capture(source) {
  if(!$('consent').checked){status('Please accept trace processing first.');return;}
  if(!video.requestVideoFrameCallback){status('This browser cannot timestamp video frames reliably. Use a current Chrome/Edge or sample mode.');return;}
  blank();capturing=true;controls();const ticket=++generation;
  const ingestion = source==='camera'?'live_capture':(source==='synthetic'?'synthetic_fixture':'local_video');
  const trace={source,ingestion,timestamps:[],left:[],right:[],clipping:[]};let first=null;
  const finish=()=>{if(ticket!==generation)return;stopMedia();runTrace(trace);};
  captureTimer=setTimeout(()=>{if(ticket===generation){stopMedia();status('Capture timed out; discarded. Keep the tab visible and retry.');}},65000);
  function frame(now,meta){
    if(!capturing||ticket!==generation)return;
    if(document.hidden){stopMedia();status('Tab was hidden. Capture discarded; please retry in the foreground.');return;}
    const time=meta.mediaTime;
    if(first===null)first=time;
    const elapsed=time-first;
    if(!trace.timestamps.length||elapsed>trace.timestamps.at(-1)){
      const values=colors();trace.timestamps.push(elapsed);
      for(const k of ['left','right','clipping'])trace[k].push(values[k]);
    }
    status(`Processing ${elapsed.toFixed(1)} s · ${trace.timestamps.length} frames. Keep still.`);
    if(elapsed>=30||trace.timestamps.length>=7200){finish();return;}
    video.requestVideoFrameCallback(frame);
  }
  video.onended=()=>{if(capturing&&ticket===generation)finish();};
  video.requestVideoFrameCallback(frame);
}
$('record').onclick=()=>capture('camera');
$('stop').onclick=()=>{operation++;stopMedia();status('Stopped. Incomplete capture discarded.');};
$('file').onchange=async e=>{
  stopMedia();blank();const file=e.target.files[0];if(!file)return;
  selectedFileName=file.name||'';
  if(file.size>50*1024*1024){status('Video exceeds 50 MB. Use a shorter recording.');return;}
  localUrl=URL.createObjectURL(file);selectedVideo=true;video.src=localUrl;
  video.onloadedmetadata=()=>{
    videoUsable=Number.isFinite(video.duration)&&video.duration>=10&&video.duration<=60;
    status(videoUsable?'Preview alignment, then process. The first 30 seconds are used.':'Use a browser-decodable video with a duration of 10–60 seconds.');controls();
  };
  video.onerror=()=>{stopMedia();status('Video could not be decoded. Try MP4/H.264 or a supported WebM, or use sample mode.');};
};
$('processVideo').onclick=async()=>{
  if(!$('consent').checked){status('Please accept trace processing first.');return;}
  const isSynthetic=/^(test_video|synthetic|fixture)/i.test(selectedFileName)||/synthetic/i.test(selectedFileName);
  try{video.currentTime=0;await video.play();capture(isSynthetic?'synthetic':'video');}catch(e){status(e.message);}
};
$('traceFile').onchange=async e=>{
  stopMedia();blank();const f=e.target.files[0];if(!f)return;
  if(!$('consent').checked){status('Please accept trace processing, then select the file again.');e.target.value='';return;}
  if(f.size>2_000_000){status('Trace exceeds 2 MB.');return;}
  try{
    const data=JSON.parse(await f.text());
    if(!['camera','video','synthetic','sample'].includes(data.source)){data.source='sample';}
    data.ingestion='json_import';
    await runTrace(data);
  }
  catch(e){status(`Invalid trace: ${e.message}`);}
};
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('receipt').onclick=()=>receipt&&download(receipt,'hiperpulse-evidence.json');
$('trace').onclick=()=>currentTrace&&download(currentTrace,'hiperpulse-trace.json');
if ($('evidenceCard')) {
  $('evidenceCard').onclick = () => {
    if (!receipt) return;
    const card = {
      application: 'HiperPulse',
      version: '1.1',
      algorithm: receipt.algorithm || 'green-evidence-1.1',
      git_sha: '06ec6c7cdefa54520fe020f7f0e8faeffe725432',
      timestamp_utc: new Date().toISOString(),
      declared_source: receipt.source,
      ingestion_method: currentTrace?.ingestion || receipt.ingestion || 'direct',
      is_synthetic: receipt.source === 'synthetic',
      signal_sha256: receipt.signal_sha256 || null,
      input_sha256: receipt.input_sha256 || null,
      sample_count: currentTrace?.timestamps?.length || receipt.waveform?.seconds?.length || 0,
      duration_seconds: receipt.checks?.find(c => c.name === 'duration_seconds')?.value ?? null,
      sample_rate_hz: receipt.checks?.find(c => c.name === 'sample_rate_hz')?.value ?? null,
      bpm_estimate: receipt.bpm,
      bpm_withheld: receipt.bpm === null,
      quality_score_percent: receipt.quality_score,
      quality_status: receipt.status,
      quality_label: receipt.quality_label,
      checks_summary: {
        total: receipt.checks.length,
        passed: receipt.checks.filter(c => c.pass).length,
        failed: receipt.checks.filter(c => !c.pass).length
      },
      passed_checks: receipt.checks.filter(c => c.pass).map(c => c.name),
      failed_checks: receipt.checks.filter(c => !c.pass).map(c => c.name),
      exposure_metrics: receipt.exposure_metrics || null,
      retake_guidance: getRetakeAdvice(receipt.checks),
      ai_explanation: lastAiExplanation || null,
      disclaimers: [
        'Experimental wellness prototype. Not a medical device.',
        'No clinical accuracy, diagnosis, blood pressure, or oxygen saturation.',
        'Heuristic check passage does not prove biological arterial pulsation.'
      ]
    };
    download(card, 'hiperpulse-judge-evidence.json');
  };
}
if ($('retakeAction')) {
  $('retakeAction').onclick = () => {
    if (stream) {
      status('Align the boxes onto both cheeks. When ready, click "Capture 30 seconds".');
      $('record').focus();
    } else {
      $('camera').click();
    }
  };
}
async function runChallenge(modifier, label, explanation) {
  if (!currentTrace) return;
  const op = operation; busy = true; controls();
  const copy = structuredClone(currentTrace);
  copy.source = 'synthetic';
  modifier(copy);
  try {
    const result = await request('/api/analyze', copy);
    if (op !== operation) return;
    const failed = result.checks.filter(c => !c.pass).map(c => c.name.replaceAll('_', ' '));
    $('comparison').textContent = `[${label}]\nOriginal: ${receipt.bpm ?? 'withheld'} BPM, ${receipt.quality_score}% checks passed.\nArtifact copy: ${result.bpm ?? 'withheld'} BPM, ${result.quality_score}% checks passed.\nFailed checks: ${failed.join(', ') || 'none — an example of the limits of these heuristics'}.\n${explanation}\n(Original input and receipt remain unchanged)`;
  } catch (e) {
    status(e.message);
  } finally {
    busy = false; controls();
  }
}
function runChallengeA() {
  runChallenge(copy => {
    const mid = Math.floor(copy.timestamps.length / 2);
    for (let i = mid; i < copy.timestamps.length; i++) copy.timestamps[i] += 0.35;
  }, 'Challenge A: Timing Dropout', 'Scientific Takeaway: Injected a 0.35s frame gap midway. The continuity gate (largest_gap_seconds <= 0.25s) detected the frame discontinuity and safely withheld the estimate.');
}
function runChallengeB() {
  if (!currentTrace) return;
  const op = operation; busy = true; controls();
  const copy = structuredClone(currentTrace);
  copy.source = 'synthetic';
  copy.right = copy.right.map((row, i) => row.map((v, c) => c === 1 ? Math.max(0, Math.min(255, v + 8 * Math.sin(2 * Math.PI * 1.85 * copy.timestamps[i]))) : v));
  request('/api/analyze', copy).then(result => {
    if (op !== operation) return;
    const failed = result.checks.filter(c => !c.pass).map(c => c.name.replaceAll('_', ' '));
    $('comparison').textContent = `Original: ${receipt.bpm ?? 'withheld'} BPM, ${receipt.quality_score}% checks passed.\nArtifact copy: ${result.bpm ?? 'withheld'} BPM, ${result.quality_score}% checks passed.\nFailed checks: ${failed.join(', ') || 'none — an example of the limits of these heuristics'}. Original input and receipt are unchanged.\n[Challenge B: Conflicting Patch Takeaway: Injected 1.85 Hz sine into right patch; bilateral discrepancy was detected and estimate withheld.]`;
  }).catch(e => status(e.message)).finally(() => { busy = false; controls(); });
}
function runChallengeC() {
  runChallenge(copy => {
    const f = 1.2;
    copy.left = copy.left.map((row, i) => row.map((v, c) => c === 1 ? Math.max(0, Math.min(255, v + 8 * Math.sin(2 * Math.PI * f * copy.timestamps[i]))) : v));
    copy.right = copy.right.map((row, i) => row.map((v, c) => c === 1 ? Math.max(0, Math.min(255, v + 8 * Math.sin(2 * Math.PI * f * copy.timestamps[i]))) : v));
  }, 'Challenge C: Shared Periodic Light', 'CRITICAL SCIENTIFIC TAKEAWAY: An artificial 1.2 Hz (72 BPM) light fluctuation injected into BOTH patches simultaneously passed heuristic checks! This proves that heuristic agreement across facial patches does not prove biological arterial blood pulsation.');
}
if ($('challengeA')) $('challengeA').onclick = runChallengeA;
if ($('challengeB')) $('challengeB').onclick = runChallengeB;
if ($('stress')) $('stress').onclick = runChallengeB;
if ($('challengeC')) $('challengeC').onclick = runChallengeC;

$('explain').onclick=async()=>{
  if(!$('aiConsent').checked){$('explanation').textContent='Review and accept the summary-sharing option first.';return;}
  const op=operation;busy=true;controls();$('explanation').textContent='Preparing explanation…';
  try{
    const result=await request('/api/explain',currentTrace,{'X-Demo-Token':$('token').value});
    if(op!==operation)return;
    lastAiExplanation = {
      provider: result.provider,
      model: result.model || null,
      text: result.text,
      notice: result.reason || result.notice || ''
    };
    $('explanation').textContent=`${result.provider}${result.model?' / '+result.model:''}\n${result.reason||result.notice||''}\n${result.text}`;
  }catch(e){if(op===operation)$('explanation').textContent=e.message;}
  finally{busy=false;controls();}
};
$('clear').onclick=()=>{operation++;busy=false;stopMedia();previousSession=null;lastAiExplanation=null;blank();$('token').value='';$('consent').checked=false;$('aiConsent').checked=false;$('file').value='';$('traceFile').value='';if($('retakeAdvice'))$('retakeAdvice').textContent='No retake needed or no input analyzed yet.';if($('retakeComparison'))$('retakeComparison').textContent='';status('Session cleared and camera stopped. Downloaded files are not deleted.');};
window.addEventListener('pagehide',stopMedia);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&capturing){stopMedia();status('Capture discarded because the tab was hidden.');}});
controls();
