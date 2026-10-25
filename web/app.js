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
  '5e43cb432ac447a9d1795cc57a3a69e25c6b6cf25a3f077670419c05ff862f4f': 'test_video_12s.mp4',
  'b7d393a59c962b5161ab9d96b5a0a5e7c02803cec24b49496d2987d01632cf29': 'clean.json',
  '1d941441ef89dcabf5b6602a1ac614f5ff7292d8a8cff6e4d1a132a6cec613e3': 'artifact.json',
  '78c33dfbe0e69506a025ef6d768af6d689b26a393ff0b9ddd32757514df7cc2b': 'flat.json'
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
    if (data) {
      if (data.video_fixtures) {
        for (const [sha, info] of Object.entries(data.video_fixtures)) {
          TRUSTED_VIDEO_FIXTURES[sha] = info.fixture_id;
        }
      }
      if (data.trace_fixtures) {
        for (const [sha, info] of Object.entries(data.trace_fixtures)) {
          TRUSTED_VIDEO_FIXTURES[sha] = info.fixture_id;
          if (info.file_sha256) TRUSTED_VIDEO_FIXTURES[info.file_sha256] = info.fixture_id;
          if (info.signal_sha256) TRUSTED_VIDEO_FIXTURES[info.signal_sha256] = info.fixture_id;
        }
      }
    }
  }).catch(() => {});
}
initBuildMeta();
const scratch = document.createElement('canvas');
scratch.width = 320; scratch.height = 240;
const ctx = scratch.getContext('2d', {willReadFrequently:true});

let readinessTimer = null;
let lastGreenSample = null;

function updateStageAspectRatio() {
  if (video.videoWidth && video.videoHeight) {
    const ar = video.videoWidth / video.videoHeight;
    const stage = $('captureStage');
    if (stage) stage.style.aspectRatio = `${ar}`;
  }
}

function checkReadiness() {
  const hud = $('readinessHud');
  const text = $('readinessText');
  if (!hud || !text) return;
  if (!stream || capturing) {
    hud.style.display = 'none';
    return;
  }
  hud.style.display = 'flex';
  try {
    const val = colors();
    const leftG = val.left[1];
    const rightG = val.right[1];
    const meanG = (leftG + rightG) / 2;
    const diffG = Math.abs(leftG - rightG);
    let motion = 0;
    if (lastGreenSample !== null) {
      motion = Math.abs(meanG - lastGreenSample);
    }
    lastGreenSample = meanG;

    if (meanG < 20) {
      hud.className = 'readiness-hud warning';
      text.textContent = `TOO DARK (${Math.round(meanG)}/255) · ADD FRONT LIGHT`;
    } else if (meanG > 235) {
      hud.className = 'readiness-hud warning';
      text.textContent = `OVEREXPOSED (${Math.round(meanG)}/255) · REDUCE GLARE`;
    } else if (diffG > 35) {
      hud.className = 'readiness-hud warning';
      text.textContent = `UNEVEN SHADOWS (Δ${Math.round(diffG)}) · FACE LIGHT EVENLY`;
    } else if (motion > 2.0) {
      hud.className = 'readiness-hud warning';
      text.textContent = `MOTION DETECTED · HOLD HEAD STEADY`;
    } else {
      hud.className = 'readiness-hud optimal';
      text.textContent = `READY · LIGHT ${Math.round(meanG)}/255 · POSITION STEADY`;
    }
  } catch (_e) {
    hud.style.display = 'none';
  }
}

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
  if (readinessTimer) { clearInterval(readinessTimer); readinessTimer = null; }
  lastGreenSample = null;
  document.body.classList.remove('is-capturing');
  const stage = $('captureStage');
  if (stage) {
    stage.classList.remove('scanning');
    stage.style.aspectRatio = '';
  }
  if ($('readinessHud')) $('readinessHud').style.display = 'none';
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
  c.strokeStyle='rgba(111, 146, 138, 0.18)'; c.lineWidth=1;
  for(let i=0;i<=4;i++){const yy=pad+i*(h-2*pad)/4;c.beginPath();c.moveTo(pad,yy);c.lineTo(w-pad,yy);c.stroke();}
  c.save();
  c.strokeStyle=color; c.lineWidth=2;
  c.shadowColor = color === '#8ae8c4' ? 'rgba(62, 232, 159, 0.5)' : 'rgba(241, 204, 139, 0.5)';
  c.shadowBlur = 6;
  c.beginPath();
  ys.forEach((v,i) => i ? c.lineTo(x(xs[i]),y(v)) : c.moveTo(x(xs[i]),y(v))); c.stroke();
  c.restore();
  c.fillStyle='#8da8a4'; c.font='12px "IBM Plex Mono", monospace';
  c.fillText(xs[0].toFixed(1),pad,h-6); c.fillText(xs.at(-1).toFixed(1),w-60,h-6);
}
function plotOverlay(id, xs1, ys1, xs2, ys2, color1, color2) {
  const canvas = $(id), c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, pad = 28;
  c.clearRect(0, 0, w, h);
  if ((!xs1 || !xs1.length) && (!xs2 || !xs2.length)) return;

  const validXs = [];
  if (xs1) for (let i = 0; i < xs1.length; i++) if (Number.isFinite(xs1[i])) validXs.push(xs1[i]);
  if (xs2) for (let i = 0; i < xs2.length; i++) if (Number.isFinite(xs2[i])) validXs.push(xs2[i]);
  if (!validXs.length) return;
  let xMin = validXs[0], xMax = validXs[0];
  for (let i = 1; i < validXs.length; i++) {
    if (validXs[i] < xMin) xMin = validXs[i];
    if (validXs[i] > xMax) xMax = validXs[i];
  }
  const xSpan = (xMax - xMin) || 1;

  let low = Infinity, high = -Infinity;
  if (ys1) for (let i = 0; i < ys1.length; i++) if (Number.isFinite(ys1[i])) { if (ys1[i] < low) low = ys1[i]; if (ys1[i] > high) high = ys1[i]; }
  if (ys2) for (let i = 0; i < ys2.length; i++) if (Number.isFinite(ys2[i])) { if (ys2[i] < low) low = ys2[i]; if (ys2[i] > high) high = ys2[i]; }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high - low < 1e-8) { low = -1; high = 1; }
  const ySpan = (high - low) || 1;

  const x = v => pad + (v - xMin) / xSpan * (w - 2 * pad);
  const y = v => h - pad - (v - low) / ySpan * (h - 2 * pad);

  c.strokeStyle = 'rgba(111, 146, 138, 0.18)'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = pad + i * (h - 2 * pad) / 4;
    c.beginPath(); c.moveTo(pad, yy); c.lineTo(w - pad, yy); c.stroke();
  }

  // Original curve (solid)
  if (xs1 && ys1 && xs1.length && ys1.length) {
    c.save();
    c.strokeStyle = color1; c.lineWidth = 2; c.setLineDash([]);
    c.shadowColor = 'rgba(62, 232, 159, 0.5)';
    c.shadowBlur = 6;
    c.beginPath();
    const len1 = Math.min(xs1.length, ys1.length);
    let started = false;
    for (let i = 0; i < len1; i++) {
      if (id === 'wave' && i > 0 && xs1[i] - xs1[i-1] > 0.25) started = false;
      const px = x(xs1[i]), py = y(ys1[i]);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        if (!started) { c.moveTo(px, py); started = true; }
        else { c.lineTo(px, py); }
      }
    }
    c.stroke();
    c.restore();
  }

  // Challenge curve (dashed)
  if (xs2 && ys2 && xs2.length && ys2.length) {
    c.save();
    c.strokeStyle = color2; c.lineWidth = 2; c.setLineDash([5, 4]);
    c.shadowColor = 'rgba(241, 204, 139, 0.5)';
    c.shadowBlur = 6;
    c.beginPath();
    const len2 = Math.min(xs2.length, ys2.length);
    let started = false;
    for (let i = 0; i < len2; i++) {
      if (id === 'wave' && i > 0 && xs2[i] - xs2[i-1] > 0.25) started = false;
      const px = x(xs2[i]), py = y(ys2[i]);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        if (!started) { c.moveTo(px, py); started = true; }
        else { c.lineTo(px, py); }
      }
    }
    c.stroke();
    c.restore();
    c.setLineDash([]);
  }

  c.fillStyle = '#8da8a4'; c.font = '12px "IBM Plex Mono", monospace';
  c.fillText(xMin.toFixed(1), pad, h - 6);
  c.fillText(xMax.toFixed(1), w - 60, h - 6);
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
    if (!failedNames.has('color_jump_proxy') && (failedNames.has('spectral_concentration') || failedNames.has('autocorrelation'))) {
      primary = 'Frequency evidence is diffuse across multiple peaks or cycle-to-cycle periodicity is low (spectral concentration < 0.50 or autocorrelation < 0.45). A stable repeating pulse could not be isolated from background sensor noise. Ensure steady, indirect front lighting across both cheeks, rest your chin to eliminate micro-motion, and confirm bare cheek skin fills both guide boxes.';
    } else {
      primary = 'Minimize movement: Keep your face and head completely stationary. Rest your chin or sit comfortably, breathe naturally, and avoid speaking, smiling, or sudden movements during the 30-second capture.';
    }
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
  if ($('checksSummaryBadge')) {
    const passCount = r.checks.filter(c => c.pass).length;
    $('checksSummaryBadge').textContent = `${passCount}/14 PASSED · ${r.quality_score}% SCORE · ${r.bpm !== null ? 'ACCEPTED' : 'ESTIMATE WITHHELD'}`;
    $('checksSummaryBadge').className = `summary-badge ${r.bpm !== null ? 'accepted' : 'withheld'}`;
  }
  $('checks').replaceChildren();
  for (const check of r.checks) {
    const row = document.createElement('div'); row.className = `check ${check.pass ? 'check-pass' : 'check-fail'}`;
    const header = document.createElement('div'); header.className = 'check-header';
    const title = document.createElement('strong'); title.className = check.pass ? 'pass' : 'fail';
    title.textContent = `${check.pass ? 'PASS' : 'FAIL'} · ${check.name.replaceAll('_', ' ')}: ${check.value} (${check.rule})`;
    header.append(title);
    const gauge = document.createElement('div'); gauge.className = 'check-gauge';
    const fill = document.createElement('div'); fill.className = `gauge-fill ${check.pass ? 'pass' : 'fail'}`;
    fill.style.width = check.pass ? '100%' : '35%';
    gauge.append(fill);
    row.append(header, gauge);
    if (!check.pass) {
      const p = document.createElement('div'); p.className = 'check-action';
      p.textContent = check.action;
      row.append(p);
    }
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
      const scoreDiffStr = deltaScore > 0 ? `+${deltaScore} percentage points` : (deltaScore < 0 ? `${deltaScore} percentage points` : 'no change');
      const prevBpm = previousSession.bpm !== null ? `${previousSession.bpm} BPM` : 'withheld';
      const currBpm = r.bpm !== null ? `${r.bpm} BPM` : 'withheld';
      const prevPassed = previousSession.checks.filter(c => c.pass).map(c => c.name);
      const currPassed = r.checks.filter(c => c.pass).map(c => c.name);
      const improved = currPassed.filter(n => !prevPassed.includes(n));
      const regressed = prevPassed.filter(n => !currPassed.includes(n));
      let cmp = `Comparison with previous run:\n• Score: ${previousSession.quality_score}% → ${r.quality_score}% (${scoreDiffStr})\n• Estimate: ${prevBpm} → ${currBpm}\n• Gates passed: ${prevPassed.length}/14 → ${currPassed.length}/14\n(Note: Quality score reflects the percentage of heuristic signal checks passed, not clinical accuracy or heart-rate precision.)`;
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
    const incoming=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{
        facingMode:'user',
        width:{ideal:640},
        height:{ideal:480},
        frameRate:{ideal:30}
      }
    });
    if(op!==operation){incoming.getTracks().forEach(t=>t.stop());return;}
    stream=incoming;video.srcObject=stream;await video.play();
    updateStageAspectRatio();
    video.onloadedmetadata = updateStageAspectRatio;

    // Apply continuous camera modes where available to prevent exposure hunting
    const [track] = stream.getVideoTracks();
    if (track && track.getCapabilities) {
      try {
        const caps = track.getCapabilities();
        const adv = {};
        if (caps.exposureMode?.includes('continuous')) adv.exposureMode = 'continuous';
        if (caps.whiteBalanceMode?.includes('continuous')) adv.whiteBalanceMode = 'continuous';
        if (caps.focusMode?.includes('continuous')) adv.focusMode = 'continuous';
        if (Object.keys(adv).length) await track.applyConstraints({ advanced: [adv] });
      } catch (_e) {}
    }

    if (readinessTimer) clearInterval(readinessTimer);
    readinessTimer = setInterval(checkReadiness, 200);

    status('Align the boxes onto both cheeks. Let exposure settle for five seconds, then capture.');
  }catch(e){stopMedia();status(`Camera unavailable: ${e.message}. You can still use a synthetic sample.`);}
  finally{busy=false;controls();}
};
function colors() {
  ctx.drawImage(video,0,0,320,240);
  let clipped=0,total=0;const means=[];
  const x1 = Math.round(320 * 0.32);
  const x2 = Math.round(320 * 0.56);
  const y = Math.round(240 * 0.48);
  const w = Math.round(320 * 0.12);
  const h = Math.round(240 * 0.12);
  for(const x of [x1, x2]){
    const pixels=ctx.getImageData(x, y, w, h).data;
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
  if (window.dismissHiperPulseIntro) window.dismissHiperPulseIntro(true);
  document.body.classList.add('is-capturing');
  if (readinessTimer) { clearInterval(readinessTimer); readinessTimer = null; }
  if ($('readinessHud')) $('readinessHud').style.display = 'none';
  const stage = $('captureStage'); if (stage) stage.classList.add('scanning');
  updateStageAspectRatio();
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
    updateStageAspectRatio();
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
    const declaredSource = receipt.source || 'unknown';
    const ingestionMethod = receipt.ingestion || currentTrace?.ingestion || 'direct';

    const isSyntheticFixture = Boolean(
      receipt.source === 'synthetic' && (
        (receipt.input_sha256 && TRUSTED_VIDEO_FIXTURES[receipt.input_sha256]) ||
        (receipt.signal_sha256 && TRUSTED_VIDEO_FIXTURES[receipt.signal_sha256]) ||
        ingestionMethod === 'synthetic_fixture' ||
        ingestionMethod === 'sample'
      )
    );

    let provenanceStatus = 'unknown_origin';
    let unverifiedOrigin = true;

    if (isSyntheticFixture) {
      provenanceStatus = 'known_synthetic_fixture';
      unverifiedOrigin = false;
    } else if (declaredSource === 'camera' && ingestionMethod === 'live_capture') {
      provenanceStatus = 'live_browser_capture';
      unverifiedOrigin = false;
    } else if (ingestionMethod === 'json_import') {
      provenanceStatus = 'declared_not_authenticated';
      unverifiedOrigin = true;
    } else if (declaredSource === 'video' || declaredSource === 'sample') {
      provenanceStatus = 'unknown_origin';
      unverifiedOrigin = true;
    } else {
      provenanceStatus = 'unknown_origin';
      unverifiedOrigin = true;
    }

    const card = {
      application: 'HiperPulse',
      version: buildMeta.version || '1.1',
      algorithm: receipt.algorithm || buildMeta.algorithm || 'green-evidence-1.1',
      git_sha: buildMeta.git_sha || 'unknown',
      provenance_note: 'Canonical signal_sha256 identifies the mathematical signal data rounded to 5 decimal places. git_sha identifies the software build revision. Neither constitutes a cryptographic signature of real human or camera origin.',
      timestamp_utc: new Date().toISOString(),
      declared_source: declaredSource,
      ingestion_method: ingestionMethod,
      is_synthetic: receipt.source === 'synthetic',
      unverified_origin: unverifiedOrigin,
      provenance_status: provenanceStatus,
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

// Active Theory × Vizo Inspired 3D Optical Sculpture & Living Constellation
function initHeroCanvas() {
  const canvas = $('heroCanvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0;
  let animId = null;
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const prefersReduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const startTime = performance.now();
  const nodeCount = 54;
  const nodes = [];

  function resize() {
    if (!canvas.parentElement) return;
    width = canvas.width = canvas.parentElement.offsetWidth || window.innerWidth;
    height = canvas.height = canvas.parentElement.offsetHeight || 600;
    if (!nodes.length) {
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: (Math.random() - 0.5) * width * 0.9,
          y: (Math.random() - 0.5) * height * 0.8,
          z: (Math.random() - 0.5) * 400,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          vz: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 1.8 + 0.8,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.012 + Math.random() * 0.02
        });
      }
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  window.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / (rect.width || 1) - 0.5;
    const ny = (e.clientY - rect.top) / (rect.height || 1) - 0.5;
    mouse.targetX = nx * 50;
    mouse.targetY = ny * 35;
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    mouse.targetX = 0;
    mouse.targetY = 0;
  }, { passive: true });

  let isVisible = true;
  if ('IntersectionObserver' in window && canvas.parentElement) {
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible && !animId && !prefersReduced) loop();
      else if (!isVisible && animId) { cancelAnimationFrame(animId); animId = null; }
    });
    observer.observe(canvas.parentElement);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    } else if (isVisible && !animId && !prefersReduced) {
      loop();
    }
  });

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Damped camera tilt
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    const now = performance.now();
    const elapsedSec = (now - startTime) / 1000;
    const unfold = Math.min(1.0, elapsedSec / 1.6);
    const easeUnfold = 1 - Math.pow(1 - unfold, 3);

    const cx = width / 2;
    const cy = height / 2;
    const fov = 450;

    // 1. Draw 3D Translucent Optical Sculpture (Elliptical Contour Ribbons)
    const ringCount = 7;
    const sculptureT = elapsedSec * 0.6;
    for (let r = 0; r < ringCount; r++) {
      const ringFrac = r / (ringCount - 1);
      const ringYOffset = (ringFrac - 0.5) * 220 * easeUnfold;
      const radiusX = Math.sin(ringFrac * Math.PI) * 140 * easeUnfold + 20;
      const radiusZ = radiusX * 0.85;

      ctx.beginPath();
      const segs = 36;
      let firstPt = null;
      for (let s = 0; s <= segs; s++) {
        const theta = (s / segs) * Math.PI * 2 + sculptureT * 0.15 * (r % 2 === 0 ? 1 : -1);
        const lx = Math.cos(theta) * radiusX;
        const ly = ringYOffset + Math.sin(theta * 2 + sculptureT) * 6;
        const lz = Math.sin(theta) * radiusZ;

        // Apply mouse tilt
        const rotX = (mouse.y * 0.015);
        const rotY = (mouse.x * 0.015);
        const yRotated = ly * Math.cos(rotX) - lz * Math.sin(rotX);
        const zRotated = ly * Math.sin(rotX) + lz * Math.cos(rotX);
        const xRotated = lx * Math.cos(rotY) + zRotated * Math.sin(rotY);
        const finalZ = -lx * Math.sin(rotY) + zRotated * Math.cos(rotY);

        const scale = fov / (fov + finalZ + 300);
        const px = cx + xRotated * scale;
        const py = cy + yRotated * scale;

        if (s === 0) { ctx.moveTo(px, py); firstPt = { px, py }; }
        else { ctx.lineTo(px, py); }
      }
      const ringAlpha = (0.04 + Math.sin(ringFrac * Math.PI) * 0.08) * easeUnfold;
      ctx.strokeStyle = `rgba(138, 232, 196, ${ringAlpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 2. Twin Optical Cheek Fields in 3D
    const cheekPoints = [
      { x: -55 * easeUnfold, y: 15 * easeUnfold, label: 'CHEEK_L' },
      { x: 55 * easeUnfold, y: 15 * easeUnfold, label: 'CHEEK_R' }
    ];
    for (let c = 0; c < cheekPoints.length; c++) {
      const pt = cheekPoints[c];
      const rotX = mouse.y * 0.015;
      const rotY = mouse.x * 0.015;
      const yRot = pt.y * Math.cos(rotX);
      const zRot = pt.y * Math.sin(rotX);
      const xRot = pt.x * Math.cos(rotY) + zRot * Math.sin(rotY);
      const scale = fov / (fov + zRot + 300);
      const px = cx + xRot * scale;
      const py = cy + yRot * scale;

      // Pulse beacon ring
      const beaconR = (8 + (Math.sin(sculptureT * 3 + c * Math.PI) + 1) * 6) * scale * easeUnfold;
      ctx.strokeStyle = 'rgba(62, 232, 159, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, beaconR), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(62, 232, 159, 0.9)';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, 2.5 * scale * easeUnfold), 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Ambient Photon Cloud Nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!prefersReduced) {
        n.x += n.vx; n.y += n.vy; n.z += n.vz;
        n.phase += n.pulseSpeed;
        const bX = width * 0.48, bY = height * 0.42;
        if (n.x < -bX) { n.x = -bX; n.vx *= -1; }
        else if (n.x > bX) { n.x = bX; n.vx *= -1; }
        if (n.y < -bY) { n.y = -bY; n.vy *= -1; }
        else if (n.y > bY) { n.y = bY; n.vy *= -1; }
        if (n.z < -200) { n.z = -200; n.vz *= -1; }
        else if (n.z > 200) { n.z = 200; n.vz *= -1; }
      }

      const rotX = mouse.y * 0.012;
      const rotY = mouse.x * 0.012;
      const yR = n.y * Math.cos(rotX) - n.z * Math.sin(rotX);
      const zR = n.y * Math.sin(rotX) + n.z * Math.cos(rotX);
      const xR = n.x * Math.cos(rotY) + zR * Math.sin(rotY);
      const finalZ = -n.x * Math.sin(rotY) + zR * Math.cos(rotY);

      const scale = fov / (fov + finalZ + 300);
      const px = cx + xR * scale;
      const py = cy + yR * scale;

      // Connecting lines
      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        const dist = Math.hypot(n.x - n2.x, n.y - n2.y, n.z - n2.z);
        if (dist < 100) {
          const alpha = (1 - dist / 100) * 0.12 * easeUnfold;
          const yR2 = n2.y * Math.cos(rotX) - n2.z * Math.sin(rotX);
          const zR2 = n2.y * Math.sin(rotX) + n2.z * Math.cos(rotX);
          const xR2 = n2.x * Math.cos(rotY) + zR2 * Math.sin(rotY);
          const s2 = fov / (fov + zR2 + 300);
          const px2 = cx + xR2 * s2;
          const py2 = cy + yR2 * s2;

          ctx.strokeStyle = `rgba(138, 232, 196, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px2, py2);
          ctx.stroke();
        }
      }

      const curRadius = Math.max(0.6, (n.radius + Math.sin(n.phase) * 0.4) * scale * easeUnfold);
      const nodeAlpha = Math.min(0.85, (0.35 + (finalZ + 200) / 400 * 0.45) * easeUnfold);
      ctx.fillStyle = `rgba(62, 232, 159, ${nodeAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, curRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop() {
    if (!isVisible || document.hidden || prefersReduced) return;
    // Low-resource capture mode: halt drawing during active recording
    if (capturing || document.body.classList.contains('is-capturing')) {
      animId = requestAnimationFrame(loop);
      return;
    }
    draw();
    animId = requestAnimationFrame(loop);
  }

  if (!prefersReduced) loop();
  else draw();
}

// --- 18. SIGNATURE INTRO: PHOTON GENESIS (ACTIVE THEORY-INSPIRED) ---
function initPhotonGenesisIntro() {
  const overlay = $('introOverlay');
  const canvas = $('introCanvas');
  const skipBtn = $('skipIntroBtn');
  const replayBtn = $('replayIntroBtn');
  const centerMotif = $('introCenterMotif');
  const heroHeadline = $('heroHeadline');

  if (!overlay || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  let animId = null;
  let isDismissed = false;
  const startTime = performance.now();

  const prefersReduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alreadyViewed = Boolean(sessionStorage.getItem('hiperpulse_intro_viewed') === 'true');
  const isAutomatedTest = Boolean(navigator.webdriver || window.location.search.includes('nointro'));

  function triggerKineticTypography() {
    if (!heroHeadline) return;
    const words = heroHeadline.querySelectorAll('.kinetic-word');
    words.forEach((w, idx) => {
      w.style.animationDelay = `${idx * 0.09 + 0.08}s`;
      w.classList.add('revealed');
    });
  }

  function dismissIntro(immediate = false) {
    if (isDismissed) return;
    isDismissed = true;
    sessionStorage.setItem('hiperpulse_intro_viewed', 'true');

    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }

    if (immediate) {
      overlay.style.display = 'none';
      overlay.classList.add('intro-dismissed');
      triggerKineticTypography();
      return;
    }

    overlay.classList.add('intro-dismissed');
    triggerKineticTypography();
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 800);
  }

  // Safety fallback: ensure headline reveals by 3.6s even if transition is delayed
  setTimeout(triggerKineticTypography, 3600);

  window.dismissHiperPulseIntro = dismissIntro;

  if (prefersReduced || alreadyViewed || isAutomatedTest) {
    dismissIntro(true);
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        sessionStorage.removeItem('hiperpulse_intro_viewed');
        window.location.reload();
      });
    }
    return;
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', e => {
      e.preventDefault();
      dismissIntro(false);
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      sessionStorage.removeItem('hiperpulse_intro_viewed');
      window.location.reload();
    });
  }

  window.addEventListener('keydown', e => {
    if (!isDismissed && (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Space')) {
      e.preventDefault();
      dismissIntro(false);
    }
  });

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  const mouse = { x: w / 2, y: h / 2, moved: false };
  window.addEventListener('pointermove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.moved = true;
  }, { passive: true });

  const TOTAL_PARTICLES = 135;
  const particles = [];
  const cx = w / 2;
  const cy = h / 2;

  for (let i = 0; i < TOTAL_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 260;
    const size = Math.random() * 1.8 + 1.1;

    let targetType = 'crest';
    let tx = cx, ty = cy;
    if (i < 45) {
      targetType = 'cheekL';
      const arcFrac = i / 44;
      const arcAngle = (arcFrac - 0.5) * Math.PI * 0.72;
      tx = cx - 110 + Math.cos(arcAngle) * 35;
      ty = cy + Math.sin(arcAngle) * 75;
    } else if (i < 90) {
      targetType = 'cheekR';
      const arcFrac = (i - 45) / 44;
      const arcAngle = (arcFrac - 0.5) * Math.PI * 0.72;
      tx = cx + 110 - Math.cos(arcAngle) * 35;
      ty = cy + Math.sin(arcAngle) * 75;
    } else {
      targetType = 'crest';
      const waveFrac = (i - 90) / 44;
      const waveX = (waveFrac - 0.5) * 160;
      const u = waveFrac * 4 * Math.PI;
      const waveY = -Math.sin(u) * 22 * Math.exp(-Math.pow(waveFrac - 0.35, 2) * 8)
                    + Math.sin(u * 2) * 8 * Math.exp(-Math.pow(waveFrac - 0.65, 2) * 12);
      tx = cx + waveX;
      ty = cy + waveY;
    }

    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      tx,
      ty,
      targetType,
      alpha: 1.0
    });
  }

  const dust = [];
  for (let d = 0; d < 28; d++) {
    dust.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.5) * 16,
      size: Math.random() * 1.2 + 0.4
    });
  }

  let lastFrameTime = performance.now();

  function renderIntroFrame(now) {
    if (isDismissed) return;
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    const elapsed = (now - startTime) / 1000;

    const curCx = w / 2;
    const curCy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Stage 1: Optical Singularity Void (0.0s to 0.6s)
    if (elapsed < 0.6) {
      const breath = Math.sin(elapsed * 12) * 3.5;
      const coreGrad = ctx.createRadialGradient(curCx, curCy, 0, curCx, curCy, 16 + breath);
      coreGrad.addColorStop(0, '#eef2ed');
      coreGrad.addColorStop(0.25, '#3ee89f');
      coreGrad.addColorStop(0.65, 'rgba(62, 232, 159, 0.45)');
      coreGrad.addColorStop(1, 'rgba(3, 9, 7, 0)');

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(curCx, curCy, 18 + breath, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(curCx, curCy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ambient micro-dust
    ctx.fillStyle = 'rgba(138, 232, 196, 0.22)';
    for (const dp of dust) {
      dp.x += dp.vx * dt;
      dp.y += dp.vy * dt;
      if (dp.x < 0) dp.x = w;
      if (dp.x > w) dp.x = 0;
      if (dp.y < 0) dp.y = h;
      if (dp.y > h) dp.y = 0;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, dp.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stages 2 through 5: Particles Active (0.6s onwards)
    if (elapsed >= 0.6) {
      const stageElapsed = elapsed - 0.6;
      const isIgnition = stageElapsed < 0.9;
      const isFormation = stageElapsed >= 0.9 && stageElapsed < 1.8;
      const isEmblem = stageElapsed >= 1.8 && stageElapsed < 2.4;
      const isDissolve = stageElapsed >= 2.4;

      if (centerMotif) {
        if (stageElapsed < 1.8) {
          centerMotif.style.opacity = '0';
          centerMotif.style.transform = 'scale(0.85)';
        } else if (isEmblem) {
          const embProgress = Math.min(1.0, (stageElapsed - 1.8) / 0.4);
          centerMotif.style.opacity = String(embProgress);
          centerMotif.style.transform = `scale(${0.85 + embProgress * 0.15})`;
        } else if (isDissolve) {
          const dissProgress = (stageElapsed - 2.4) / 0.8;
          centerMotif.style.opacity = String(Math.max(0, 1.0 - dissProgress * 1.5));
          centerMotif.style.transform = `scale(${1.0 + dissProgress * 0.9})`;
        }
      }

      // Optical filament lines between particles during Stage 3 (Formation) & Stage 4
      if (stageElapsed >= 0.9 && stageElapsed < 2.5) {
        const lineAlpha = stageElapsed < 1.4
          ? (stageElapsed - 0.9) / 0.5
          : stageElapsed > 2.2
            ? (2.5 - stageElapsed) / 0.3
            : 1.0;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < TOTAL_PARTICLES; i += 2) {
          for (let j = i + 1; j < TOTAL_PARTICLES; j += 3) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 2500) {
              const d = Math.sqrt(distSq);
              ctx.strokeStyle = `rgba(62, 232, 159, ${(1 - d / 50) * 0.35 * lineAlpha})`;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.stroke();
            }
          }
        }
      }

      // Particle physics & rendering
      for (let i = 0; i < TOTAL_PARTICLES; i++) {
        const p = particles[i];

        if (isIgnition) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= Math.pow(0.92, dt * 60);
          p.vy *= Math.pow(0.92, dt * 60);
        } else if (isFormation || isEmblem) {
          const pullK = isFormation ? 0.08 : 0.14;
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          p.vx += dx * pullK;
          p.vy += dy * pullK;
          p.vx *= 0.82;
          p.vy *= 0.82;
          p.x += p.vx;
          p.y += p.vy;

          if (mouse.moved) {
            const mdx = p.x - mouse.x;
            const mdy = p.y - mouse.y;
            const mDistSq = mdx * mdx + mdy * mdy;
            if (mDistSq < 10000 && mDistSq > 1) {
              const mDist = Math.sqrt(mDistSq);
              const repel = (1 - mDist / 100) * 4;
              p.x += (mdx / mDist) * repel;
              p.y += (mdy / mDist) * repel;
            }
          }
        } else if (isDissolve) {
          const dissT = stageElapsed - 2.4;
          const outwardX = (p.x - curCx) || (Math.random() - 0.5);
          const outwardY = (p.y - curCy) || (Math.random() - 0.5);
          const dist = Math.sqrt(outwardX * outwardX + outwardY * outwardY) || 1;
          const warpSpeed = 320 + dissT * 950;
          p.x += (outwardX / dist) * warpSpeed * dt;
          p.y += (outwardY / dist) * warpSpeed * dt;
          p.alpha = Math.max(0, 1 - dissT / 0.8);
        }

        ctx.save();
        ctx.fillStyle = p.targetType === 'crest'
          ? `rgba(138, 232, 196, ${p.alpha * 0.95})`
          : `rgba(62, 232, 159, ${p.alpha * 0.85})`;
        ctx.shadowColor = 'rgba(62, 232, 159, 0.6)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (elapsed >= 3.8 && !isDismissed) {
      dismissIntro(false);
      return;
    }

    animId = requestAnimationFrame(renderIntroFrame);
  }

  animId = requestAnimationFrame(renderIntroFrame);
}

// Magnetic Button Interaction
function initMagneticButtons() {
  const btns = document.querySelectorAll('.magnetic-btn');
  btns.forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.22}px, ${y * 0.22}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
}

function initApp() {
  initPhotonGenesisIntro();
  initHeroCanvas();
  initMagneticButtons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}


