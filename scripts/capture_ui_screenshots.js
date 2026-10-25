'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const CDP_PORT = 9225;
const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new globalThis.WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
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
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }
}

async function main() {
  console.log('Launching headless browser for screenshots...');
  const tmpProfile = `/tmp/screenshot_profile_${Date.now()}`;
  const proc = spawn(BRAVE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    let version = null;
    for (let i = 0; i < 30; i++) {
      try {
        version = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (version) break;
      } catch (_) {}
      await sleep(200);
    }
    if (!version) throw new Error('Could not connect to browser');

    const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    fs.mkdirSync(path.join(__dirname, '../reference'), { recursive: true });

    // 1. DESKTOP HERO & LAB SCREENSHOT (1440x900)
    console.log('Capturing Desktop Screenshot...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await client.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await sleep(2000);

    // Click clean synthetic sample to populate signal and telemetry
    await client.eval(`$('clean').click();`);
    await sleep(1500);

    // Capture Desktop Viewport Screenshot
    const deskRes = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const deskPath = path.join(__dirname, '../reference/desktop-redesign.png');
    fs.writeFileSync(deskPath, Buffer.from(deskRes.data, 'base64'));
    console.log(`Saved: ${deskPath} (${(deskRes.data.length * 0.75 / 1024).toFixed(1)} KB)`);

    // Capture Full Page Desktop Screenshot
    const fullDeskRes = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const fullDeskPath = path.join(__dirname, '../reference/desktop-fullpage-redesign.png');
    fs.writeFileSync(fullDeskPath, Buffer.from(fullDeskRes.data, 'base64'));
    console.log(`Saved: ${fullDeskPath} (${(fullDeskRes.data.length * 0.75 / 1024).toFixed(1)} KB)`);

    // 2. MOBILE SCREENSHOT (390x844 - iPhone 14/15 format)
    console.log('Capturing Mobile Screenshot...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      hasTouch: true
    });

    await client.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await sleep(2000);

    // Click clean sample on mobile
    await client.eval(`$('clean').click();`);
    await sleep(1500);

    const mobRes = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const mobPath = path.join(__dirname, '../reference/mobile-redesign.png');
    fs.writeFileSync(mobPath, Buffer.from(mobRes.data, 'base64'));
    console.log(`Saved: ${mobPath} (${(mobRes.data.length * 0.75 / 1024).toFixed(1)} KB)`);

    // Capture Full Page Mobile Screenshot
    const fullMobRes = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const fullMobPath = path.join(__dirname, '../reference/mobile-fullpage-redesign.png');
    fs.writeFileSync(fullMobPath, Buffer.from(fullMobRes.data, 'base64'));
    console.log(`Saved: ${fullMobPath} (${(fullMobRes.data.length * 0.75 / 1024).toFixed(1)} KB)`);

    console.log('Screenshots captured successfully!');
  } finally {
    proc.kill('SIGKILL');
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
