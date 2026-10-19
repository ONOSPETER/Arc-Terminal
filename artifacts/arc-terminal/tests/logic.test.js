import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustProbability, assertNoLeakage, brier, calibrationStats, meanBrier, outcomeOf } from '../shared/scoring.js';
import { decodeCard, encodeCard } from '../shared/cards.js';
import { validateForecasts } from '../shared/prompt.js';

test('brier and outcome', () => {
  assert.equal(outcomeOf('above', 10, 10.5), 1);
  assert.equal(outcomeOf('above', 10, 10), 0);
  assert.equal(outcomeOf('below', 10, 9), 1);
  assert.equal(outcomeOf('below', 10, null), null);
  assert.ok(Math.abs(brier(0.8, 0) - 0.64) < 1e-9);
  assert.ok(Math.abs(meanBrier([{ p: 0.5, o: 1 }, { p: 0.5, o: 0 }]) - 0.25) < 1e-9);
});

test('calibration: overconfidence is pulled down, needs n>=3, shrinks when worse than a coin flip', () => {
  const few = calibrationStats([{ metric: 'm', p: 0.9, o: 0 }, { metric: 'm', p: 0.9, o: 0 }]);
  assert.equal(adjustProbability(0.9, 'm', few).p, 0.9);
  const rs = Array.from({ length: 8 }, () => ({ metric: 'm', p: 0.9, o: 0 }));
  const stats = calibrationStats(rs);
  assert.ok(stats.m.bias < -0.8);
  const adj = adjustProbability(0.9, 'm', stats);
  assert.ok(adj.p < 0.6, `expected strong correction, got ${adj.p}`);
  assert.equal(adj.shrink, 0.6);
  const calibrated = calibrationStats([...Array(5)].map((_, i) => ({ metric: 'x', p: 0.6, o: i < 3 ? 1 : 0 })));
  assert.ok(Math.abs(adjustProbability(0.6, 'x', calibrated).p - 0.6) < 0.05);
});

test('calibration falls back to pooled history (weaker) when a metric has too little of its own', () => {
  const rs = [...Array(4)].map(() => ({ metric: 'a', p: 0.9, o: 0 })).concat([...Array(2)].map(() => ({ metric: 'b', p: 0.9, o: 0 })));
  const stats = calibrationStats(rs);
  const own = adjustProbability(0.9, 'a', stats);
  const pooled = adjustProbability(0.9, 'b', stats);
  assert.equal(own.scope, 'metric');
  assert.equal(pooled.scope, 'pooled');
  assert.ok(pooled.p < 0.9 && pooled.p > own.p, `pooled should correct less than own history (${pooled.p} vs ${own.p})`);
});

test('leakage guard rejects memory from the future', () => {
  assert.equal(assertNoLeakage(1000, [{ resolvedAtTs: 999 }, { resolvedAtTs: 1000 }]), true);
  assert.throws(() => assertNoLeakage(1000, [{ resolvedAtTs: 1001 }]), /Leakage/);
});

test('memory cards round-trip and refuse secrets', () => {
  const t = encodeCard('LESSON', 'ethereum base_fee lesson', { chain: 'ethereum', lesson: 'shrink toward 0.5 | keep calm' });
  const c = decodeCard(t);
  assert.equal(c.type, 'LESSON');
  assert.equal(c.data.lesson, 'shrink toward 0.5 | keep calm');
  assert.throws(() => encodeCard('LESSON', 'x', { k: 'suiprivkey1qqqqqqqqqqqqqq' }), /secret/);
  assert.throws(() => encodeCard('LESSON', 'x', { k: 'a'.repeat(64) }), /secret/);
  assert.doesNotThrow(() => encodeCard('FORECAST', 'x', { digest: '0x' + 'a'.repeat(64) }));
  assert.equal(decodeCard('plain text'), null);
});

test('validateForecasts drops malformed model output instead of repairing it', () => {
  const signals = { availableMetrics: ['base_fee_gwei'], keys: ['base_fee_gwei', 'latest_block'] };
  const { ok, dropped } = validateForecasts({ forecasts: [
    { metric: 'base_fee_gwei', comparator: 'above', threshold: 12, horizonMinutes: 30, probability: 0.7, rationale: 'r', cites: ['base_fee_gwei', 'made_up'], invalidation: ['x'] },
    { metric: 'nonsense', comparator: 'above', threshold: 1, horizonMinutes: 30, probability: 0.5 },
    { metric: 'base_fee_gwei', comparator: 'above', threshold: 'abc', horizonMinutes: 30, probability: 0.5 },
    { metric: 'base_fee_gwei', comparator: 'above', threshold: 1, horizonMinutes: 7, probability: 0.5 },
  ] }, signals, 5);
  assert.equal(ok.length, 1);
  assert.deepEqual(ok[0].cites, ['base_fee_gwei']);
  assert.equal(dropped.length, 3);
});
