'use strict';
const $ = id => document.getElementById(id);
const video = $('video');
let stream = null, localUrl = null, currentTrace = null, receipt = null;
let capturing = false, busy = false, generation = 0, operation = 0, captureTimer = null;
let selectedVideo = false, videoUsable = false, selectedFileName = '';
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
  for (const id of ['receipt','trace','explain','stress']) $(id).disabled = locked || !receipt;
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
  currentTrace = null; receipt = null;
  $('bpm').textContent = '—'; $('quality').textContent = '—';
  $('source').textContent = 'NO INPUT YET'; $('decision').textContent = 'Choose an input to begin.';
  $('checks').replaceChildren(); $('comparison').textContent = '';
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
  const trace={source,timestamps:[],left:[],right:[],clipping:[]};let first=null;
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
  try{const data=JSON.parse(await f.text());data.source=data.source==='synthetic'?'synthetic':'sample';await runTrace(data);}
  catch(e){status(`Invalid trace: ${e.message}`);}
};
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('receipt').onclick=()=>receipt&&download(receipt,'hiperpulse-evidence.json');
$('trace').onclick=()=>currentTrace&&download(currentTrace,'hiperpulse-trace.json');
$('stress').onclick=async()=>{
  if(!currentTrace)return;const op=operation;busy=true;controls();
  const copy=structuredClone(currentTrace);copy.source='synthetic';
  copy.right=copy.right.map((row,i)=>row.map((v,c)=>c===1?Math.max(0,Math.min(255,v+8*Math.sin(2*Math.PI*1.85*copy.timestamps[i]))):v));
  try{const result=await request('/api/analyze',copy);if(op!==operation)return;
    const failed=result.checks.filter(c=>!c.pass).map(c=>c.name.replaceAll('_',' '));
    $('comparison').textContent=`Original: ${receipt.bpm??'withheld'} BPM, ${receipt.quality_score}% checks passed.\nArtifact copy: ${result.bpm??'withheld'} BPM, ${result.quality_score}% checks passed.\nFailed checks: ${failed.join(', ')||'none — an example of the limits of these heuristics'}. Original input and receipt are unchanged.`;
  }catch(e){status(e.message);}finally{busy=false;controls();}
};
$('explain').onclick=async()=>{
  if(!$('aiConsent').checked){$('explanation').textContent='Review and accept the summary-sharing option first.';return;}
  const op=operation;busy=true;controls();$('explanation').textContent='Preparing explanation…';
  try{const result=await request('/api/explain',currentTrace,{'X-Demo-Token':$('token').value});
    if(op!==operation)return;
    $('explanation').textContent=`${result.provider}${result.model?' / '+result.model:''}\n${result.reason||result.notice||''}\n${result.text}`;
  }catch(e){if(op===operation)$('explanation').textContent=e.message;}
  finally{busy=false;controls();}
};
$('clear').onclick=()=>{operation++;busy=false;stopMedia();blank();$('token').value='';$('consent').checked=false;$('aiConsent').checked=false;$('file').value='';$('traceFile').value='';status('Session cleared and camera stopped. Downloaded files are not deleted.');};
window.addEventListener('pagehide',stopMedia);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&capturing){stopMedia();status('Capture discarded because the tab was hidden.');}});
controls();
