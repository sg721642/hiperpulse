'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BROWSER_BIN = process.env.BROWSER_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    : 'google-chrome'
);
const PORT = 8080;
const CDP_PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function captureScreenshot(client, filepath, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  else params.captureBeyondViewport = true;
  const { data } = await client.send('Page.captureScreenshot', params);
  const buf = Buffer.from(data, 'base64');
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, buf);
  console.log(`Saved screenshot: ${filepath} (${buf.length} bytes)`);
}

async function main() {
  console.log('=== CAPTURING HIPERPULSE UI PREVIEWS ===');
  const userDataDir = `/tmp/preview_${Date.now()}`;
  const proc = spawn(BROWSER_BIN, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${PORT}/`
  ], { stdio: 'ignore' });

  let client = null;
  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        if (res.ok) {
          const list = await res.json();
          const target = list.find(t => t.type === 'page');
          if (target && target.webSocketDebuggerUrl) {
            wsUrl = target.webSocketDebuggerUrl;
            break;
          }
        }
      } catch (_) {}
    }
    if (!wsUrl) throw new Error('Could not connect to browser CDP target');

    client = new CDPClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    // Wait for page ready
    await sleep(1500);

    // 1. Click clean synthetic sample to populate live signals & graphs
    await client.eval(`$('clean').click()`);
    for (let i = 0; i < 40; i++) {
      const st = await client.eval(`$('status').textContent`);
      if (st && st.includes('Analysis complete')) break;
      await sleep(100);
    }
    await sleep(600);

    // 2. Set Desktop Viewport (1440x900 @ 2x)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });
    await sleep(600);

    // Hero Viewport Screenshot
    await client.eval(`window.scrollTo(0, 0)`);
    await sleep(500);
    await captureScreenshot(client, path.join(__dirname, '../reference/desktop-hero.png'), {
      x: 0, y: 0, width: 1440, height: 900, scale: 1
    });

    // Cockpit Viewport Screenshot
    await client.eval(`$('lab').scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await captureScreenshot(client, path.join(__dirname, '../reference/desktop-dashboard.png'), {
      x: 0, y: 0, width: 1440, height: 900, scale: 1
    });

    // Full Desktop Screenshot
    await client.eval(`window.scrollTo(0, 0)`);
    await sleep(500);
    await captureScreenshot(client, path.join(__dirname, '../reference/desktop-full.png'));

    // 3. Set Mobile Viewport (390x844 @ 2x, modern mobile screen)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(600);

    // Mobile Cockpit Viewport
    await client.eval(`$('lab').scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await captureScreenshot(client, path.join(__dirname, '../reference/mobile-preview.png'), {
      x: 0, y: 0, width: 390, height: 844, scale: 1
    });

    // Full Mobile Screenshot
    await client.eval(`window.scrollTo(0, 0)`);
    await sleep(500);
    await captureScreenshot(client, path.join(__dirname, '../reference/mobile-full.png'));

    console.log('✓ All desktop and mobile screenshots captured successfully!');
  } finally {
    if (client) await client.close();
    proc.kill('SIGKILL');
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
