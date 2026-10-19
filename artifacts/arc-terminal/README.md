# ARC Terminal

**Adaptive Research & Correction Terminal.** An on-chain research and forecasting system that records its own mistakes in Walrus Memory and uses them to forecast better next time.

It is a research tool. It never trades and never moves funds.

## What it does

1. **Observe.** Pulls block-level signals through Tatum JSON-RPC: base fee, gas utilization, transactions per block, and USDC transfer events.
2. **Forecast.** An OpenRouter model proposes binary, machine-resolvable forecasts ("Base fee above 14.9 gwei in 30m") with probability, rationale, cited signals and invalidation conditions.
3. **Remember.** Every forecast is written to Walrus Memory on Sui Mainnet. A write only counts as stored after Walrus returns a blob id.
4. **Resolve.** After the horizon passes, the real value is measured from chain data at the forecast's own deadline, scored (Brier), and the error and a lesson are written to memory.
5. **Learn.** Before the next forecast, ARC recalls past resolutions and lessons from Walrus. Lessons go into the prompt, and a deterministic calibration step adjusts the model's probabilities.
6. **Compare.** The Learning page shows live before-versus-after, and a walk-forward replay tests the original policy against the memory-enhanced one without data leakage.

Observed facts (blue "observed" tag) and AI interpretation (orange tag) are always shown separately. Missing data is labelled, never filled in.

## Architecture

```
src/            React UI (Vite). Never sees API keys.
  views/        Overview, Forecasts, Signals, Memory explorer, Learning and replay, Audit trail, Settings, Quick start
  lib/          api client + app store (actions, polling, demo mode)
  demo/         clearly labelled SAMPLE data generator
api/            Vercel serverless functions (hold all secrets)
  forecast.js   signals -> recall Walrus -> model -> calibrate -> write FORECAST cards
  resolve.js    measure at deadline -> Brier -> lessons -> write RESOLUTION + LESSON cards
  memory.js     job status, recall search, sync, verify (round-trip proof)
  replay-step.js  one walk-forward step (two policies, no leakage)
  signals.js, health.js
  _lib/         tatum (RPC + block search + metrics), memory (Walrus), llm (OpenRouter), engine, http
shared/         pure logic used by API, UI and tests: scoring, calibration, lessons, cards, prompts
tests/          node:test suite (mocks for Tatum, OpenRouter, Walrus)
```

### Memory cards

Three card types are stored as one-line text with a readable header and a JSON tail: `[ARC:FORECAST]`, `[ARC:RESOLUTION]`, `[ARC:LESSON]`. Walrus Memory is append-only, so cards contain only chain facts and model output, and a guard refuses text that looks like a key or secret.

### How learning is applied

- **Reasoning:** up to 6 recalled lessons and per-metric calibration stats are added to the forecasting prompt.
- **Confidence calibration (deterministic):** probability is shifted by the observed bias (weighted by sample size) and shrunk toward 0.5 when past Brier is worse than a coin flip. A metric needs 3 resolved forecasts for its own calibration; with less it uses history pooled across metrics at half weight. The raw model probability is always kept next to the final one.

### Metric definitions

Each metric is the average over 4 sampled blocks inside the 30 minute window ending at the reference time (USDC: Transfer events in the 20 blocks ending at that time). Forecast and resolution use the same definition. Resolution uses blocks at or before the forecast deadline, never later data.

## Run locally

```bash
npm install
cp .env.example .env     # fill in your keys
npm run dev              # UI and /api on http://localhost:5173
npm test                 # logic, pipeline, leakage and auth tests (uses mocks, no keys needed)
npm run build
```

No keys? Open **Settings** and switch on **Demo mode** to explore the UI with labelled sample data.

### Getting the credentials

- **OpenRouter:** create a key at openrouter.ai, pick a model slug, set `OPENROUTER_MODEL`.
- **Tatum:** create an API key in the Tatum dashboard. Gateway URLs follow `https://<slug>.gateway.tatum.io`; override a slug with `TATUM_SLUG_<CHAIN>` if your plan names it differently. Settings -> Test connections shows which chains respond.
- **Walrus Memory:** create a Walrus Memory account and delegate key following the Walrus Memory docs, then set `MEMWAL_PRIVATE_KEY` and `MEMWAL_ACCOUNT_ID`. `MEMWAL_SERVER_URL` and `MEMWAL_NAMESPACE` are optional.

## Deploy: GitHub then Vercel

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "ARC Terminal"
   git branch -M main
   git remote add origin https://github.com/<you>/arc-terminal.git
   git push -u origin main
   ```
   `.env` is git-ignored. Check `git status` shows no secrets before pushing.
2. **Import on Vercel:** Add New -> Project -> pick the repo. Framework preset: Vite (auto-detected). Leave build settings as is.
3. **Add secrets:** Project -> Settings -> Environment Variables. Add every name from `.env.example` (at least `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TATUM_API_KEY`, `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`). Apply to Production and Preview. **Do not prefix with `VITE_`**; that would expose them in the browser bundle.
4. **Deploy** (or Redeploy: environment changes only apply to new deployments).
5. **Protect it:** a public URL lets anyone press Run forecast and spend your credits and Walrus writes. Set `ARC_ACCESS_TOKEN` and the UI will ask for that passcode.
6. Open the site -> Settings -> Test connections.

Serverless functions are configured for up to 60 s (`vercel.json`). Replay runs one step per request, so it stays within that.

## Reproducible demo: the full learning cycle

1. Settings -> Test connections (all green).
2. **Run forecast** (top bar). Memory explorer shows the writes go `pending` then `stored` with blob ids.
3. Memory explorer -> **Verify** on a stored row. Recall must return that exact blob id.
4. Wait for the shortest horizon (15 min), then **Resolve due**. Resolution and lesson cards are written.
5. **Run forecast** again. Forecast detail shows "calibrated on N past", the raw versus final probability, and the lesson applied.
6. Learning and replay -> **Run replay**. Compare baseline versus memory Brier on past blocks.
7. Prove persistence: Settings -> Clear local cache, then Memory explorer -> **Sync from Walrus**. History returns from Walrus.

## Replay without leakage

Each step at time T: signals use blocks <= T; the baseline policy has no memory; the memory policy gets only calibration and lessons built from outcomes whose deadline is <= T, and the server throws if anything newer is passed in; outcomes are measured afterwards at each forecast's own deadline. Tests cover each rule. Caveats: the model is not deterministic, and a model could in principle recall facts about past dates from training, so prefer recent windows. The exported JSON records exactly what ran.

## Known limits

- Forecast history is cached in the browser. Walrus is the source of truth; Sync rebuilds from recall, which is semantic and returns a limited number of results, so very old history may need targeted recall searches.
- Walrus job status uses `waitForRememberJob` with an 8 s cap per check.
- One MemWal namespace per deployment (shared by all visitors). Fine for a personal tool; add per-user namespaces before opening it up.
- The rate limit is in-memory per function instance (best effort).
- Invalidation conditions are model-written text shown for context. They are not auto-evaluated.
- The "Explorer" link template for blob ids defaults to `https://walruscan.com/mainnet/blob/{id}`; override with `VITE_WALRUS_BLOB_URL`.

## Security notes

Keys exist only in server environment variables. The browser talks only to `/api/*`. Forecast objects returned by the browser are re-validated server-side. Memory text is passed through a secret-pattern guard before writing. No endpoint can sign transactions or send funds.
