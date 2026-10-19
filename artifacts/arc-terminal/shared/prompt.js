import { METRICS, HORIZONS_MIN } from './chains.js';
import { clamp, round } from './scoring.js';

export function systemPrompt({ withMemory }) {
  return [
    'You are ARC, a careful on-chain research forecaster. You only reason from the OBSERVED SIGNALS provided. Never invent data.',
    'Produce binary, machine-resolvable forecasts: "<metric> will be <above|below> <threshold> at the reference time <horizon> minutes from now".',
    'The metric value is defined exactly as in METRIC DEFINITIONS and will be measured later from chain data. State probability that the claim is TRUE (0.03-0.97).',
    'Choose thresholds near the plausible decision boundary so the forecast is informative, not trivially true or false. Prefer variety across metrics.',
    withMemory
      ? 'You have LESSONS and CALIBRATION from your own earlier resolved forecasts. Apply them explicitly: adjust reasoning and confidence, and say which lesson you applied in "applied_lesson" (or null).'
      : 'You have no memory of earlier forecasts.',
    'Reply with JSON only: {"forecasts":[{"metric","comparator","threshold","horizonMinutes","probability","rationale","cites","invalidation","applied_lesson"}]}.',
    'rationale: max 45 words, interpretation only. cites: array of signal keys you relied on. invalidation: 1-2 short conditions that would make the forecast moot.',
  ].join('\n');
}

export function userPrompt({ chain, asOfIso, signals, count, lessons, stats, withMemory }) {
  const defs = Object.fromEntries(signals.availableMetrics.map((m) => [m, METRICS[m].desc + ` (unit: ${METRICS[m].unit})`]));
  const parts = [
    `CHAIN: ${chain}`,
    `REFERENCE TIME (now): ${asOfIso}`,
    `ALLOWED horizonMinutes: ${JSON.stringify(HORIZONS_MIN)}`,
    `METRIC DEFINITIONS: ${JSON.stringify(defs)}`,
    `OBSERVED SIGNALS (current value and prior windows, newest first): ${JSON.stringify(signals.compact)}`,
    `Produce exactly ${count} forecasts.`,
  ];
  if (withMemory) {
    parts.push(`CALIBRATION FROM PAST RESOLUTIONS: ${JSON.stringify(stats && Object.keys(stats).length ? stats : 'none yet')}`);
    parts.push(`LESSONS: ${JSON.stringify(lessons && lessons.length ? lessons.slice(0, 6) : 'none yet')}`);
  }
  return parts.join('\n');
}

/** Validate model output. Anything malformed is dropped (and reported), never repaired with invented numbers. */
export function validateForecasts(raw, signals, count) {
  const list = Array.isArray(raw?.forecasts) ? raw.forecasts : [];
  const ok = [];
  const dropped = [];
  for (const f of list) {
    const metric = f?.metric;
    const threshold = Number(f?.threshold);
    const horizonMin = Number(f?.horizonMinutes);
    const p = Number(f?.probability);
    const why =
      !signals.availableMetrics.includes(metric) ? 'metric not available'
      : !['above', 'below'].includes(f?.comparator) ? 'bad comparator'
      : !Number.isFinite(threshold) ? 'bad threshold'
      : !HORIZONS_MIN.includes(horizonMin) ? 'horizon not allowed'
      : !Number.isFinite(p) ? 'bad probability' : null;
    if (why) { dropped.push({ reason: why, metric }); continue; }
    ok.push({
      metric,
      comparator: f.comparator,
      threshold: round(threshold, 4),
      horizonMin,
      pRaw: round(clamp(p, 0.03, 0.97)),
      rationale: String(f.rationale || '').slice(0, 280),
      cites: (Array.isArray(f.cites) ? f.cites : []).filter((c) => signals.keys.includes(c)).slice(0, 6),
      invalidation: (Array.isArray(f.invalidation) ? f.invalidation : []).map((s) => String(s).slice(0, 140)).slice(0, 2),
      appliedLesson: f.applied_lesson ? String(f.applied_lesson).slice(0, 200) : null,
    });
    if (ok.length >= count) break;
  }
  return { ok, dropped };
}
