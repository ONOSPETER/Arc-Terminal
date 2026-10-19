import { handler, requireEnv, HttpError } from './_lib/http.js';
import { makeRpc } from './_lib/tatum.js';
import { memoryConfigured, writeCard } from './_lib/memory.js';
import { makeLessons, resolveOne, sanitizeForecast } from './_lib/engine.js';
import { calibrationStats } from '../shared/scoring.js';

export default handler({ methods: ['POST'] }, async ({ body }) => {
  requireEnv(['TATUM_API_KEY'], 'Tatum');
  const input = Array.isArray(body.forecasts) ? body.forecasts.slice(0, 8) : [];
  if (!input.length) throw new HttpError(400, 'Send forecasts to resolve');
  const forecasts = input.map(sanitizeForecast);
  const byChain = {};
  const resolutions = [];
  const skipped = [];

  for (const f of forecasts) {
    const rpc = (byChain[f.chain] ||= makeRpc(f.chain));
    try {
      const r = await resolveOne(rpc, f);
      (r.status === 'resolved' ? resolutions : skipped).push(r.status === 'resolved' ? { ...r, forecastBlobId: f.blobId } : r);
    } catch (e) { skipped.push({ forecastId: f.id, status: 'error', reason: String(e.message).slice(0, 160) }); }
  }

  // Lessons are written per chain from this batch (the stats cover only what was just resolved here;
  // the forecast route recalls older resolutions from Walrus for long-run calibration).
  const lessons = [];
  const writes = [];
  const memoryOn = memoryConfigured() && process.env.OPENROUTER_API_KEY;
  for (const chain of [...new Set(resolutions.map((r) => r.chain))]) {
    const rs = resolutions.filter((r) => r.chain === chain);
    const stats = calibrationStats(rs.map((r) => ({ metric: r.metric, p: r.pRaw ?? r.p, o: r.o })));
    const ls = process.env.OPENROUTER_API_KEY ? await makeLessons(chain, rs, stats) : [];
    ls.forEach((l) => lessons.push({ ...l, chain, createdAt: new Date().toISOString() }));
  }

  if (memoryConfigured()) {
    for (const r of resolutions) {
      try {
        const { jobId } = await writeCard('RESOLUTION', `${r.chain} ${r.metric} ${r.comparator} ${r.threshold} observed ${r.observed} outcome ${r.o} Brier ${r.brier}`, {
          forecastId: r.forecastId, forecastBlobId: r.forecastBlobId, chain: r.chain, metric: r.metric, comparator: r.comparator,
          threshold: r.threshold, p: r.p, pRaw: r.pRaw, o: r.o, brier: r.brier, observed: r.observed, endBlock: r.endBlock, mistake: r.mistake,
        });
        writes.push({ kind: 'RESOLUTION', refId: r.forecastId, status: 'pending', jobId, headline: `${r.chain} ${r.metric} resolved` });
      } catch (e) { writes.push({ kind: 'RESOLUTION', refId: r.forecastId, status: 'write_failed', error: String(e.message).slice(0, 140) }); }
    }
    for (const l of lessons) {
      try {
        const { jobId } = await writeCard('LESSON', `${l.chain} ${l.metric} lesson`, { chain: l.chain, metric: l.metric, lesson: l.lesson, source: l.source, createdAt: l.createdAt });
        writes.push({ kind: 'LESSON', refId: `${l.chain}:${l.metric}`, status: 'pending', jobId, headline: `${l.chain} ${l.metric} lesson` });
        l.jobId = jobId;
      } catch (e) { writes.push({ kind: 'LESSON', refId: `${l.chain}:${l.metric}`, status: 'write_failed', error: String(e.message).slice(0, 140) }); }
    }
  }
  return { resolutions, skipped, lessons, writes, memoryConfigured: Boolean(memoryOn) };
});
