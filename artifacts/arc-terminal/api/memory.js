import { handler, requireEnv, HttpError, clampInt } from './_lib/http.js';
import { jobStatus, memoryConfigured, recallCards, namespace } from './_lib/memory.js';

export default handler({ methods: ['GET', 'POST'] }, async ({ query, body, req }) => {
  requireEnv(['MEMWAL_PRIVATE_KEY', 'MEMWAL_ACCOUNT_ID'], 'Walrus Memory');
  const action = (req.method === 'POST' ? body.action : query.action) || '';

  if (action === 'job') {
    if (!query.id) throw new HttpError(400, 'id required');
    return { id: query.id, ...(await jobStatus(String(query.id))) };
  }
  if (action === 'recall') {
    const q = String(query.q || '').slice(0, 200);
    if (!q) throw new HttpError(400, 'q required');
    return { namespace: namespace(), cards: await recallCards(q, clampInt(query.limit, 1, 30, 10)) };
  }
  if (action === 'sync') {
    const chain = String(query.chain || 'ethereum');
    const [f, r, l] = await Promise.all([
      recallCards(`ARC FORECAST ${chain} forecast probability threshold`, 30),
      recallCards(`ARC RESOLUTION ${chain} resolved forecast outcome Brier`, 30),
      recallCards(`ARC LESSON ${chain} forecasting lesson calibration`, 15),
    ]);
    const seen = new Set();
    const cards = [...f, ...r, ...l].filter((c) => !seen.has(c.blobId) && seen.add(c.blobId));
    return { namespace: namespace(), cards };
  }
  if (action === 'verify') {
    // Round-trip proof: recall by the card's own headline and look for the exact Walrus blob id.
    const q = String(body.query || '').slice(0, 200);
    const blobId = String(body.blobId || '');
    if (!q || !blobId) throw new HttpError(400, 'query and blobId required');
    const cards = await recallCards(`ARC ${String(body.kind || '').slice(0, 20)} ${q}`, 15);
    const hit = cards.find((c) => c.blobId === blobId);
    return { verified: Boolean(hit), blobId, matchedHeadline: hit?.headline || null, checkedAt: new Date().toISOString(), configured: memoryConfigured() };
  }
  throw new HttpError(400, 'Unknown action');
});
