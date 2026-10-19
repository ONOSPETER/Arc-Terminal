// Walrus Memory (MemWal) wrapper. remember() only returns a job id; the Walrus blob id exists after the job completes.
import { decodeCard, encodeCard } from '../../shared/cards.js';

let client = null;
export const __setClientForTests = (c) => { client = c; };
export const memoryConfigured = () => Boolean(process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID);
export const namespace = () => process.env.MEMWAL_NAMESPACE || 'arc-terminal';

async function getClient() {
  if (client) return client;
  const { MemWal } = await import('@mysten-incubation/memwal');
  client = MemWal.create({
    key: process.env.MEMWAL_PRIVATE_KEY,
    accountId: process.env.MEMWAL_ACCOUNT_ID,
    serverUrl: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
    namespace: namespace(),
  });
  return client;
}

export async function memoryHealth() {
  const c = await getClient();
  await c.health();
  return true;
}

export async function writeCard(type, headline, data) {
  const c = await getClient();
  const text = encodeCard(type, headline, data);
  const job = await c.remember(text);
  return { jobId: job.job_id, bytes: text.length };
}

/** Non-blocking-ish status: waits up to `ms`, otherwise reports pending. */
export async function jobStatus(jobId, ms = 8000) {
  const c = await getClient();
  let timer;
  const timeout = new Promise((r) => { timer = setTimeout(() => r({ timeout: true }), ms); });
  const work = c.waitForRememberJob(jobId).then((x) => ({ ok: x }), (e) => ({ err: e }));
  const r = await Promise.race([work, timeout]);
  clearTimeout(timer);
  if (r.timeout) return { status: 'pending' };
  if (r.err) return { status: 'failed', error: String(r.err.message || r.err).slice(0, 200) };
  return { status: 'done', blobId: r.ok.blob_id };
}

export async function recallCards(query, limit = 10) {
  const c = await getClient();
  const res = await c.recall({ query, limit });
  const out = [];
  for (const m of res.results || []) {
    const card = decodeCard(m.text);
    if (card) out.push({ ...card, blobId: m.blob_id, distance: m.distance });
  }
  return out;
}

/** Recall everything ARC needs for a chain: lessons + past resolutions (for calibration). */
export async function recallForChain(chain) {
  const [lessons, resolutions] = await Promise.all([
    recallCards(`ARC LESSON ${chain} forecasting lesson calibration`, 8),
    recallCards(`ARC RESOLUTION ${chain} resolved forecast outcome Brier`, 25),
  ]);
  const seen = new Set();
  const all = [...lessons, ...resolutions].filter((c) => c.data?.chain === chain && !seen.has(c.blobId) && seen.add(c.blobId));
  return all;
}
