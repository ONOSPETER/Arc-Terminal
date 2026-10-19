import crypto from 'node:crypto';
import { CHAINS, METRICS, HORIZONS_MIN } from '../../shared/chains.js';
import { adjustProbability, brier, calibrationStats, lessonFromStats, outcomeOf, round } from '../../shared/scoring.js';
import { systemPrompt, userPrompt, validateForecasts } from '../../shared/prompt.js';
import { chatJSON } from './llm.js';
import { measure } from './tatum.js';
import { HttpError } from './http.js';

export const pickChain = (c) => {
  if (!CHAINS[c]) throw new HttpError(400, `Unknown chain "${c}". Use one of: ${Object.keys(CHAINS).join(', ')}`);
  return c;
};

/** Split recalled Walrus cards into lessons, calibration stats and display refs. */
export function memoryContext(cards) {
  const lessons = cards.filter((c) => c.type === 'LESSON').map((c) => ({ metric: c.data.metric, lesson: c.data.lesson, at: c.data.createdAt }));
  const resolved = cards.filter((c) => c.type === 'RESOLUTION').map((c) => ({ metric: c.data.metric, p: c.data.pRaw ?? c.data.p, o: c.data.o }));
  return {
    lessons,
    stats: calibrationStats(resolved),
    refs: cards.map((c) => ({ type: c.type, blobId: c.blobId, summary: c.headline.slice(0, 160), distance: c.distance ?? null })),
  };
}

/** One forecasting policy: LLM proposal -> validation -> (memory policy only) deterministic calibration. */
export async function runPolicy({ policy, chain, signals, count, memory, asOfTs }) {
  const withMemory = policy === 'memory';
  const asOfIso = new Date(asOfTs * 1000).toISOString();
  const { json, usage, model } = await chatJSON({
    system: systemPrompt({ withMemory }),
    user: userPrompt({ chain, asOfIso, signals, count, withMemory, lessons: memory?.lessons, stats: memory?.stats }),
  });
  const { ok, dropped } = validateForecasts(json, signals, count);
  const forecasts = ok.map((f, i) => {
    const adj = withMemory ? adjustProbability(f.pRaw, f.metric, memory?.stats) : { p: f.pRaw, shift: 0, shrink: 1, basedOn: 0 };
    return {
      id: `${chain}-${asOfTs}-${policy}-${i}-${crypto.randomBytes(3).toString('hex')}`,
      policy, chain, createdAtTs: asOfTs, createdAt: asOfIso,
      deadline: asOfTs + f.horizonMin * 60,
      ...f, p: adj.p,
      calibration: { shift: adj.shift, shrink: adj.shrink, basedOn: adj.basedOn, scope: adj.scope || 'none' },
      memoryUsed: Boolean(withMemory && (memory?.lessons?.length || Object.keys(memory?.stats || {}).length)),
      evidence: { observed: signals.compact[f.metric], latestBlock: signals.latestBlock, source: 'Tatum JSON-RPC (observed)' },
      model,
    };
  });
  return { forecasts, dropped, usage, model };
}

/** Never trust forecast objects coming back from the browser. */
export function sanitizeForecast(f) {
  const chain = pickChain(f?.chain);
  if (!METRICS[f.metric] || !['above', 'below'].includes(f.comparator)) throw new HttpError(400, 'Invalid forecast object');
  const nums = ['threshold', 'p', 'deadline', 'createdAtTs'].map((k) => Number(f[k]));
  if (nums.some((n) => !Number.isFinite(n)) || !HORIZONS_MIN.includes(Number(f.horizonMin))) throw new HttpError(400, 'Invalid forecast numbers');
  return {
    id: String(f.id).slice(0, 80), chain, metric: f.metric, comparator: f.comparator,
    threshold: nums[0], p: nums[1], pRaw: Number.isFinite(Number(f.pRaw)) ? Number(f.pRaw) : nums[1],
    deadline: nums[2], createdAtTs: nums[3], horizonMin: Number(f.horizonMin),
    rationale: String(f.rationale || '').slice(0, 280), policy: f.policy || 'memory',
    blobId: f.mem?.blobId ? String(f.mem.blobId).slice(0, 120) : null,
  };
}

/** Measure the metric at the forecast's own deadline (not "now"), then score it. */
export async function resolveOne(rpc, f) {
  const latest = await rpc.latest();
  if (f.deadline > latest.timestamp) return { forecastId: f.id, status: 'not_due', dueInSec: f.deadline - latest.timestamp };
  const m = await measure(rpc, f.chain, f.deadline, [f.metric]);
  const observed = m.values[f.metric];
  if (observed === null || observed === undefined) {
    return { forecastId: f.id, status: 'unresolvable', reason: m.unavailable[f.metric] || 'metric unavailable at deadline' };
  }
  const o = outcomeOf(f.comparator, f.threshold, observed);
  const b = brier(f.p, o);
  return {
    forecastId: f.id, status: 'resolved', chain: f.chain, metric: f.metric, comparator: f.comparator, threshold: f.threshold,
    p: f.p, pRaw: f.pRaw, o, brier: round(b), observed: round(observed, 4),
    endBlock: m.endBlock, endTs: m.endTs, samples: m.samples, resolvedAtTs: f.deadline,
    mistake: errorNote(f, observed, o, b),
  };
}

function errorNote(f, observed, o, b) {
  const verdict = o === 1 ? 'claim came true' : 'claim did not come true';
  const dir = (o === 1 && f.p < 0.5) || (o === 0 && f.p > 0.5) ? 'wrong side of 50%' : 'right side of 50%';
  return `Stated p=${f.p} that ${f.metric} ${f.comparator} ${f.threshold}; observed ${round(observed, 3)} so the ${verdict} (${dir}, Brier ${round(b)}).`;
}

/** LLM-written lessons per metric from newly resolved forecasts, with a deterministic fallback. */
export async function makeLessons(chain, resolutions, stats) {
  const metrics = [...new Set(resolutions.map((r) => r.metric))];
  const fallback = () => metrics.filter((m) => stats[m]).map((m) => ({ metric: m, lesson: lessonFromStats(chain, m, stats[m]), source: 'deterministic' }));
  try {
    const { json } = await chatJSON({
      kind: 'lesson', maxTokens: 500,
      system: 'You write short, concrete forecasting lessons from resolved forecast errors. Use only the numbers given. JSON only: {"lessons":[{"metric","lesson"}]}. Each lesson max 40 words and must say what to do differently.',
      user: JSON.stringify({ chain, resolved: resolutions.map((r) => ({ metric: r.metric, comparator: r.comparator, threshold: r.threshold, p: r.p, observed: r.observed, outcome: r.o, brier: r.brier })), calibration: stats }),
    });
    const out = (json.lessons || []).filter((l) => metrics.includes(l.metric) && l.lesson).map((l) => ({ metric: l.metric, lesson: String(l.lesson).slice(0, 260), source: 'model' }));
    return out.length ? out : fallback();
  } catch { return fallback(); }
}
