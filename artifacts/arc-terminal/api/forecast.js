import { handler, requireEnv, clampInt } from './_lib/http.js';
import { makeRpc, collectSignals } from './_lib/tatum.js';
import { memoryConfigured, recallForChain, writeCard } from './_lib/memory.js';
import { memoryContext, pickForecastChain, runPolicy } from './_lib/engine.js';

export default handler({ methods: ['POST'] }, async ({ body }) => {
  requireEnv(['TATUM_API_KEY'], 'Tatum');
  requireEnv(['OPENROUTER_API_KEY'], 'OpenRouter');
  const chain = pickForecastChain(body.chain || 'ethereum');
  const count = clampInt(body.count, 1, 5, 3);

  const rpc = makeRpc(chain);
  const latest = await rpc.latest();
  const asOfTs = latest.timestamp;
  const signals = await collectSignals(rpc, chain, asOfTs);

  // 1) Retrieve what Walrus remembers about this chain before forecasting.
  let cards = [];
  const memory = { configured: memoryConfigured(), recallError: null };
  if (memory.configured) {
    try { cards = await recallForChain(chain); } catch (e) { memory.recallError = String(e.message).slice(0, 160); }
  }
  const ctx = memoryContext(cards);

  // 2) Forecast with lessons + calibration applied.
  const { forecasts, dropped, usage, model } = await runPolicy({ policy: 'memory', chain, signals, count, memory: ctx, asOfTs });

  // 3) Persist each forecast to Walrus Memory. We report job ids, never claim "stored" before the job completes.
  for (const f of forecasts) {
    f.mem = { status: 'unavailable', reason: memory.configured ? null : 'Walrus Memory is not configured' };
    if (!memory.configured) continue;
    const headline = `${chain} ${f.metric} ${f.comparator} ${f.threshold} in ${f.horizonMin}m p=${f.p}`;
    try {
      const { jobId } = await writeCard('FORECAST', headline, {
        id: f.id, chain, metric: f.metric, comparator: f.comparator, threshold: f.threshold, horizonMin: f.horizonMin,
        p: f.p, pRaw: f.pRaw, createdAtTs: f.createdAtTs, deadline: f.deadline, rationale: f.rationale,
        observed: f.evidence.observed, latestBlock: f.evidence.latestBlock, memoryUsed: f.memoryUsed,
      });
      f.mem = { status: 'pending', jobId, headline };
    } catch (e) {
      f.mem = { status: 'write_failed', error: String(e.message).slice(0, 160) };
    }
  }

  return {
    forecasts, dropped, signals,
    recalled: ctx.refs, calibration: ctx.stats, lessonsUsed: ctx.lessons,
    memory, llm: { model, usage },
  };
});
