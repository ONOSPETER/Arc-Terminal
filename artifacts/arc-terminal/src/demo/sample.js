// SAMPLE DATA ONLY. Everything produced here is synthetic and carries sample:true; the UI labels it.
// The calibration maths is the real shared code, so demo mode shows the genuine learning mechanics on fake inputs.
import { METRICS } from '../../shared/chains.js';
import { adjustProbability, brier, calibrationStats, lessonFromStats, outcomeOf, round } from '../../shared/scoring.js';

const DEMO_METRICS = ['base_fee_gwei', 'tx_per_block'];
const BASE = { base_fee_gwei: 14, gas_utilization: 52, tx_per_block: 148, usdc_transfers: 410 };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let live = rng(Date.now() % 100000);

export function demoSignals(chain, r = live) {
  const compact = {}; const series = {};
  for (const m of Object.keys(METRICS)) {
    const now = BASE[m] * (0.9 + r() * 0.2);
    const pts = [now, now * (0.95 + r() * 0.1), now * (0.92 + r() * 0.16), now * (0.9 + r() * 0.2)];
    compact[m] = { now: round(pts[0], 2), prev_30m: round(pts[1], 2), prev_60m: round(pts[2], 2), prev_90m: round(pts[3], 2), change_pct_30m: round(((pts[0] - pts[1]) / pts[1]) * 100, 1) };
    series[m] = ['prev_90m', 'prev_60m', 'prev_30m', 'now'].map((at, i) => ({ at, value: round(pts[3 - i], 3) }));
  }
  return { chain, sample: true, availableMetrics: Object.keys(METRICS), unavailable: {}, compact, series, latestBlock: null, provenance: { source: 'SAMPLE DATA (not from a chain)' } };
}

function makeClaim(signals, r) {
  const metric = DEMO_METRICS[Math.floor(r() * DEMO_METRICS.length)];
  const now = signals.compact[metric].now;
  const comparator = r() < 0.5 ? 'above' : 'below';
  const threshold = round(now * (comparator === 'above' ? 1.04 : 0.96), 2);
  return { metric, comparator, threshold, pRaw: 0.82, hiddenOutcome: r() < 0.4 ? 1 : 0, now };
}

export function demoForecasts({ chain, count, resolvedForStats }) {
  const signals = demoSignals(chain);
  const stats = calibrationStats(resolvedForStats);
  const memoryUsed = Object.keys(stats).length > 0;
  const nowTs = Math.floor(Date.now() / 1000);
  const forecasts = Array.from({ length: count }, (_, i) => {
    const c = makeClaim(signals, live);
    const adj = memoryUsed ? adjustProbability(c.pRaw, c.metric, stats) : { p: c.pRaw, shift: 0, shrink: 1, basedOn: 0 };
    return {
      id: `sample-${chain}-${nowTs}-${i}-${Math.floor(live() * 1e4)}`, sample: true, policy: 'memory', chain,
      createdAtTs: nowTs, createdAt: new Date().toISOString(), horizonMin: 30, deadline: nowTs + 1800,
      metric: c.metric, comparator: c.comparator, threshold: c.threshold, pRaw: c.pRaw, p: adj.p,
      calibration: { shift: adj.shift, shrink: adj.shrink, basedOn: adj.basedOn }, memoryUsed,
      rationale: 'SAMPLE rationale: placeholder text, no model was called.', cites: [c.metric], invalidation: ['SAMPLE: chain halt'],
      appliedLesson: memoryUsed ? 'SAMPLE: shrink toward 0.5 when past Brier is worse than a coin flip' : null,
      evidence: { observed: signals.compact[c.metric], source: 'SAMPLE DATA' }, model: 'sample', _hidden: c.hiddenOutcome,
    };
  });
  return { forecasts, signals, recalled: [], calibration: stats };
}

export function demoResolve(f) {
  const o = f._hidden ?? 0;
  const observed = f.comparator === 'above' ? f.threshold * (o ? 1.03 : 0.97) : f.threshold * (o ? 0.97 : 1.03);
  const b = brier(f.p, outcomeOf(f.comparator, f.threshold, observed));
  return {
    forecastId: f.id, status: 'resolved', sample: true, chain: f.chain, metric: f.metric, comparator: f.comparator, threshold: f.threshold,
    p: f.p, pRaw: f.pRaw, o, brier: round(b), observed: round(observed, 3), endBlock: null, samples: 0, resolvedAtTs: f.deadline,
    mistake: `SAMPLE: stated p=${f.p}, outcome ${o}, Brier ${round(b)}.`,
  };
}

export const demoLesson = (chain, metric, stats) => ({ metric, chain, lesson: 'SAMPLE ' + lessonFromStats(chain, metric, stats), source: 'deterministic', sample: true, createdAt: new Date().toISOString() });

/** Walk-forward replay on synthetic claims: same claims for both policies, memory only from earlier steps. */
export function demoReplay({ steps, count }) {
  const r = rng(42);
  const memRes = [];
  const out = [];
  for (let k = 0; k < steps; k++) {
    const signals = demoSignals('ethereum', r);
    const stats = calibrationStats(memRes);
    const base = []; const mem = [];
    for (let i = 0; i < count; i++) {
      const c = makeClaim(signals, r);
      const o = c.hiddenOutcome;
      const adj = adjustProbability(c.pRaw, c.metric, stats);
      const mk = (policy, p) => ({ policy, sample: true, metric: c.metric, comparator: c.comparator, threshold: c.threshold, horizonMin: 30, pRaw: c.pRaw, p, resolution: { status: 'resolved', o, brier: round(brier(p, o)), resolvedAtTs: k * 10800 + 1800 } });
      base.push(mk('baseline', c.pRaw)); mem.push(mk('memory', adj.p));
      memRes.push({ metric: c.metric, p: c.pRaw, o });
    }
    out.push({ asOf: k, baseline: base, memory: mem, calibrationUsed: stats, lessonsUsed: Object.entries(stats).map(([m, s]) => ({ metric: m, lesson: lessonFromStats('sample', m, s) })) });
  }
  return out;
}
