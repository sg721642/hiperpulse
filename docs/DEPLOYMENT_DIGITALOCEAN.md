# DigitalOcean App Platform Deployment Guide

Prepared for **HiperPulse — Experimental Camera Heart Rate**.

> [!WARNING]
> **PRE-DEPLOYMENT MANDATORY CHECKPOINTS:**
> 1. **Frontend / UI Customization Gate:** Do NOT deploy until the owner provides, reviews, and approves the intended UI changes.
> 2. **Credential Rotation Gate:** The API key previously entered in development chat is considered EXPOSED. Before public deployment, revoke the old key in Google AI Studio and configure a fresh, unexposed key directly in DigitalOcean App Platform's encrypted environment variables.

---

## 1. Architecture & Deployment Target

- **Hosting Platform:** DigitalOcean App Platform (PaaS)
- **Component Type:** Web Service running Dockerfile
- **Source Repository:** `https://github.com/sg721642/hiperpulse.git` (Branch: `main`)
- **Container Port:** `8080` (HTTP)
- **Container Bind:** `0.0.0.0:8080`
- **Container User:** `appuser` (non-root, UID 10001)
- **Health Check Path:** `/api/health` (HTTP 200, checks `{ ok: true, ai_configured: true }`)
- **Instance Count:** 1 (Single instance preserves process-local AI cooldown rate limiting)

---

## 2. Infrastructure & Operating Costs

### DigitalOcean App Platform Costs
- **Estimated Plan:** `basic-xxs` (512 MB RAM, 1 shared vCPU) or `basic-xs` (1 GB RAM, 1 shared vCPU). Actual pricing depends on region, bandwidth, and current DigitalOcean pricing at deployment time; verify in the App Platform control panel before launch.
- **Billing Model:** Billed hourly for active container uptime. Containers can be destroyed immediately after evaluation to minimize charges.

### Google Gemini API Costs (Gemma 4)
- **Model:** `gemma-4-26b-a4b-it`
- **Quota & Billing:** Quotas and pricing depend on account tier (Google AI Studio free tier vs pay-as-you-go / Google Cloud enterprise). Verify active RPM/TPM and billing budget alerts in Google AI Studio / Google Cloud Console.
- **Token Usage per Call:** Input prompt ~350 tokens; output reasoning + text ~1200–2000 tokens.
- **In-Memory Cooldown:** The server-side 10-second cooldown is process-local to a single container instance; it guards against rapid sequential clicks within a process but is not a distributed multi-instance billing cap.

---

## 3. Step-by-Step App Platform Setup

1. **Sign in to DigitalOcean:** Navigate to `https://cloud.digitalocean.com/apps`.
2. **Create App:** Click **Create App** and choose **GitHub**.
3. **Select Repository:** Grant access to `sg721642/hiperpulse` and select branch `main`.
4. **Build Option:** DigitalOcean detects the root `Dockerfile`.
   - Ensure **HTTP Port** is set to `8080`.
   - Ensure **Run Command** is left empty (uses Dockerfile `CMD`).
5. **Configure Health Check:**
   - Path: `/api/health`
   - Initial Delay: `15 seconds`
   - Period: `20 seconds`
   - Timeout: `5 seconds`
6. **Set Environment Variables (Runtime Scope):**
   - `GEMMA_MODEL`: `gemma-4-26b-a4b-it` (Plain Text)
   - `GEMINI_API_KEY`: `<Fresh Production Gemini API Key>` (Encrypted Secret)
   - `DEMO_TOKEN`: `<Production Demo Password>` (Encrypted Secret)
7. **Review & Launch:** Confirm plan (`basic-xxs` or `basic-xs`), review estimated monthly cost, and click **Create Resources**.

---

## 4. Post-Deployment Smoke Test Checklist

Once the deployment completes and DigitalOcean assigns a live HTTPS URL (e.g. `https://hiperpulse-xxxxx.ondigitalocean.app`):

- [ ] **Health Endpoint:** `GET /api/health` returns `HTTP 200 {"ok":true,"ai_configured":true}`.
- [ ] **Security Headers:** Inspect response headers for `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `frame-ancestors 'none'`.
- [ ] **Protected Files:** Verify `GET /.env` returns HTTP 404.
- [ ] **Clean Synthetic Sample:** Click **Clean (72 BPM)** -> verifies 72 BPM and 100% checks passed.
- [ ] **Artifact Synthetic Sample:** Click **Artifact** -> verifies BPM withheld (`null`) and 86% checks passed.
- [ ] **Flat Synthetic Sample:** Click **Flat** -> verifies BPM withheld (`null`) and 64% checks passed.
- [ ] **Gemma 4 Live Commentary:** Check consent box, enter demo password, click **Explain with Gemma 4** -> verifies live response with `Gemma 4 / gemma-4-26b-a4b-it`.
- [ ] **Real Camera on Mobile / HTTPS:** Open HTTPS URL on a smartphone or laptop browser, grant camera permission, record 30s capture.
- [ ] **Receipt Export:** Download evidence receipt and verify deterministic SHA-256 integrity.

---

## 5. Teardown Procedure

To prevent recurring charges after the hackathon evaluation:
1. Navigate to DigitalOcean App Platform Dashboard -> **hiperpulse** -> **Settings**.
2. Scroll to the bottom and click **Destroy App**.
3. Revoke the demo `GEMINI_API_KEY` in Google AI Studio.
