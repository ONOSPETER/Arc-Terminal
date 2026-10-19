import test from 'node:test';
import assert from 'node:assert/strict';
import { N0, T0, call, fakeMemory, installFetch, mockChain, setEnv } from './helpers.js';
import { makeRpc, measure, blockAtTimestamp } from '../api/_lib/tatum.js';
import { __setClientForTests } from '../api/_lib/memory.js';

setEnv();

test('measure uses only blocks at or before the reference time and finds the right block', async () => {
  const chain = mockChain({ latest: N0 });
  const f = installFetch({ chain, onLLM: () => ({}) });
  try {
    const rpc = makeRpc('ethereum');
    const latest = await rpc.latest();
    const target = T0 - 3600;
    const b = await blockAtTimestamp(rpc, target, latest);
    assert.ok(b.timestamp <= target && target - b.timestamp < 12, 'last block at or before ts');
    const m = await measure(makeRpc('ethereum'), 'ethereum', target);
    // The chain head is read only to locate the reference block; metric inputs must all be at or before it.
    assert.equal(m.endBlock, b.number);
    assert.ok(m.endTs <= target);
    assert.ok(Math.max(...m.sampledBlocks) <= m.endBlock, 'metric used a block newer than the reference time');
    assert.ok(m.values.base_fee_gwei > 9 && m.values.gas_utilization === 50 && m.values.usdc_transfers === 321);
  } finally { f.restore(); }
});

test('acceptance cycle with mocks: forecast -> store -> resolve -> lesson -> recall -> adjusted forecast', async () => {
  const chain = mockChain({ latest: N0 });
  const mem = fakeMemory();
  __setClientForTests(mem);
  // The model is always very confident that base fee will be above 100 gwei. The mock chain says otherwise (~10-20).
  const f = installFetch({
    chain,
    onLLM: (body) => body.messages[0].content.includes('LESSONS') && body.messages[1].content.startsWith('CHAIN') && body.model && body.messages[0].content.includes('Reply with JSON only: {"forecasts"')
      ? { forecasts: [{ metric: 'base_fee_gwei', comparator: 'above', threshold: 100, horizonMinutes: 15, probability: 0.9, rationale: 'sure', cites: ['base_fee_gwei'], invalidation: ['reorg'], applied_lesson: null }] }
      : { lessons: [{ metric: 'base_fee_gwei', lesson: 'Stop claiming huge fee spikes; stated 0.9 but it never happened.' }] },
  });
  try {
    const { default: forecast } = await import('../api/forecast.js');
    const { default: resolve } = await import('../api/resolve.js');

    // Run 1: no memory yet.
    const r1 = await call(forecast, { body: { chain: 'ethereum', count: 1 } });
    assert.equal(r1.code, 200, JSON.stringify(r1.body));
    const f1 = r1.body.forecasts[0];
    assert.equal(f1.p, 0.9);
    assert.equal(f1.memoryUsed, false);
    assert.equal(f1.mem.status, 'pending');
    assert.equal(mem.store.filter((s) => s.text.startsWith('[ARC:FORECAST]')).length, 1);
    assert.ok(mem.calls.indexOf('recall') < mem.calls.indexOf('remember'), 'recall must happen before write');

    // Not due yet.
    const early = await call(resolve, { body: { forecasts: [f1] } });
    assert.equal(early.body.resolutions.length, 0);
    assert.equal(early.body.skipped[0].status, 'not_due');

    // Time passes on the mock chain; resolve at the forecast's own deadline.
    chain.state.latest = N0 + 200;
    const fResolved = await call(resolve, { body: { forecasts: [{ ...f1, mem: { blobId: 'blob_0' } }] } });
    assert.equal(fResolved.code, 200, JSON.stringify(fResolved.body));
    const res = fResolved.body.resolutions[0];
    assert.equal(res.o, 0);
    assert.ok(Math.abs(res.brier - 0.81) < 1e-6);
    assert.ok(res.endTs <= f1.deadline, 'resolved with data at or before the deadline, not later data');
    assert.equal(fResolved.body.lessons.length, 1);
    assert.ok(mem.store.some((s) => s.text.startsWith('[ARC:RESOLUTION]')) && mem.store.some((s) => s.text.startsWith('[ARC:LESSON]')));

    // Seed more resolutions so calibration has n>=3 (these are written by the same route in real use).
    for (let i = 0; i < 3; i++) await call(resolve, { body: { forecasts: [{ ...f1, id: f1.id + i }] } });

    // Run 2: memory is recalled and used.
    const r2 = await call(forecast, { body: { chain: 'ethereum', count: 1 } });
    const f2 = r2.body.forecasts[0];
    assert.equal(f2.memoryUsed, true);
    assert.ok(r2.body.recalled.length >= 2);
    assert.ok(f2.p < 0.9 && f2.pRaw === 0.9, `probability should be corrected, got ${f2.p}`);
    const lastPrompt = f.llmCalls.filter((c) => c.messages[1].content.startsWith('CHAIN')).at(-1).messages[1].content;
    assert.ok(lastPrompt.includes('Stop claiming huge fee spikes'), 'lesson reached the prompt');
    assert.ok(!JSON.stringify(mem.store).includes('test-mw') && !JSON.stringify(mem.store).includes('test-or'), 'no secrets in memory');
  } finally { f.restore(); __setClientForTests(null); }
});

test('replay-step refuses memory from the future and too-recent reference times', async () => {
  const chain = mockChain({ latest: N0 });
  const f = installFetch({ chain, onLLM: () => ({ forecasts: [] }) });
  try {
    const { default: step } = await import('../api/replay-step.js');
    const asOf = T0 - 6 * 3600;
    const leak = await call(step, { body: { chain: 'ethereum', asOf, memResolutions: [{ metric: 'base_fee_gwei', p: 0.5, o: 1, resolvedAtTs: asOf + 60 }] } });
    assert.equal(leak.code, 400);
    assert.match(leak.body.error, /Leakage/);
    const recent = await call(step, { body: { chain: 'ethereum', asOf: T0 - 600 } });
    assert.equal(recent.code, 400);
    const ok = await call(step, { body: { chain: 'ethereum', asOf, memResolutions: [] } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
  } finally { f.restore(); }
});

test('api requires the passcode when ARC_ACCESS_TOKEN is set, and reports missing config', async () => {
  const { default: signals } = await import('../api/signals.js');
  process.env.ARC_ACCESS_TOKEN = 'letmein';
  const denied = await call(signals, { method: 'GET', query: { chain: 'ethereum' } });
  assert.equal(denied.code, 401);
  delete process.env.ARC_ACCESS_TOKEN;
  const saved = process.env.TATUM_API_KEY;
  delete process.env.TATUM_API_KEY;
  const missing = await call(signals, { method: 'GET', query: {} });
  assert.equal(missing.code, 503);
  assert.deepEqual(missing.body.missing, ['TATUM_API_KEY']);
  process.env.TATUM_API_KEY = saved;
});
