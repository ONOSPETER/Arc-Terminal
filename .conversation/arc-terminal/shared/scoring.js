// Pure scoring / calibration / lesson logic. No I/O, so it is shared by the API, the UI and the tests.
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round = (x, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/** Outcome of a claim "metric <comparator> threshold" given the observed value. */
export function outcomeOf(comparator, threshold, observed) {
  if (!Number.isFinite(observed)) return null;
  return (comparator === 'above' ? observed > threshold : observed < threshold) ? 1 : 0;
}

export const brier = (p, o) => (o === null || o === undefined ? null : (p - o) ** 2);

export function meanBrier(items) {
  const xs = items.map((i) => brier(i.p, i.o)).filter((x) => x !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Per-metric calibration stats from resolved items [{metric, p, o}]. */
export function calibrationStats(resolved) {
  const by = {};
  for (const r of resolved) {
    if (r.o === null || r.o === undefined || !Number.isFinite(r.p)) continue;
    (by[r.metric] ||= []).push(r);
  }
  const out = {};
  for (const [metric, rs] of Object.entries(by)) {
    const n = rs.length;
    const meanP = rs.reduce((a, r) => a + r.p, 0) / n;
    const hit = rs.reduce((a, r) => a + r.o, 0) / n;
    out[metric] = { n, meanP: round(meanP), hitRate: round(hit), bias: round(hit - meanP), brier: round(meanBrier(rs)) };
  }
  return out;
}

/**
 * Deterministic confidence calibration learned from past resolutions.
 * 1) shift by observed bias, weighted by sample size; 2) shrink toward 0.5 if the evidence is worse than a coin flip.
 * Uses the metric's own history when it has >=3 items; otherwise falls back to history pooled across metrics at half weight.
 */
export function adjustProbability(p, metric, stats) {
  let s = stats?.[metric];
  let scope = 'metric';
  let half = 1;
  if (!s || s.n < 3) {
    const all = Object.values(stats || {});
    const n = all.reduce((a, x) => a + x.n, 0);
    if (n < 3) return { p: clamp(p, 0.03, 0.97), shift: 0, shrink: 1, basedOn: s?.n ?? 0, scope: 'none' };
    const avg = (k) => all.reduce((a, x) => a + x.n * x[k], 0) / n;
    s = { n, bias: avg('bias'), brier: avg('brier') };
    scope = 'pooled';
    half = 0.5;
  }
  const w = (s.n / (s.n + 6)) * half;
  const shift = w * s.bias;
  const shrink = s.brier > 0.25 && s.n >= 5 ? (scope === 'pooled' ? 0.8 : 0.6) : 1;
  const shifted = clamp(p + shift, 0.03, 0.97);
  const adjusted = clamp(0.5 + (shifted - 0.5) * shrink, 0.03, 0.97);
  return { p: round(adjusted), shift: round(shift), shrink, basedOn: s.n, scope };
}

/** Plain-language, fully deterministic lesson from stats (used as the fallback and in replay). */
export function lessonFromStats(chain, metric, s) {
  const dir = s.bias > 0.08 ? 'underconfident (claims came true more often than stated)' : s.bias < -0.08 ? 'overconfident (claims came true less often than stated)' : 'roughly calibrated';
  const act = s.brier > 0.25 ? 'worse than a coin flip: shrink probabilities toward 0.5 and demand stronger evidence' : s.bias > 0.08 ? 'raise stated probabilities slightly' : s.bias < -0.08 ? 'lower stated probabilities' : 'keep current calibration';
  return `On ${chain} ${metric}: n=${s.n}, mean stated p=${s.meanP}, hit rate=${s.hitRate}, Brier=${s.brier}. Forecasts were ${dir}; ${act}.`;
}

/** Walk-forward guard: nothing resolved after `asOf` may inform a forecast made at `asOf`. */
export function assertNoLeakage(asOfSec, items) {
  for (const it of items || []) {
    const t = it.resolvedAtTs ?? it.deadline;
    if (Number.isFinite(t) && t > asOfSec) {
      throw new Error(`Leakage: item resolved at ${t} is later than forecast time ${asOfSec}`);
    }
  }
  return true;
}
