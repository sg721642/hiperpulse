'use strict';
const $ = id => document.getElementById(id);
const video = $('video');
let stream = null, localUrl = null, currentTrace = null, receipt = null;
let capturing = false, busy = false, generation = 0, operation = 0, captureTimer = null;
let selectedVideo = false, videoUsable = false, selectedFileName = '';
let previousSession = null, lastAiExplanation = null, activeChallenge = null;
let buildMeta = { version: '1.1', algorithm: 'green-evidence-1.1', git_sha: 'unknown' };
const TRUSTED_VIDEO_FIXTURES = {
  '85ce6f205e0ce40338824baeccf5c33902b7d797ac8acc0569340e70d480136b': 'test_video_30s.webm',
  'c52c2f5a71d6d94a209d860914a8893c95233264ccaef15b8e31f97a18a26cdd': 'test_video_12s.webm',
  '6c6853df26c7a972e23a0d19879868e1daca147b910e8b644c1927b286b98eb9': 'test_video_gapped.webm',
  '4eb5d0c505cf8c4f79fc2be0157639209527cb51c6346aa9d75c0df969d71a84': 'test_video_30s.mp4',
  '5e43cb432ac447a9d1795cc57a3a69e25c6b6cf25a3f077670419c05ff862f4f': 'test_video_12s.mp4'
};
let selectedVideoFile = null, selectedVideoSha256 = null, selectedVideoSource = 'video';

async function computeBlobSha256(blob) {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initBuildMeta() {
  request('/api/health').then(h => {
    if (h && typeof h === 'object') {
      if (h.git_sha) buildMeta.git_sha = h.git_sha;
      if (h.version) buildMeta.version = h.version;
      if (h.algorithm) buildMeta.algorithm = h.algorithm;
    }
  }).catch(() => {});
  fetch('/trusted_fixtures.json').then(r => r.ok ? r.json() : null).then(data => {
    if (data && data.video_fixtures) {
      for (const [sha, info] of Object.entries(data.video_fixtures)) {
        TRUSTED_VIDEO_FIXTURES[sha] = info.fixture_id;
      }
    }
  }).catch(() => {});
}
initBuildMeta();
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
  currentTrace = null; receipt = null; lastAiExplanation = null; activeChallenge = null;
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
function plotOverlay(id, xs1, ys1, xs2, ys2, color1, color2) {
  const canvas = $(id), c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, pad = 28;
  c.clearRect(0, 0, w, h);
  if ((!xs1 || !xs1.length) && (!xs2 || !xs2.length)) return;

  const validXs = [...(xs1 || []), ...(xs2 || [])];
  if (!validXs.length) return;
  const xMin = Math.min(...validXs);
  const xMax = Math.max(...validXs);
  const xSpan = (xMax - xMin) || 1;

  const allYs = [...(ys1 || []), ...(ys2 || [])];
  let low = allYs.length ? Math.min(...allYs) : -1;
  let high = allYs.length ? Math.max(...allYs) : 1;
  if (high - low < 1e-8) { low = -1; high = 1; }
  const ySpan = (high - low) || 1;

  const x = v => pad + (v - xMin) / xSpan * (w - 2 * pad);
  const y = v => h - pad - (v - low) / ySpan * (h - 2 * pad);

  c.strokeStyle = '#263c40'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = pad + i * (h - 2 * pad) / 4;
    c.beginPath(); c.moveTo(pad, yy); c.lineTo(w - pad, yy); c.stroke();
  }

  // Original curve (solid)
  if (xs1 && ys1 && xs1.length && ys1.length) {
    c.strokeStyle = color1; c.lineWidth = 2; c.setLineDash([]); c.beginPath();
    const len1 = Math.min(xs1.length, ys1.length);
    let started = false;
    for (let i = 0; i < len1; i++) {
      const px = x(xs1[i]), py = y(ys1[i]);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        if (!started) { c.moveTo(px, py); started = true; }
        else { c.lineTo(px, py); }
      }
    }
    c.stroke();
  }

  // Challenge curve (dashed)
  if (xs2 && ys2 && xs2.length && ys2.length) {
    c.strokeStyle = color2; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath();
    const len2 = Math.min(xs2.length, ys2.length);
    let started = false;
    for (let i = 0; i < len2; i++) {
      const px = x(xs2[i]), py = y(ys2[i]);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        if (!started) { c.moveTo(px, py); started = true; }
        else { c.lineTo(px, py); }
      }
    }
    c.stroke();
    c.setLineDash([]);
  }

  c.fillStyle = '#a8bcba'; c.font = '15px system-ui';
  c.fillText(xMin.toFixed(1), pad, h - 6);
  c.fillText(xMax.toFixed(1), w - 70, h - 6);
}
function getRetakeAdvice(checks) {
  if (!checks || !checks.length) {
    return { primary: 'No quality checks available.', category: 'none', details: [] };
  }
  const failed = checks.filter(c => !c.pass);
  if (!failed.length) {
    return {
      primary: 'All 14 quality checks passed. Signal continuity, lighting, and bilateral symmetry satisfy experimental tolerances. (Note: Heuristic check passage demonstrates signal quality, not clinical accuracy.)',
      category: 'accepted',
      details: []
    };
  }
  const failedNames = new Set(failed.map(c => c.name));
  let primary = '';
  let category = '';

  // Priority 1: Lighting & Exposure
  if (failedNames.has('mean_green') || failedNames.has('clipped_pixel_fraction')) {
    category = 'lighting';
    primary = 'Adjust lighting: Ensure even, indirect illumination across both cheeks. Avoid direct backlights, bright glare, and deep shadows so neither patch is underexposed (<20) or overexposed (>235).';
  }
  // Priority 2: Movement & Facial Stability
  else if (failedNames.has('color_jump_proxy') || failedNames.has('relative_signal_std') || failedNames.has('spectral_concentration') || failedNames.has('autocorrelation')) {
    category = 'stability';
    primary = 'Minimize movement: Keep your face and head completely stationary. Rest your chin or sit comfortably, breathe naturally, and avoid speaking, smiling, or sudden movements during the 30-second capture.';
  }
  // Priority 3: Facial Alignment & Bilateral Symmetry
  else if (failedNames.has('patch_difference_bpm') || failedNames.has('half_difference_bpm') || failedNames.has('estimator_difference_bpm')) {
    category = 'alignment';
    primary = 'Re-align cheek regions: Position the guide boxes squarely over smooth bare cheek skin below your eyes, clear of facial hair, glasses, lips, or uneven shadows.';
  }
  // Priority 4: Duration & Timing Continuity
  else if (failedNames.has('duration_seconds') || failedNames.has('sample_rate_hz') || failedNames.has('largest_gap_seconds') || failedNames.has('timing_variation')) {
    category = 'timing';
    primary = 'Ensure continuous timing: Keep the browser tab focused in the foreground for the full 30 seconds. Close heavy background applications to prevent frame drops and timing jitter.';
  }
  // Priority 5: Rate Range / Search Boundary
  else if (failedNames.has('search_boundary_bpm')) {
    category = 'boundary';
    primary = 'Rate out of bounds: The detected dominant frequency is outside the supported physiological window (45–177 BPM). Verify lighting and remain still while retaking.';
  }
  else {
    category = 'general';
    primary = 'Improve recording quality: Address the specific failed signal-quality gates listed below and retake capture.';
  }

  const details = failed.map(c => `• ${c.name.replaceAll('_', ' ')}: ${c.action} (${c.value}, rule: ${c.rule})`);
  return { primary, category, details };
}
function render(r) {
  $('bpm').textContent = r.bpm ?? '—';
  $('quality').textContent = `${r.quality_score}%`;
  const src = r.source || 'unknown';
  const ing = r.ingestion || (currentTrace && currentTrace.ingestion) || 'direct';
  if (src === 'synthetic') {
    if (ing === 'json_import') {
      $('source').textContent = 'IMPORTED TRACE · DECLARED SYNTHETIC ORIGIN';
    } else {
      $('source').textContent = 'SYNTHETIC DEMO · NOT A PERSON';
    }
  } else if (src === 'sample') {
    $('source').textContent = 'SAMPLE · ORIGIN UNVERIFIED';
  } else if (src === 'camera') {
    if (ing === 'json_import') {
      $('source').textContent = 'IMPORTED TRACE · DECLARED CAMERA ORIGIN';
    } else {
      $('source').textContent = 'LIVE CAMERA · EXPERIMENTAL';
    }
  } else if (src === 'video') {
    if (ing === 'json_import') {
      $('source').textContent = 'IMPORTED TRACE · DECLARED VIDEO ORIGIN';
    } else {
      $('source').textContent = 'LOCAL VIDEO · ORIGIN UNVERIFIED';
    }
  } else {
    $('source').textContent = `${src.toUpperCase()} · EXPERIMENTAL`;
  }
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
  const advice = getRetakeAdvice(r.checks);
  if ($('retakeAdvice')) {
    let text = advice.primary;
    if (advice.details.length) {
      text += '\n\nFailed check actions:\n' + advice.details.join('\n');
    }
    $('retakeAdvice').textContent = text;
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
  selectedVideoFile=file;
  try{
    selectedVideoSha256=await computeBlobSha256(file);
    const isFixture=Boolean(TRUSTED_VIDEO_FIXTURES[selectedVideoSha256]);
    selectedVideoSource=isFixture?'synthetic':'video';
  }catch(_err){
    selectedVideoSha256=null;
    selectedVideoSource='video';
  }
  localUrl=URL.createObjectURL(file);selectedVideo=true;video.src=localUrl;
  video.onloadedmetadata=()=>{
    videoUsable=Number.isFinite(video.duration)&&video.duration>=10&&video.duration<=60;
    const originLabel=selectedVideoSource==='synthetic'?'synthetic fixture':'local video (unverified origin)';
    status(videoUsable?`Preview alignment, then process (${originLabel}). The first 30 seconds are used.`:'Use a browser-decodable video with a duration of 10–60 seconds.');controls();
  };
  video.onerror=()=>{stopMedia();status('Video could not be decoded. Try MP4/H.264 or a supported WebM, or use sample mode.');};
};
$('processVideo').onclick=async()=>{
  if(!$('consent').checked){status('Please accept trace processing first.');return;}
  try{video.currentTime=0;await video.play();capture(selectedVideoSource||'video');}catch(e){status(e.message);}
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
    const advice = getRetakeAdvice(receipt.checks);
    const card = {
      application: 'HiperPulse',
      version: buildMeta.version || '1.1',
      algorithm: receipt.algorithm || buildMeta.algorithm || 'green-evidence-1.1',
      git_sha: buildMeta.git_sha || 'unknown',
      provenance_note: 'Canonical signal_sha256 identifies the mathematical signal data rounded to 5 decimal places. git_sha identifies the software build revision. Neither constitutes a cryptographic signature of real human or camera origin.',
      timestamp_utc: new Date().toISOString(),
      declared_source: receipt.source,
      ingestion_method: receipt.ingestion || currentTrace?.ingestion || 'direct',
      is_synthetic: receipt.source === 'synthetic',
      unverified_origin: receipt.source === 'video' || receipt.source === 'sample',
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
      retake_guidance: advice.primary,
      retake_category: advice.category,
      retake_failed_details: advice.details,
      challenge_experiment: activeChallenge || null,
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
async function executeChallenge(label, transformDesc, params, modifier) {
  if (!currentTrace || !receipt) return;
  const op = operation; busy = true; controls();
  const copy = structuredClone(currentTrace);
  copy.source = 'synthetic';
  modifier(copy);
  try {
    const result = await request('/api/analyze', copy);
    if (op !== operation) return;

    const failedGates = result.checks.filter(c => !c.pass).map(c => c.name);
    let outcomeAnalysis = '';

    if (label.includes('Timing Dropout')) {
      const gapCheck = result.checks.find(c => c.name === 'largest_gap_seconds');
      if (gapCheck && !gapCheck.pass) {
        outcomeAnalysis = `Continuity gate tripped as expected: largest frame gap was ${gapCheck.value} s (rule: <= 0.20 s). Estimate was safely withheld (null BPM).`;
      } else {
        outcomeAnalysis = `Continuity gate did not trip: largest frame gap was ${gapCheck ? gapCheck.value : '—'} s.`;
      }
    } else if (label.includes('Conflicting Patch')) {
      const patchDiffCheck = result.checks.find(c => c.name === 'patch_difference_bpm');
      const estDiffCheck = result.checks.find(c => c.name === 'estimator_difference_bpm');
      if ((patchDiffCheck && !patchDiffCheck.pass) || (estDiffCheck && !estDiffCheck.pass)) {
        outcomeAnalysis = `Inter-patch discordance detected: patch difference was ${patchDiffCheck ? patchDiffCheck.value : '—'} BPM (limit <= 8.0 BPM). Estimate was safely withheld.`;
      } else if (result.bpm === null) {
        outcomeAnalysis = `Estimate was withheld due to failed quality gates: ${failedGates.join(', ')}.`;
      } else {
        outcomeAnalysis = `Unexpected: Inter-patch discordance did not trip quality gates; candidate was ${result.bpm} BPM.`;
      }
    } else if (label.includes('Shared Periodic Light')) {
      if (result.bpm !== null && result.quality_score === 100) {
        outcomeAnalysis = `CRITICAL SCIENTIFIC LIMITATION OBSERVED: Artificial 1.2 Hz (72 BPM) illumination applied to BOTH patches simultaneously passed all 14 heuristic checks (${result.bpm} BPM, 100% score)! Because both patches received identical synchronous modulation, inter-patch consistency (0.0 BPM difference) and spectral concentration passed. This proves that passing heuristic checks does NOT verify biological arterial pulse origin.`;
      } else {
        outcomeAnalysis = `Shared periodic illumination did not pass all gates on this signal; failed: ${failedGates.join(', ') || 'none'}. (BPM: ${result.bpm ?? 'withheld'}).`;
      }
    }

    activeChallenge = {
      challenge_type: label,
      synthetic_transformation: transformDesc,
      parameters: params,
      original_signal_sha256: receipt.signal_sha256,
      transformed_signal_sha256: result.signal_sha256,
      actual_failed_gates: failedGates,
      actual_passed_gates: result.checks.filter(c => c.pass).map(c => c.name),
      bpm_result: result.bpm,
      quality_score: result.quality_score,
      timestamp_utc: new Date().toISOString()
    };

    $('comparison').textContent = `Original: ${receipt.bpm ?? 'withheld'} BPM, ${receipt.quality_score}% checks passed.\nArtifact copy: ${result.bpm ?? 'withheld'} BPM, ${result.quality_score}% checks passed.\nFailed checks: ${failedGates.map(n => n.replaceAll('_', ' ')).join(', ') || 'none — an example of the limits of these heuristics'}. Original input and receipt are unchanged.\n[${label} Result Analysis: ${outcomeAnalysis}]`;

    // Render visual before-vs-after overlay on waveform and spectrum (solid mint = original, dashed amber = challenge)
    plotOverlay('wave', receipt.waveform.seconds, receipt.waveform.normalized_amplitude, result.waveform.seconds, result.waveform.normalized_amplitude, '#8ae8c4', '#f1cc8b');
    plotOverlay('spectrum', receipt.spectrum.bpm, receipt.spectrum.relative_power, result.spectrum.bpm, result.spectrum.relative_power, '#8ae8c4', '#f1cc8b');
  } catch (e) {
    status(e.message);
  } finally {
    busy = false; controls();
  }
}
function runChallengeA() {
  executeChallenge('Challenge A: Timing Dropout',
    'Inject 0.35s PTS gap at sample midpoint',
    { gap_seconds: 0.35, threshold_rule: '<= 0.20 s' },
    copy => {
      const mid = Math.floor(copy.timestamps.length / 2);
      for (let i = mid; i < copy.timestamps.length; i++) copy.timestamps[i] += 0.35;
    });
}
function runChallengeB() {
  executeChallenge('Challenge B: Conflicting Patch',
    'Inject 1.85 Hz sine into right patch green channel',
    { frequency_hz: 1.85, amplitude: 8.0, target_patch: 'right' },
    copy => {
      copy.right = copy.right.map((row, i) => row.map((v, c) => c === 1 ? Math.max(0, Math.min(255, v + 8 * Math.sin(2 * Math.PI * 1.85 * copy.timestamps[i]))) : v));
    });
}
function runChallengeC() {
  executeChallenge('Challenge C: Shared Periodic Light',
    'Inject synchronous 1.2 Hz (72 BPM) sine into both patch green channels',
    { frequency_hz: 1.2, amplitude: 8.0, target_patches: ['left', 'right'] },
    copy => {
      const f = 1.2;
      copy.left = copy.left.map((row, i) => row.map((v, c) => c === 1 ? Math.max(0, Math.min(255, v + 8 * Math.sin(2 * Math.PI * f * copy.timestamps[i]))) : v));
      copy.right = copy.right.map((row, i) => row.map((v, c) => c === 1 ? Math.max(0, Math.min(255, v + 8 * Math.sin(2 * Math.PI * f * copy.timestamps[i]))) : v));
    });
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
$('clear').onclick=()=>{operation++;busy=false;stopMedia();previousSession=null;lastAiExplanation=null;activeChallenge=null;blank();$('token').value='';$('consent').checked=false;$('aiConsent').checked=false;$('file').value='';$('traceFile').value='';if($('retakeAdvice'))$('retakeAdvice').textContent='No retake needed or no input analyzed yet.';if($('retakeComparison'))$('retakeComparison').textContent='';status('Session cleared and camera stopped. Downloaded files are not deleted.');};
window.addEventListener('pagehide',stopMedia);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&capturing){stopMedia();status('Capture discarded because the tab was hidden.');}});
controls();
