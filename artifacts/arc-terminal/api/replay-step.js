import { handler, requireEnv, HttpError, clampInt } from './_lib/http.js';
import { makeRpc, collectSignals } from './_lib/tatum.js';
import { pickForecastChain, resolveOne, runPolicy, sanitizeForecast } from './_lib/engine.js';
import { assertNoLeakage, calibrationStats, lessonFromStats } from '../shared/scoring.js';

// One walk-forward step. The browser drives the loop so each call stays well inside the function time limit.
// Leakage rules: (1) signals use only blocks <= asOf, (2) memory handed in must have been resolved <= asOf,
// (3) outcomes are measured at each forecast's own deadline, after the forecast is fixed.
export default handler({ methods: ['POST'] }, async ({ body }) => {
  requireEnv(['TATUM_API_KEY'], 'Tatum');
  requireEnv(['OPENROUTER_API_KEY'], 'OpenRouter');
  const chain = pickForecastChain(body.chain || 'ethereum');
  const asOf = Number(body.asOf);
  const count = clampInt(body.count, 1, 4, 3);
  const prior = Array.isArray(body.memResolutions) ? body.memResolutions.slice(-60) : [];
  if (!Number.isFinite(asOf)) throw new HttpError(400, 'asOf (unix seconds) required');

  const rpc = makeRpc(chain);
  const latest = await rpc.latest();
  if (asOf + 180 * 60 + 120 > latest.timestamp) throw new HttpError(400, 'asOf is too recent: every horizon must be resolvable from past data');
  try { assertNoLeakage(asOf, prior); } catch (e) { throw new HttpError(400, e.message); }

  const signals = await collectSignals(rpc, chain, asOf);
  const stats = calibrationStats(prior.map((r) => ({ metric: r.metric, p: r.pRaw ?? r.p, o: r.o })));
  const lessons = Object.entries(stats).map(([metric, s]) => ({ metric, lesson: lessonFromStats(chain, metric, s) }));

  const [base, mem] = await Promise.all([
    runPolicy({ policy: 'baseline', chain, signals, count, asOfTs: asOf }),
    runPolicy({ policy: 'memory', chain, signals, count, asOfTs: asOf, memory: { lessons, stats } }),
  ]);

  const resolveAll = async (forecasts) => {
    const out = [];
    for (const f of forecasts) {
      const r = await resolveOne(rpc, sanitizeForecast({ ...f, horizonMin: f.horizonMin }));
      out.push({ ...f, resolution: r });
    }
    return out;
  };
  const [baseline, memory] = [await resolveAll(base.forecasts), await resolveAll(mem.forecasts)];
  return { asOf, signals: signals.compact, baseline, memory, lessonsUsed: lessons, calibrationUsed: stats, priorCount: prior.length, rpcCalls: rpc.stats.calls };
});
