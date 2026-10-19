import { CHAINS, METRICS, WINDOW_SEC, SAMPLES, USDC_BLOCK_SPAN } from '../../shared/chains.js';
import { round } from '../../shared/scoring.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hex = (n) => '0x' + n.toString(16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function rpcUrl(chain) {
  const slug = process.env[`TATUM_SLUG_${chain.toUpperCase()}`] || CHAINS[chain].slug;
  return `https://${slug}.gateway.tatum.io`;
}

/** Minimal JSON-RPC client for Tatum's gateway: x-api-key auth, small concurrency, 429 backoff, call cache. */
export function makeRpc(chain, { fetchImpl = globalThis.fetch, concurrency = 3 } = {}) {
  const url = rpcUrl(chain);
  const cache = new Map();
  const stats = { calls: 0 };
  let active = 0;
  const queue = [];
  const acquire = () => new Promise((res) => { if (active < concurrency) { active++; res(); } else queue.push(res); });
  const release = () => { const next = queue.shift(); if (next) next(); else active--; };
  let latestMemo = null;

  async function call(method, params = []) {
    const cacheable = !JSON.stringify(params).includes('latest') && method !== 'eth_blockNumber';
    const key = method + JSON.stringify(params);
    if (cacheable && cache.has(key)) return cache.get(key);
    const p = (async () => {
      await acquire();
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          stats.calls++;
          const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': process.env.TATUM_API_KEY || '' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          });
          if (res.status === 429 || res.status >= 500) { await sleep(400 * 2 ** attempt); continue; }
          if (res.status === 401 || res.status === 403) throw new Error('Tatum rejected the API key (check TATUM_API_KEY and plan access to this chain)');
          if (!res.ok) throw new Error(`Tatum HTTP ${res.status}`);
          const json = await res.json();
          if (json.error) throw new Error(`RPC ${method}: ${json.error.message || 'error'}`);
          return json.result;
        }
        throw new Error('Tatum rate limit or server error persisted after retries');
      } finally { release(); }
    })();
    if (cacheable) { cache.set(key, p); p.catch(() => cache.delete(key)); }
    return p;
  }

  async function getBlock(n) {
    const b = await call('eth_getBlockByNumber', [typeof n === 'number' ? hex(n) : n, false]);
    if (!b) throw new Error(`block ${n} not found`);
    return {
      number: parseInt(b.number, 16),
      timestamp: parseInt(b.timestamp, 16),
      baseFeeGwei: b.baseFeePerGas ? parseInt(b.baseFeePerGas, 16) / 1e9 : null,
      gasUsed: parseInt(b.gasUsed, 16),
      gasLimit: parseInt(b.gasLimit, 16),
      txCount: Array.isArray(b.transactions) ? b.transactions.length : 0,
    };
  }

  const latest = () => (latestMemo ||= getBlock('latest'));
  return { call, getBlock, latest, stats, chain, url };
}

/** Last block with timestamp <= ts. Secant-style search; a handful of calls. */
export async function blockAtTimestamp(rpc, ts, latest) {
  if (ts >= latest.timestamp) return latest;
  const ref = await rpc.getBlock(Math.max(1, latest.number - 1000));
  const avg = Math.max(0.1, (latest.timestamp - ref.timestamp) / Math.max(1, latest.number - ref.number));
  let guess = Math.min(latest.number, Math.max(1, Math.round(latest.number - (latest.timestamp - ts) / avg)));
  let b = await rpc.getBlock(guess);
  for (let i = 0; i < 6; i++) {
    const d = ts - b.timestamp;
    if (Math.abs(d) <= avg * 1.5) break;
    guess = Math.min(latest.number, Math.max(1, guess + Math.round(d / avg)));
    b = await rpc.getBlock(guess);
  }
  for (let i = 0; i < 12 && b.timestamp > ts && b.number > 1; i++) b = await rpc.getBlock(b.number - 1);
  for (let i = 0; i < 12 && b.number < latest.number; i++) {
    const nx = await rpc.getBlock(b.number + 1);
    if (nx.timestamp > ts) break;
    b = nx;
  }
  return b;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Measure metrics at reference time endTs using ONLY blocks at or before endTs. */
export async function measure(rpc, chain, endTs, metrics = Object.keys(METRICS)) {
  const latest = await rpc.latest();
  if (endTs > latest.timestamp + 5) throw new Error('Reference time is in the future for this chain');
  const end = await blockAtTimestamp(rpc, endTs, latest);
  const out = { endBlock: end.number, endTs: end.timestamp, samples: 0, values: {}, unavailable: {} };
  if (metrics.some((m) => m !== 'usdc_transfers')) {
    const span = Math.max(SAMPLES, Math.round(WINDOW_SEC / CHAINS[chain].blockTimeSec));
    const nums = Array.from({ length: SAMPLES }, (_, i) => Math.max(1, end.number - Math.round((i * span) / (SAMPLES - 1))));
    const blocks = await Promise.all(nums.map((n) => (n === end.number ? end : rpc.getBlock(n))));
    out.samples = blocks.length;
    out.sampledBlocks = blocks.map((b) => b.number);
    const fees = blocks.map((b) => b.baseFeeGwei).filter((x) => x !== null);
    out.values.base_fee_gwei = fees.length ? avg(fees) : null;
    if (!fees.length) out.unavailable.base_fee_gwei = 'block headers carry no baseFeePerGas on this chain';
    out.values.gas_utilization = avg(blocks.map((b) => (100 * b.gasUsed) / b.gasLimit));
    out.values.tx_per_block = avg(blocks.map((b) => b.txCount));
  }
  if (metrics.includes('usdc_transfers')) {
    try {
      const logs = await rpc.call('eth_getLogs', [{ fromBlock: hex(Math.max(1, end.number - USDC_BLOCK_SPAN + 1)), toBlock: hex(end.number), address: CHAINS[chain].usdc, topics: [TRANSFER_TOPIC] }]);
      out.values.usdc_transfers = logs.length;
    } catch (e) {
      out.values.usdc_transfers = null;
      out.unavailable.usdc_transfers = String(e.message).slice(0, 140);
    }
  }
  for (const m of metrics) if (!(m in out.values)) out.values[m] = null;
  return out;
}

const OFFSETS = [0, 1800, 3600, 5400];
const NAMES = ['now', 'prev_30m', 'prev_60m', 'prev_90m'];

/** Observed facts used as forecast evidence. Everything here comes from chain data; nothing is model output. */
export async function collectSignals(rpc, chain, asOfTs) {
  const snaps = await Promise.all(OFFSETS.map((o, i) => measure(rpc, chain, asOfTs - o, i < 2 ? Object.keys(METRICS) : Object.keys(METRICS).filter((m) => m !== 'usdc_transfers'))));
  const unavailable = { ...snaps[0].unavailable };
  const availableMetrics = Object.keys(METRICS).filter((m) => snaps[0].values[m] !== null && snaps[0].values[m] !== undefined);
  const compact = {};
  const series = {};
  for (const m of availableMetrics) {
    const row = {};
    snaps.forEach((s, i) => { if (s.values[m] !== null && s.values[m] !== undefined) row[NAMES[i]] = round(s.values[m], METRICS[m].digits + 1); });
    const prev = row.prev_30m;
    row.change_pct_30m = prev ? round(((row.now - prev) / prev) * 100, 1) : null;
    compact[m] = row;
    series[m] = snaps.map((s, i) => ({ at: NAMES[i], endTs: s.endTs, endBlock: s.endBlock, value: s.values[m] === null ? null : round(s.values[m], 4) })).reverse();
  }
  compact.latest_block = snaps[0].endBlock;
  return {
    chain, asOfTs, latestBlock: snaps[0].endBlock, availableMetrics, unavailable,
    compact, series, keys: [...availableMetrics, 'latest_block'],
    provenance: { source: 'Tatum JSON-RPC', url: rpc.url.replace(/\/\/.*@/, '//'), windowSec: WINDOW_SEC, samplesPerWindow: SAMPLES, rpcCalls: rpc.stats.calls },
  };
}
