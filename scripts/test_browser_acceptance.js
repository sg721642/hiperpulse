#!/usr/bin/env node
/**
 * Automated Browser Acceptance Suite using Chromium/Brave via CDP.
 * Drives the real HiperPulse UI, verifies camera/video lifecycle,
 * video processing, withholding, provenance, downloads, and reimport.
 * 
 * F03 Hardenings:
 * - Pre-registered test registry
 * - Explicit PASS/FAIL/SKIP/BLOCKED statuses
 * - Mandatory timeout handling (timeouts explicitly FAIL)
 * - Negative regression mode via TEST_NEGATIVE_TIMEOUT=1
 * - Real file-input DOM dispatch via CDP DOM.setFileInputFiles
 * - Configurable browser executable and ports
 * - Bounded CDP communication timeouts
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || '8080', 10);
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);

function resolveBrowserBin() {
  if (process.env.BROWSER_BIN && fs.existsSync(process.env.BROWSER_BIN)) return process.env.BROWSER_BIN;
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/brave-browser'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'google-chrome';
}

const BROWSER_BIN = resolveBrowserBin();

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.consoleLogs = [];
    this.pageErrors = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        if (msg.method === 'Runtime.consoleAPICalled') {
          this.consoleLogs.push(msg.params);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.pageErrors.push(msg.params);
        }
      }
    };

    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('DOM.enable');
  }

  async send(method, params = {}, timeoutMs = 25000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP command ${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`);
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.once('listening', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.listen(0, '127.0.0.1');
  });
}

function sanitizeDiagnostics(text) {
  if (typeof text !== 'string') return String(text);
  return text.replace(/[A-Za-z0-9_-]{35,}/g, '[REDACTED_SECRET]');
}

async function launchBrowserAttempt(attemptNumber, preferredPort) {
  let cdpPort = preferredPort;
  if (!process.env.CDP_PORT) {
    const isFree = await checkPortAvailable(cdpPort);
    if (!isFree) {
      cdpPort = await getFreePort();
      console.log(`[Attempt ${attemptNumber}] Preferred CDP port ${preferredPort} is busy. Switched to dynamic port ${cdpPort}.`);
    }
  }

  const userDataDir = path.resolve('/tmp', `browser_test_${Date.now()}_${attemptNumber}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const stderrBuffer = [];
  let childExitCode = null;
  let childSignal = null;
  let childExited = false;
  let childSpawnError = null;

  let browserProc = null;
  try {
    browserProc = spawn(BROWSER_BIN, [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-first-run',
      '--no-default-browser-check',
      `http://127.0.0.1:${PORT}/`
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    throw {
      phase: 'spawn',
      attemptNumber,
      browserBin: BROWSER_BIN,
      cdpPort,
      userDataDir,
      error: sanitizeDiagnostics(err.message),
      stderrTail: []
    };
  }

  browserProc.stderr.on('data', chunk => {
    const lines = chunk.toString('utf-8').split('\n');
    for (const line of lines) {
      const sanitized = sanitizeDiagnostics(line.trim());
      if (sanitized) {
        stderrBuffer.push(sanitized);
        if (stderrBuffer.length > 50) stderrBuffer.shift();
      }
    }
  });

  browserProc.on('error', err => {
    childSpawnError = err;
    childExited = true;
  });

  browserProc.on('exit', (code, signal) => {
    childExited = true;
    childExitCode = code;
    childSignal = signal;
  });

  const startTime = Date.now();
  let target = null;
  let phase = 'readiness_check';

  try {
    for (let i = 0; i < 40; i++) {
      if (childExited) {
        phase = 'early_process_exit';
        const reason = childSpawnError ? childSpawnError.message : `code=${childExitCode}, signal=${childSignal}`;
        throw new Error(`Browser process exited prematurely (${reason})`);
      }
      await sleep(350);

      // Phase 1: verify CDP HTTP server readiness
      try {
        const verRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (verRes.ok) {
          phase = 'target_discovery';
          // Phase 2: inspect /json/list
          const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(1000) });
          if (listRes.ok) {
            const targets = await listRes.json();
            target = targets.find(t => t.url?.includes(`:${PORT}`) && t.webSocketDebuggerUrl) ||
                     targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (target) break;

            // Phase 3: If debugger is active but target not ready after 2.5s, create page target explicitly
            if (Date.now() - startTime > 2500) {
              phase = 'target_creation';
              try {
                const newRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${PORT}/`, {
                  method: 'PUT',
                  signal: AbortSignal.timeout(2000)
                });
                if (newRes.ok) {
                  const newTarget = await newRes.json();
                  if (newTarget.webSocketDebuggerUrl) {
                    target = newTarget;
                    break;
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    if (!target) {
      phase = 'target_timeout';
      throw new Error(`Failed to find or create browser page target via CDP after ${Date.now() - startTime}ms`);
    }

    phase = 'ws_connection';
    const client = new CDPClient(target.webSocketDebuggerUrl);
    await client.connect();

    return {
      proc: browserProc,
      client,
      cdpPort,
      userDataDir,
      target,
      stderrBuffer
    };
  } catch (err) {
    try { browserProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
    throw {
      phase,
      attemptNumber,
      browserBin: BROWSER_BIN,
      cdpPort,
      userDataDir,
      childExited,
      childExitCode,
      childSignal,
      error: sanitizeDiagnostics(err.message),
      stderrTail: stderrBuffer.slice(-20),
      durationMs: Date.now() - startTime
    };
  }
}

async function launchBrowserWithRetry(preferredPort) {
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Starting headless browser (Attempt ${attempt}/2) on ${BROWSER_BIN}...`);
      const res = await launchBrowserAttempt(attempt, preferredPort);
      console.log(`✓ Browser connected on CDP port ${res.cdpPort} (profile: ${res.userDataDir})`);
      return res;
    } catch (diag) {
      attempts.push(diag);
      console.warn(`[Browser Startup Warning] Attempt ${attempt} failed in phase "${diag.phase}": ${diag.error}`);
      if (attempt < 2) {
        await sleep(1000);
      }
    }
  }

  const fatalDiag = {
    timestamp: new Date().toISOString(),
    browserBin: BROWSER_BIN,
    preferredPort,
    targetPort: PORT,
    attempts
  };
  try {
    const diagPath = path.resolve(ROOT, 'test-results', 'browser-startup-diagnostics.json');
    fs.mkdirSync(path.dirname(diagPath), { recursive: true });
    fs.writeFileSync(diagPath, JSON.stringify(fatalDiag, null, 2), 'utf-8');
    console.error(`Detailed browser startup diagnostics saved: ${diagPath}`);
  } catch {}

  throw new Error(`Failed to launch browser and acquire CDP session after 2 attempts:\n${JSON.stringify(attempts, null, 2)}`);
}

// ---------------------------------------------------------------------------
// Pre-registered Test Suite Definition (F03)
// ---------------------------------------------------------------------------
const REGISTERED_TESTS = [
  { id: 'T01', name: 'Security headers & .env exclusion', mandatory: true },
  { id: 'T02', name: 'Consent verification enforcement', mandatory: true },
  { id: 'T03', name: 'Synthetic clean sample (72 BPM, 100% score, 14 passed checks)', mandatory: true },
  { id: 'T04', name: 'Artifact sample withholding (BPM null, 86% quality score)', mandatory: true },
  { id: 'T05', name: 'Flat sample withholding (BPM null, 64% quality score)', mandatory: true },
  { id: 'T06', name: 'Artifact stress comparison lab (preserves original)', mandatory: true },
  { id: 'T07', name: 'Evidence receipt & trace real file-input reimport', mandatory: true },
  { id: 'T08', name: 'Camera capture stop/discard clean reset', mandatory: true },
  { id: 'T09', name: 'Tab-hide visibility interruption abort', mandatory: true },
  { id: 'T10', name: 'Clear session UI and memory reset', mandatory: true },
  { id: 'T11', name: 'Synthetic 30s WebM browser playback (0 gaps, 72 BPM)', mandatory: true },
  { id: 'T12', name: 'Short 12s video duration gate withholding', mandatory: true },
  { id: 'T13', name: 'Gemma 4 AI consent gate and demo token enforcement', mandatory: process.env.REQUIRE_LIVE_AI === '1' },
  { id: 'T14', name: 'Real Gemma 4 clean synthetic explanation in browser', mandatory: process.env.REQUIRE_LIVE_AI === '1' },
  { id: 'T15', name: 'Real Gemma 4 failed-quality explanation in browser', mandatory: process.env.REQUIRE_LIVE_AI === '1' },
  { id: 'T16', name: 'Clear session resets explanation, token, and consent', mandatory: process.env.REQUIRE_LIVE_AI === '1' },
  { id: 'T17', name: 'Zero uncaught page errors/exceptions in browser', mandatory: true }
];

async function main() {
  console.log('=== HIPERPULSE AUTOMATED BROWSER ACCEPTANCE SUITE ===');
  console.log(`Using Browser Binary: ${BROWSER_BIN}`);
  console.log(`Target Port: ${PORT}, CDP Port: ${CDP_PORT}`);
  if (process.env.TEST_NEGATIVE_TIMEOUT) {
    console.log('>>> RUNNING IN NEGATIVE REGRESSION TIMEOUT MODE (forcing T11 timeout) <<<');
  }

  // Verify server is up
  const healthRes = await fetch(`http://127.0.0.1:${PORT}/api/health`);
  if (!healthRes.ok) throw new Error(`Server health check failed: ${healthRes.status}`);
  console.log('✓ Localhost server active and healthy');

  let launchResult = null;
  let browserProc = null;
  let client = null;
  let USER_DATA_DIR = null;
  let DOWNLOAD_DIR = null;
  const testResults = new Map();

  function recordResult(id, status, detail = '') {
    const testDef = REGISTERED_TESTS.find(t => t.id === id);
    testResults.set(id, {
      id,
      name: testDef ? testDef.name : id,
      mandatory: testDef ? testDef.mandatory : true,
      status, // 'PASS', 'FAIL', 'SKIP', 'BLOCKED'
      detail
    });
    const mark = status === 'PASS' ? '✓' : (status === 'SKIP' ? '○' : '✗');
    console.log(`${mark} [${id}] ${status}: ${testDef?.name || id} ${detail ? '(' + detail + ')' : ''}`);
  }

  try {
    launchResult = await launchBrowserWithRetry(CDP_PORT);
    browserProc = launchResult.proc;
    client = launchResult.client;
    USER_DATA_DIR = launchResult.userDataDir;
    DOWNLOAD_DIR = path.resolve(USER_DATA_DIR, 'downloads');
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    try { await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR }); } catch {}
    try { await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR, eventsEnabled: true }); } catch {}

    // Ensure the page is navigated to target URL and loaded
    await client.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await sleep(1500);

    // TEST 1: Security headers & sensitive files
    console.log('\n--- Test 1: Security Headers & Protected Files ---');
    try {
      const rootRes = await fetch(`http://127.0.0.1:${PORT}/`);
      const csp = rootRes.headers.get('content-security-policy') || '';
      const cache = rootRes.headers.get('cache-control') || '';
      const nosniff = rootRes.headers.get('x-content-type-options') || '';
      const envRes = await fetch(`http://127.0.0.1:${PORT}/.env`);
      if (csp.includes("frame-ancestors 'none'") && cache.includes('no-store') && nosniff === 'nosniff' && envRes.status === 404) {
        recordResult('T01', 'PASS');
      } else {
        recordResult('T01', 'FAIL', `csp=${Boolean(csp)}, envStatus=${envRes.status}`);
      }
    } catch (e) { recordResult('T01', 'FAIL', e.message); }

    // TEST 2: Consent Gate Validation
    console.log('\n--- Test 2: Consent Gate Validation ---');
    try {
      await client.eval(`$('consent').checked = false; capture('camera');`);
      let statusText = await client.eval(`$('status').textContent`);
      const consentBlocked = statusText.includes('Please accept trace processing first') || statusText.includes('accept trace processing');

      // Samples should still work without recording consent
      await client.eval(`$('clean').click();`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
      }
      const sampleBpm = await client.eval(`$('bpm').textContent`);
      if (consentBlocked && sampleBpm === '72') {
        recordResult('T02', 'PASS');
      } else {
        recordResult('T02', 'FAIL', `consentBlocked=${consentBlocked}, sampleBpm=${sampleBpm}`);
      }
    } catch (e) { recordResult('T02', 'FAIL', e.message); }

    // TEST 3: Synthetic Clean Sample Flow
    console.log('\n--- Test 3: Synthetic Clean Sample Flow ---');
    try {
      await client.eval(`$('clean').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        const st = await client.eval(`$('status').textContent`);
        if (st.includes('Analysis complete')) break;
      }
      const cleanBpm = await client.eval(`$('bpm').textContent`);
      const cleanQuality = await client.eval(`$('quality').textContent`);
      const cleanSource = await client.eval(`$('source').textContent`);
      const cleanChecks = await client.eval(`
        Array.from($('checks').querySelectorAll('.check strong')).map(e => ({
          pass: e.classList.contains('pass'),
          text: e.textContent
        }))
      `);
      if (cleanBpm === '72' && cleanQuality === '100%' && cleanSource.includes('SYNTHETIC') && cleanChecks.length === 14 && cleanChecks.every(c => c.pass)) {
        recordResult('T03', 'PASS', `BPM=${cleanBpm}, Quality=${cleanQuality}`);
      } else {
        recordResult('T03', 'FAIL', `BPM=${cleanBpm}, Quality=${cleanQuality}`);
      }
    } catch (e) { recordResult('T03', 'FAIL', e.message); }

    // TEST 4: Artifact Sample Withholding
    console.log('\n--- Test 4: Artifact Sample Withholding ---');
    try {
      await client.eval(`$('artifact').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
      }
      const artifactBpm = await client.eval(`$('bpm').textContent`);
      const artifactQuality = await client.eval(`$('quality').textContent`);
      const retakeText = await client.eval(`$('retakeAdvice') ? $('retakeAdvice').textContent : ''`);
      const hasRetakeDetails = retakeText.includes('Failed check actions:') || retakeText.includes('patch difference');
      if (artifactBpm === '—' && artifactQuality === '86%' && hasRetakeDetails) {
        recordResult('T04', 'PASS', `BPM=${artifactBpm}, Quality=${artifactQuality}, retakeAdvice=verified`);
      } else {
        recordResult('T04', 'FAIL', `BPM=${artifactBpm}, Quality=${artifactQuality}, retakeAdvice=${hasRetakeDetails}`);
      }
    } catch (e) { recordResult('T04', 'FAIL', e.message); }

    // TEST 5: Flat Sample Withholding & Challenge C Limitation
    console.log('\n--- Test 5: Flat Sample Withholding & Challenge C Limitation ---');
    try {
      await client.eval(`$('flat').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
      }
      const flatBpm = await client.eval(`$('bpm').textContent`);
      const flatQuality = await client.eval(`$('quality').textContent`);

      // Run Challenge C (Shared Periodic Light) on flat baseline to demonstrate optical rPPG limits
      await client.eval(`$('challengeC').click();`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        const comp = await client.eval(`$('comparison').textContent`);
        if (comp.includes('CRITICAL SCIENTIFIC LIMITATION OBSERVED')) break;
      }
      const cComp = await client.eval(`$('comparison').textContent`);
      const cExhibited = cComp.includes('CRITICAL SCIENTIFIC LIMITATION OBSERVED');

      if (flatBpm === '—' && flatQuality === '64%' && cExhibited) {
        recordResult('T05', 'PASS', `BPM=${flatBpm}, Quality=${flatQuality}, challengeC=limitation_verified`);
      } else {
        recordResult('T05', 'FAIL', `BPM=${flatBpm}, Quality=${flatQuality}, limitationVerified=${cExhibited}`);
      }
    } catch (e) { recordResult('T05', 'FAIL', e.message); }

    // TEST 6: Artifact Stress Comparison Lab & Guided Retake Delta
    console.log('\n--- Test 6: Artifact Stress Comparison Lab & Guided Retake Delta ---');
    try {
      await client.eval(`$('clean').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
      }
      // Verify Guided Retake Comparison: flat was previous (64%), clean is current (100%)
      const retakeCmp = await client.eval(`$('retakeComparison') ? $('retakeComparison').textContent : ''`);
      const retakeCmpVerified = retakeCmp.includes('Comparison with previous run:') &&
                                retakeCmp.includes('Score: 64% → 100% (+36 percentage points)') &&
                                retakeCmp.includes('Quality score reflects the percentage of heuristic signal checks passed');

      // Verify canvas overlay functions with disparate array lengths (450 vs 455 points) and gap handling
      const overlayCheck = await client.eval(`(() => {
        try {
          const xs1 = Array.from({ length: 450 }, (_, i) => i * (30 / 450));
          const ys1 = xs1.map(x => Math.sin(2 * Math.PI * 1.2 * x));
          const xs2 = Array.from({ length: 455 }, (_, i) => i * (30 / 455) + (i > 227 ? 0.35 : 0));
          const ys2 = xs2.map(x => Math.cos(2 * Math.PI * 1.2 * x));
          plotOverlay('wave', xs1, ys1, xs2, ys2, '#8ae8c4', '#f1cc8b');
          const canvas = $('wave');
          return { ok: true, width: canvas.width, height: canvas.height };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })()`);

      await client.eval(`$('stress').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        const compText = await client.eval(`$('comparison').textContent`);
        if (compText.includes('Original:') && compText.includes('Artifact copy:')) break;
      }
      const comparisonText = await client.eval(`$('comparison').textContent`);
      const baseBpmAfterStress = await client.eval(`$('bpm').textContent`);
      if (comparisonText.includes('Original: 72 BPM, 100%') && comparisonText.includes('Artifact copy: withheld BPM, 79%') && baseBpmAfterStress === '72' && retakeCmpVerified && overlayCheck.ok) {
        recordResult('T06', 'PASS', 'Guided retake delta (+36 percentage points), stress comparison & canvas overlay verified');
      } else {
        recordResult('T06', 'FAIL', `retakeCmp=${retakeCmpVerified}, overlayOk=${overlayCheck?.ok}, comp=${comparisonText.slice(0, 50)}`);
      }
    } catch (e) { recordResult('T06', 'FAIL', e.message); }

    // TEST 7: Receipt & Real File-Input Reimport Round Trip (F06, F08)
    console.log('\n--- Test 7: Receipt & Trace Real File-Input Reimport ---');
    try {
      await client.eval(`$('clean').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
      }
      const originalReceipt = await client.eval(`receipt`);
      const originalSignalHash = originalReceipt.signal_sha256;

      // 1. Real browser download of trace via $('trace').click()
      await client.eval(`$('trace').click()`);
      const traceFilePath = path.join(DOWNLOAD_DIR, 'hiperpulse-trace.json');
      let traceDownloaded = false;
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        if (fs.existsSync(traceFilePath)) {
          traceDownloaded = true;
          break;
        }
      }
      if (!traceDownloaded) throw new Error('Trace file was not downloaded to disk');
      const downloadedTraceRaw = fs.readFileSync(traceFilePath, 'utf8');
      const downloadedTrace = JSON.parse(downloadedTraceRaw);
      if (!Array.isArray(downloadedTrace.timestamps) || downloadedTrace.timestamps.length < 150) {
        throw new Error('Downloaded trace file is malformed');
      }

      // 2. Real browser download of judge evidence card via $('evidenceCard').click()
      await client.eval(`$('evidenceCard').click()`);
      const cardFilePath = path.join(DOWNLOAD_DIR, 'hiperpulse-judge-evidence.json');
      let cardDownloaded = false;
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        if (fs.existsSync(cardFilePath)) {
          cardDownloaded = true;
          break;
        }
      }
      if (!cardDownloaded) throw new Error('Judge evidence card was not downloaded to disk');
      const downloadedCardRaw = fs.readFileSync(cardFilePath, 'utf8');
      const card = JSON.parse(downloadedCardRaw);
      if (card.application !== 'HiperPulse' || card.algorithm !== 'green-evidence-1.1' ||
          card.signal_sha256 !== originalSignalHash || card.bpm_estimate !== 72 ||
          card.is_synthetic !== true || !card.provenance_note?.includes('rounded to 5 decimal places') ||
          !Array.isArray(card.disclaimers) || card.disclaimers.length !== 3) {
        throw new Error(`Judge evidence card validation failed: app=${card.application}, algo=${card.algorithm}`);
      }

      // 3. Clear session to guarantee reimport starts from blank state
      await client.eval(`$('clear').click()`);
      await sleep(150);

      // 4. Reimport via real CDP DOM.setFileInputFiles on #traceFile
      await client.eval(`$('consent').checked = true;`);
      const doc = await client.send('DOM.getDocument');
      const traceInput = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#traceFile' });
      await client.send('DOM.setFileInputFiles', { files: [traceFilePath], nodeId: traceInput.nodeId });

      for (let i = 0; i < 40; i++) {
        await sleep(100);
        const st = await client.eval(`$('status').textContent`);
        if (st.includes('Analysis complete')) break;
      }
      const reimportedReceipt = await client.eval(`receipt`);
      const reimportedLabel = await client.eval(`$('source').textContent`);
      if (!reimportedReceipt || reimportedReceipt.signal_sha256 !== originalSignalHash ||
          reimportedReceipt.bpm !== 72 || reimportedReceipt.quality_score !== 100 ||
          reimportedReceipt.ingestion !== 'json_import' ||
          reimportedLabel !== 'IMPORTED TRACE · DECLARED SYNTHETIC ORIGIN') {
        throw new Error(`Reimported receipt validation failed: label="${reimportedLabel}"`);
      }

      // 5. Test Judge Evidence Card downloads across all 8 provenance scenarios
      async function testCardProvenance(source, ingestion, expectedStatus, expectedUnverified, expectedSynthetic) {
        try { fs.unlinkSync(cardFilePath); } catch {}
        await client.eval(`
          receipt.source = ${JSON.stringify(source)};
          receipt.ingestion = ${JSON.stringify(ingestion)};
          $('evidenceCard').click();
        `);
        for (let i = 0; i < 25; i++) {
          await sleep(60);
          if (fs.existsSync(cardFilePath)) break;
        }
        if (!fs.existsSync(cardFilePath)) throw new Error(`Evidence card not downloaded for ${source}/${ingestion}`);
        const parsed = JSON.parse(fs.readFileSync(cardFilePath, 'utf8'));
        if (parsed.provenance_status !== expectedStatus) {
          throw new Error(`Expected provenance_status ${expectedStatus} for ${source}/${ingestion}, got ${parsed.provenance_status}`);
        }
        if (parsed.unverified_origin !== expectedUnverified) {
          throw new Error(`Expected unverified_origin ${expectedUnverified} for ${source}/${ingestion}, got ${parsed.unverified_origin}`);
        }
        if (parsed.is_synthetic !== expectedSynthetic) {
          throw new Error(`Expected is_synthetic ${expectedSynthetic} for ${source}/${ingestion}, got ${parsed.is_synthetic}`);
        }
        if (!Array.isArray(parsed.disclaimers) || parsed.disclaimers.length !== 3) {
          throw new Error(`Disclaimers missing from evidence card for ${source}/${ingestion}`);
        }
        // Verify no credentials or private traces in card
        const cardStr = JSON.stringify(parsed);
        if (cardStr.includes('AIza') || cardStr.includes('token') && parsed.token) {
          throw new Error('Credential leakage detected in Judge Evidence Card');
        }
        return parsed;
      }

      // 1. Generic sample
      await testCardProvenance('sample', 'sample', 'unknown_origin', true, false);
      // 2. Known project synthetic fixture
      await testCardProvenance('synthetic', 'synthetic_fixture', 'known_synthetic_fixture', false, true);
      // 3. Synthetic JSON reimport
      await testCardProvenance('synthetic', 'json_import', 'known_synthetic_fixture', false, true);
      // 4. Camera-declared JSON import (must be unverified_origin: true, declared_not_authenticated)
      await testCardProvenance('camera', 'json_import', 'declared_not_authenticated', true, false);
      // 5. Video-declared JSON import
      await testCardProvenance('video', 'json_import', 'declared_not_authenticated', true, false);
      // 6. Unknown local video
      await testCardProvenance('video', 'local_video', 'unknown_origin', true, false);
      // 7. Controlled live camera simulation
      await testCardProvenance('camera', 'live_capture', 'live_browser_capture', false, false);
      // 8. Unknown or legacy source
      await testCardProvenance('unknown_legacy', 'legacy_import', 'unknown_origin', true, false);

      recordResult('T07', 'PASS', `signal_sha256=${originalSignalHash.slice(0, 12)}..., BPM=72, 8 provenance card scenarios verified`);
    } catch (e) { recordResult('T07', 'FAIL', e.message); }

    // TEST 8: Camera Preview & Stop/Discard Lifecycle
    console.log('\n--- Test 8: Camera Lifecycle & Stop/Discard ---');
    try {
      await client.eval(`$('consent').checked = true; $('camera').click();`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        const st = await client.eval(`$('status').textContent`);
        if (st.includes('Align the boxes') || st.includes('Camera')) break;
      }
      await client.eval(`$('record').click()`);
      await sleep(1000);
      await client.eval(`$('stop').click()`);
      await sleep(200);
      const stoppedState = await client.eval(`({
        capturing: capturing,
        hasStream: Boolean(stream),
        status: $('status').textContent
      })`);
      if (!stoppedState.capturing && !stoppedState.hasStream && stoppedState.status.includes('Stopped. Incomplete capture discarded.')) {
        recordResult('T08', 'PASS');
      } else {
        recordResult('T08', 'FAIL', JSON.stringify(stoppedState));
      }
    } catch (e) { recordResult('T08', 'FAIL', e.message); }

    // TEST 9: Tab-Hide / Visibility Interruption
    console.log('\n--- Test 9: Tab-Hide Visibility Interruption ---');
    try {
      await client.eval(`$('consent').checked = true; $('camera').click();`);
      await sleep(500);
      await client.eval(`$('record').click()`);
      await sleep(500);
      await client.eval(`
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      `);
      await sleep(200);
      const visStatus = await client.eval(`$('status').textContent`);
      const capAfterHide = await client.eval(`capturing`);
      await client.eval(`Object.defineProperty(document, 'hidden', { value: false, configurable: true });`);
      if (!capAfterHide && visStatus.includes('Capture discarded because the tab was hidden')) {
        recordResult('T09', 'PASS');
      } else {
        recordResult('T09', 'FAIL', `capturing=${capAfterHide}, status="${visStatus}"`);
      }
    } catch (e) { recordResult('T09', 'FAIL', e.message); }

    // TEST 10: Clear Session Reset
    console.log('\n--- Test 10: Clear Session Reset ---');
    try {
      await client.eval(`$('clean').click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(100);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
      }
      await client.eval(`$('clear').click()`);
      const cleared = await client.eval(`({
        bpm: $('bpm').textContent,
        quality: $('quality').textContent,
        source: $('source').textContent,
        consent: $('consent').checked,
        hasTrace: Boolean(currentTrace)
      })`);
      if (cleared.bpm === '—' && cleared.quality === '—' && cleared.source === 'NO INPUT YET' && !cleared.consent && !cleared.hasTrace) {
        recordResult('T10', 'PASS');
      } else {
        recordResult('T10', 'FAIL', JSON.stringify(cleared));
      }
    } catch (e) { recordResult('T10', 'FAIL', e.message); }

    // TEST 11: Real-Time Video Playback & Timestamp Extraction (30s fixture)
    console.log('\n--- Test 11: Synthetic Video Playback & Extraction (30s fixture) ---');
    try {
      const vid30Path = path.resolve(ROOT, 'samples', 'test_video_30s.webm');
      const doc = await client.send('DOM.getDocument');
      const fileNode = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file' });
      await client.send('DOM.setFileInputFiles', { files: [vid30Path], nodeId: fileNode.nodeId });

      for (let i = 0; i < 40; i++) {
        await sleep(150);
        const st = await client.eval(`$('status').textContent`);
        if (st.includes('Preview alignment, then process')) break;
      }
      await client.eval(`$('consent').checked = true; $('processVideo').click();`);

      let videoProcessed = false;
      const maxPlaybackSeconds = process.env.TEST_NEGATIVE_TIMEOUT ? 1 : 45;
      for (let s = 0; s < maxPlaybackSeconds; s++) {
        await sleep(1000);
        const st = await client.eval(`$('status').textContent`);
        if (st.includes('Analysis complete')) {
          videoProcessed = true;
          break;
        }
        process.stdout.write(`  Video playback (${s}s): ${st.slice(0, 50)}...\r`);
      }
      console.log('\n');

      if (videoProcessed) {
        const vidBpm = await client.eval(`$('bpm').textContent`);
        const vidQuality = await client.eval(`$('quality').textContent`);
        const vidSource = await client.eval(`$('source').textContent`);
        const vidReceipt = await client.eval(`receipt`);
        const gapCheck = vidReceipt.checks.find(c => c.name === 'largest_gap_seconds');
        const jitterCheck = vidReceipt.checks.find(c => c.name === 'timing_variation');
        if (vidBpm === '72' && vidQuality === '100%' && vidSource.includes('SYNTHETIC') && gapCheck.pass && jitterCheck.pass) {
          recordResult('T11', 'PASS', `BPM=${vidBpm}, Quality=${vidQuality}`);
        } else {
          recordResult('T11', 'FAIL', `BPM=${vidBpm}, Quality=${vidQuality}`);
        }
      } else {
        // F03: Explicit FAIL on timeout rather than silent omission!
        recordResult('T11', 'FAIL', `Playback timed out after ${maxPlaybackSeconds}s without completing analysis` +
          (process.env.TEST_NEGATIVE_TIMEOUT ? ' (forced negative timeout)' : ''));
      }
    } catch (e) { recordResult('T11', 'FAIL', e.message); }

    // TEST 12: Short 12s Video Duration Withholding
    console.log('\n--- Test 12: Short 12s Video Duration Withholding ---');
    try {
      const vid12Path = path.resolve(ROOT, 'samples', 'test_video_12s.webm');
      const doc12 = await client.send('DOM.getDocument');
      const fileNode12 = await client.send('DOM.querySelector', { nodeId: doc12.root.nodeId, selector: '#file' });
      await client.send('DOM.setFileInputFiles', { files: [vid12Path], nodeId: fileNode12.nodeId });
      for (let i = 0; i < 40; i++) {
        await sleep(150);
        if ((await client.eval(`$('status').textContent`)).includes('Preview alignment, then process')) break;
      }
      await client.eval(`$('consent').checked = true; $('processVideo').click();`);
      let vid12Processed = false;
      for (let s = 0; s < 25; s++) {
        await sleep(1000);
        if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) {
          vid12Processed = true;
          break;
        }
      }
      if (vid12Processed) {
        const vid12Bpm = await client.eval(`$('bpm').textContent`);
        const vid12Receipt = await client.eval(`receipt`);
        const durCheck = vid12Receipt.checks.find(c => c.name === 'duration_seconds');
        if (vid12Bpm === '—' && !durCheck.pass) {
          recordResult('T12', 'PASS', `BPM=${vid12Bpm}, durCheckPass=${durCheck.pass}`);
        } else {
          recordResult('T12', 'FAIL', `BPM=${vid12Bpm}, durCheckPass=${durCheck.pass}`);
        }
      } else {
        recordResult('T12', 'FAIL', '12s video playback timed out');
      }
    } catch (e) { recordResult('T12', 'FAIL', e.message); }

    // Read DEMO_TOKEN from environment or .env
    let demoToken = process.env.DEMO_TOKEN || null;
    const envPath = path.resolve(ROOT, '.env');
    if (!demoToken && fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/^DEMO_TOKEN=(.*)$/m);
      if (match) demoToken = match[1].trim();
    }

    const liveAiStrict = process.env.REQUIRE_LIVE_AI === '1';
    if (liveAiStrict && (!demoToken || process.env.SKIP_LIVE_AI)) {
      console.error('\n[FAIL] Strict release mode (REQUIRE_LIVE_AI=1) enforced, but credentials/token are missing or SKIP_LIVE_AI is active.');
      recordResult('T13', 'FAIL', 'REQUIRE_LIVE_AI=1 fail-closed: credentials or token missing');
      recordResult('T14', 'FAIL', 'REQUIRE_LIVE_AI=1 fail-closed: credentials or token missing');
      recordResult('T15', 'FAIL', 'REQUIRE_LIVE_AI=1 fail-closed: credentials or token missing');
      recordResult('T16', 'FAIL', 'REQUIRE_LIVE_AI=1 fail-closed: credentials or token missing');
    } else if (demoToken && !process.env.SKIP_LIVE_AI) {
      // TEST 13: Gemma 4 AI Consent Gate & Demo Password Enforcement
      console.log('\n--- Test 13: Gemma 4 AI Consent & Demo Token Gate ---');
      try {
        await client.eval(`$('clean').click()`);
        for (let i = 0; i < 40; i++) {
          await sleep(100);
          if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
        }
        await client.eval(`$('aiConsent').checked = false; $('explain').click();`);
        let explainText = await client.eval(`$('explanation').textContent`);
        const consentBlocked = explainText.includes('Review and accept the summary-sharing option first') || explainText.includes('accept the summary-sharing option');

        await client.eval(`$('aiConsent').checked = true; $('token').value = 'wrong-token'; $('explain').click();`);
        for (let i = 0; i < 30; i++) {
          await sleep(100);
          explainText = await client.eval(`$('explanation').textContent`);
          if (explainText.includes('Enter the demo password')) break;
        }
        const tokenBlocked = explainText.includes('Enter the demo password to use Gemma.');
        if (consentBlocked && tokenBlocked) {
          recordResult('T13', 'PASS');
        } else {
          recordResult('T13', 'FAIL', `consentBlocked=${consentBlocked}, tokenBlocked=${tokenBlocked}`);
        }
      } catch (e) { recordResult('T13', 'FAIL', e.message); }

      // TEST 14: Real Gemma 4 Clean Synthetic Explanation
      console.log('\n--- Test 14: Real Gemma 4 Explanation for Clean Synthetic Sample ---');
      try {
        await client.eval(`$('token').value = ${JSON.stringify(demoToken)}; $('explain').click();`);
        let liveDone = false;
        let explainText = '';
        for (let s = 0; s < 90; s++) {
          await sleep(1000);
          explainText = await client.eval(`$('explanation').textContent`);
          if (!explainText.includes('Preparing explanation…') && (explainText.startsWith('Gemma 4') || explainText.startsWith('deterministic'))) {
            liveDone = true;
            break;
          }
          process.stdout.write(`  Waiting for Gemma 4 provider response (${s}s)...\r`);
        }
        console.log('\n');
        const cleanHasModel = explainText.includes('Gemma 4 / gemma-4-26b-a4b-it');
        const cleanHasSynthetic = /synthetic/i.test(explainText);
        const cleanHas72 = explainText.includes('72');
        const cleanNotFallback = !explainText.startsWith('deterministic');
        if (liveDone && cleanHasModel && cleanHasSynthetic && cleanHas72 && (!liveAiStrict || cleanNotFallback)) {
          recordResult('T14', 'PASS');
        } else {
          recordResult('T14', 'FAIL', `model=${cleanHasModel}, synthetic=${cleanHasSynthetic}, bpm=${cleanHas72}, fallback=${!cleanNotFallback}`);
        }
      } catch (e) { recordResult('T14', 'FAIL', e.message); }

      // Cooldown wait before next AI call
      console.log('  Waiting 12s server AI cooldown...');
      await sleep(12000);

      // TEST 15: Real Gemma 4 Failed-Quality Explanation
      console.log('\n--- Test 15: Real Gemma 4 Explanation for Failed-Quality Artifact Sample ---');
      try {
        await client.eval(`$('artifact').click()`);
        for (let i = 0; i < 40; i++) {
          await sleep(100);
          if ((await client.eval(`$('status').textContent`)).includes('Analysis complete')) break;
        }
        await client.eval(`$('aiConsent').checked = true; $('token').value = ${JSON.stringify(demoToken)}; $('explain').click();`);
        let liveArtDone = false;
        let explainArtText = '';
        for (let s = 0; s < 90; s++) {
          await sleep(1000);
          explainArtText = await client.eval(`$('explanation').textContent`);
          if (!explainArtText.includes('Preparing explanation…') && (explainArtText.startsWith('Gemma 4') || explainArtText.startsWith('deterministic'))) {
            liveArtDone = true;
            break;
          }
          process.stdout.write(`  Waiting for Gemma 4 provider response (${s}s)...\r`);
        }
        console.log('\n');
        const artHasModel = explainArtText.includes('Gemma 4 / gemma-4-26b-a4b-it');
        const artHasWithheld = /withheld/i.test(explainArtText);
        const artHasChecks = explainArtText.toLowerCase().includes('patch') || explainArtText.toLowerCase().includes('check') || explainArtText.toLowerCase().includes('failed');
        const artNotFallback = !explainArtText.startsWith('deterministic');
        if (liveArtDone && artHasModel && artHasWithheld && artHasChecks && (!liveAiStrict || artNotFallback)) {
          recordResult('T15', 'PASS');
        } else {
          recordResult('T15', 'FAIL', `model=${artHasModel}, withheld=${artHasWithheld}, fallback=${!artNotFallback}`);
        }
      } catch (e) { recordResult('T15', 'FAIL', e.message); }

      // TEST 16: Clear Session Cleans Explanation and Secrets
      console.log('\n--- Test 16: Clear Session Clears Explanation & Token ---');
      try {
        await client.eval(`$('clear').click()`);
        const clearedAi = await client.eval(`({
          explanation: $('explanation').textContent,
          token: $('token').value,
          aiConsent: $('aiConsent').checked
        })`);
        if (clearedAi.explanation === 'The signal calculation works without an AI key.' && clearedAi.token === '' && !clearedAi.aiConsent) {
          recordResult('T16', 'PASS');
        } else {
          recordResult('T16', 'FAIL', JSON.stringify(clearedAi));
        }
      } catch (e) { recordResult('T16', 'FAIL', e.message); }

    } else {
      console.log('\n[SKIP] Gemma 4 live tests skipped (no DEMO_TOKEN or SKIP_LIVE_AI set)');
      recordResult('T13', 'SKIP', 'Live AI unconfigured or skipped');
      recordResult('T14', 'SKIP', 'Live AI unconfigured or skipped');
      recordResult('T15', 'SKIP', 'Live AI unconfigured or skipped');
      recordResult('T16', 'SKIP', 'Live AI unconfigured or skipped');
    }

    // TEST 17: Console Errors & Exceptions Audit
    console.log('\n--- Test 17: Console Errors & Unhandled Exceptions ---');
    if (client.pageErrors.length === 0) {
      recordResult('T17', 'PASS');
    } else {
      recordResult('T17', 'FAIL', JSON.stringify(client.pageErrors));
    }

  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
    if (browserProc) {
      try { browserProc.kill('SIGTERM'); } catch {}
      try { browserProc.kill('SIGKILL'); } catch {}
    }
    if (USER_DATA_DIR) {
      try {
        await sleep(300);
        fs.rmSync(USER_DATA_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {}
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('       BROWSER ACCEPTANCE SUMMARY        ');
  console.log('========================================');
  let allPass = true;
  let executedCount = 0;

  for (const registered of REGISTERED_TESTS) {
    const r = testResults.get(registered.id);
    if (!r) {
      console.log(`FAIL | [${registered.id}] ${registered.name} (OMITTED / NOT RUN)`);
      allPass = false;
    } else {
      executedCount++;
      const detailStr = r.detail ? ` -- ${r.detail}` : '';
      console.log(`${r.status.padEnd(4)} | [${r.id}] ${r.name}${detailStr}`);
      if (r.status === 'FAIL') allPass = false;
      if (registered.mandatory && r.status !== 'PASS') allPass = false;
    }
  }

  console.log('========================================');
  console.log(`Executed: ${executedCount} / ${REGISTERED_TESTS.length} tests`);

  const summaryPayload = {
    all_pass: allPass,
    executed_count: executedCount,
    total_count: REGISTERED_TESTS.length,
    negative_timeout_mode: Boolean(process.env.TEST_NEGATIVE_TIMEOUT),
    results: Array.from(testResults.values()),
  };
  const summaryPath = process.env.SUMMARY_JSON_PATH || path.resolve(ROOT, 'test-results', 'browser-acceptance-summary.json');
  try {
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, JSON.stringify(summaryPayload, null, 2), 'utf-8');
    console.log(`Structured acceptance summary saved: ${summaryPath}`);
  } catch (err) {
    console.warn(`Could not save summary JSON: ${err.message}`);
  }

  if (!allPass) {
    console.error('Acceptance suite FAILED');
    process.exit(1);
  }
  console.log('ALL REQUIRED BROWSER ACCEPTANCE TESTS PASSED!');

}

main().catch(e => {
  console.error('Test suite uncaught error:', e);
  process.exit(1);
});
