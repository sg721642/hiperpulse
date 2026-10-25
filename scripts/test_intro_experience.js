#!/usr/bin/env node
/**
 * HiperPulse Dedicated Visual & Functional Intro & Scroll Verification Suite
 * Tests Photon Genesis entry experience in an unmocked browser context where
 * navigator.webdriver is unset, verifying:
 *  - Fresh tab plays intro
 *  - Reload plays intro (verifying sessionStorage skip fix)
 *  - Skip button dismisses intro and reveals hero
 *  - In-place '↺ Intro' replays without full page reload
 *  - Capture safety: Replay is blocked when recording is active
 *  - Anchor navigation (#lab, #analytics) does not replay intro
 *  - Full scroll walkthrough across desktop, tablet, and mobile viewports
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'test-results', 'intro-walkthrough');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const TARGET_PORT = 8080;
const CDP_PORT = 9223;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findBrowserBinary() {
  const candidates = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium/Brave browser binary found');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) cb.reject(new Error(msg.error.message));
        else cb.resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
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
      throw new Error(res.exceptionDetails.text || 'Eval error');
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(RESULTS_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    return outPath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runIntroSuite() {
  console.log('=== HIPERPULSE DEDICATED INTRO & FULL-PAGE SCROLL SUITE ===');
  const browserBin = findBrowserBinary();
  console.log(`Using Browser: ${browserBin}`);

  const userDir = `/tmp/intro_test_${Date.now()}`;
  const browserProc = spawn(browserBin, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu',
    '--mute-audio',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  let client = null;
  const results = [];

  function record(id, name, pass, detail = '') {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${id}: ${name} ${detail ? `(${detail})` : ''}`);
    results.push({ id, name, pass, detail });
  }

  try {
    // Wait for CDP endpoint
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      try {
        const json = await new Promise((res, rej) => {
          http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, resp => {
            let data = '';
            resp.on('data', c => (data += c));
            resp.on('end', () => res(JSON.parse(data)));
          }).on('error', rej);
        });
        wsUrl = json.webSocketDebuggerUrl;
        if (wsUrl) break;
      } catch (_) {}
    }
    if (!wsUrl) throw new Error('Failed to connect to browser CDP port');

    // Create target page via PUT
    const newPageRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${TARGET_PORT}/`, {
      method: 'PUT'
    });
    const newPage = await newPageRes.json();

    client = new CDPClient(newPage.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // Unset navigator.webdriver on page so the intro is NOT automatically bypassed!
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false
        });
      `
    });

    // TEST 1: Fresh Page Load Plays Intro
    console.log('\n--- Test 1: Fresh Page Load Plays Photon Genesis ---');
    await client.send('Page.navigate', { url: `http://127.0.0.1:${TARGET_PORT}/` });
    await sleep(400);

    const introVisibleOnLoad = await client.eval(`(() => {
      const overlay = $('introOverlay');
      return overlay && overlay.style.display !== 'none' && !overlay.classList.contains('intro-dismissed');
    })()`);
    await client.captureScreenshot('01_fresh_tab_intro_active.png');
    record('INT-01', 'Fresh page load plays Photon Genesis entry', introVisibleOnLoad);

    // TEST 2: Active Particle Rendering at Stage 2/3
    console.log('\n--- Test 2: Particle & Singularity Evolution ---');
    await sleep(1200);
    const canvasIsActive = await client.eval(`(() => {
      const c = $('introCanvas');
      return c && c.width > 0 && c.height > 0;
    })()`);
    await client.captureScreenshot('02_intro_stage3_signal_formation.png');
    record('INT-02', 'Photon Genesis particles actively rendering', canvasIsActive);

    // TEST 3: Skip Intro Button Dismissal & Kinetic Headline
    console.log('\n--- Test 3: Skip Intro Control ---');
    await client.eval(`$('skipIntroBtn').click()`);
    await sleep(900);

    const isDismissedAfterSkip = await client.eval(`(() => {
      const overlay = $('introOverlay');
      return overlay.style.display === 'none' || overlay.classList.contains('intro-dismissed');
    })()`);

    const headlineRevealed = await client.eval(`(() => {
      const words = document.querySelectorAll('.kinetic-word.revealed');
      return words.length > 0;
    })()`);

    await client.captureScreenshot('03_hero_revealed_after_skip.png');
    record('INT-03', 'Skip intro button dismisses overlay and reveals headline', isDismissedAfterSkip && headlineRevealed);

    // TEST 4: Page Reload Replays Intro (Priority 1 Core Fix)
    console.log('\n--- Test 4: Full Page Reload Replays Intro (Fixing Previous Defect) ---');
    await client.send('Page.reload');
    await sleep(400);

    const replayedOnReload = await client.eval(`(() => {
      const overlay = $('introOverlay');
      return overlay && overlay.style.display !== 'none' && !overlay.classList.contains('intro-dismissed');
    })()`);
    await client.captureScreenshot('04_intro_replayed_on_reload.png');
    record('INT-04', 'Full-page reload plays Photon Genesis again (sessionStorage fix verified)', replayedOnReload);

    // Wait for auto-dismissal
    console.log('  Waiting 4.2s for intro auto-completion...');
    await sleep(4300);
    const autoDismissed = await client.eval(`(() => {
      const overlay = $('introOverlay');
      return overlay.style.display === 'none' || overlay.classList.contains('intro-dismissed');
    })()`);
    record('INT-05', 'Photon Genesis auto-dismisses at 3.8s without user interaction', autoDismissed);

    // TEST 5: In-Place Replay ("↺ Intro" Button)
    console.log('\n--- Test 5: In-Place Replay Without Page Refresh ---');
    await client.eval(`$('replayIntroBtn').click()`);
    await sleep(300);

    const replayedInPlace = await client.eval(`(() => {
      const overlay = $('introOverlay');
      return overlay && overlay.style.display !== 'none' && !overlay.classList.contains('intro-dismissed');
    })()`);
    await client.captureScreenshot('05_in_place_replay_active.png');
    record('INT-06', 'Replay button restarts animation without page reload', replayedInPlace);

    // Dismiss with ESC key
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await sleep(900);
    const dismissedByEsc = await client.eval(`$('introOverlay').style.display === 'none'`);
    record('INT-07', 'ESC key dismisses active intro sequence', dismissedByEsc);

    // TEST 6: Capture Safety (Replay blocked during recording)
    console.log('\n--- Test 6: Capture Safety Guard ---');
    await client.eval(`(() => {
      capturing = true; // simulate active capture
      $('replayIntroBtn').click();
    })()`);
    await sleep(100);

    const statusText = await client.eval(`$('status').textContent`);
    const overlayStillHidden = await client.eval(`$('introOverlay').style.display === 'none'`);
    await client.eval(`capturing = false;`); // reset mock

    const safetyBlocked = statusText.includes('unavailable during active recording') && overlayStillHidden;
    record('INT-08', 'Replay is cleanly blocked during active camera capture', safetyBlocked);

    // TEST 7: In-page anchor navigation does not trigger intro
    console.log('\n--- Test 7: Anchor Navigation Non-Replay ---');
    await client.eval(`window.location.hash = '#lab'`);
    await sleep(200);
    const anchorNoReplay = await client.eval(`$('introOverlay').style.display === 'none'`);
    record('INT-09', 'In-page anchor navigation does NOT trigger intro replay', anchorNoReplay);

    // TEST 8: Full Page Walkthrough Across 5 Viewports
    console.log('\n--- Test 8: Full-Page Walkthrough & Multi-Viewport Captures ---');
    const viewports = [
      { name: 'desktop_1920x1080', w: 1920, h: 1080 },
      { name: 'laptop_1366x768', w: 1366, h: 768 },
      { name: 'tablet_768x1024', w: 768, h: 1024 },
      { name: 'mobile_390x844', w: 390, h: 844 },
      { name: 'mobile_360x740', w: 360, h: 740 }
    ];

    for (const vp of viewports) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.w <= 768
      });
      await sleep(200);

      // Scroll Top (Hero)
      await client.eval(`window.scrollTo(0, 0)`);
      await sleep(300);
      await client.captureScreenshot(`walkthrough_${vp.name}_01_hero.png`);

      // Scroll Middle (Cockpit & Waveform)
      await client.eval(`$('lab').scrollIntoView({ behavior: 'instant' })`);
      await sleep(400);
      await client.captureScreenshot(`walkthrough_${vp.name}_02_cockpit.png`);

      // Scroll Method
      await client.eval(`$('method').scrollIntoView({ behavior: 'instant' })`);
      await sleep(400);
      await client.captureScreenshot(`walkthrough_${vp.name}_03_method.png`);

      // Scroll Bottom (Observatory Footer)
      await client.eval(`document.querySelector('.site-footer').scrollIntoView({ behavior: 'instant' })`);
      await sleep(400);
      await client.captureScreenshot(`walkthrough_${vp.name}_04_footer.png`);
    }

    record('INT-10', 'Full scroll walkthrough captured across 5 responsive viewports', true);

    // Summary
    const passed = results.filter(r => r.pass).length;
    console.log(`\n========================================`);
    console.log(`  INTRO & SCROLL SUITE: ${passed} / ${results.length} PASSED`);
    console.log(`  Screenshots saved to: ${RESULTS_DIR}`);
    console.log(`========================================`);

    fs.writeFileSync(
      path.join(RESULTS_DIR, 'intro-acceptance-summary.json'),
      JSON.stringify({ passed, total: results.length, results }, null, 2)
    );

    if (passed !== results.length) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n[SUITE ERROR]', err);
    process.exit(1);
  } finally {
    if (client) client.close();
    browserProc.kill();
  }
}

runIntroSuite();
