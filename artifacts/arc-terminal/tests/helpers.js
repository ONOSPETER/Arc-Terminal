// Test doubles. These are mocks of Tatum, OpenRouter and Walrus Memory used ONLY by the test-suite.
export const N0 = 20_000_000;
export const T0 = 1_700_000_000;

export function mockChain(state = { latest: N0 }) {
  const seen = { maxBlock: 0, methods: [] };
  const blk = (n) => {
    seen.maxBlock = Math.max(seen.maxBlock, n);
    const fee = Math.floor((10 + (n % 50) / 5) * 1e9);
    return {
      number: '0x' + n.toString(16), timestamp: '0x' + (T0 + 12 * (n - N0)).toString(16),
      baseFeePerGas: '0x' + fee.toString(16), gasUsed: '0x' + (15e6).toString(16), gasLimit: '0x' + (30e6).toString(16),
      transactions: Array.from({ length: 100 + (n % 20) }, (_, i) => i),
    };
  };
  const handle = (method, params) => {
    seen.methods.push(method);
    if (method === 'eth_getBlockByNumber') {
      const n = params[0] === 'latest' ? state.latest : parseInt(params[0], 16);
      if (n > state.latest) return null;
      return blk(n);
    }
    if (method === 'eth_getLogs') return Array.from({ length: 321 }, (_, i) => ({ i }));
    throw new Error('unmocked ' + method);
  };
  return { state, seen, handle };
}

export function installFetch({ chain, onLLM }) {
  const real = globalThis.fetch;
  const llmCalls = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (String(url).includes('gateway.tatum.io')) {
      const result = chain.handle(body.method, body.params);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
    }
    if (String(url).includes('openrouter.ai')) {
      llmCalls.push(body);
      const content = onLLM(body, llmCalls.length);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 1 }, model: body.model }), { status: 200 });
    }
    throw new Error('unexpected fetch ' + url);
  };
  return { llmCalls, restore: () => { globalThis.fetch = real; } };
}

export function fakeMemory() {
  const store = [];
  const calls = [];
  return {
    store, calls,
    async remember(text) { calls.push('remember'); store.push({ text, blob: `blob_${store.length}` }); return { job_id: `job_${store.length - 1}` }; },
    async waitForRememberJob(id) { return { blob_id: store[Number(id.split('_')[1])].blob }; },
    async recall({ query, limit }) {
      calls.push('recall');
      const type = ['FORECAST', 'RESOLUTION', 'LESSON'].find((t) => query.includes(t));
      return { results: store.filter((s) => s.text.startsWith(`[ARC:${type}]`)).slice(-limit).map((s) => ({ text: s.text, blob_id: s.blob, distance: 0.1 })) };
    },
    async health() { return true; },
  };
}

export function call(handler, { method = 'POST', body = {}, query = {} } = {}) {
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    handler({ method, body, query, headers: {}, socket: {} }, res);
  });
}

export const setEnv = () => {
  Object.assign(process.env, { TATUM_API_KEY: 'test-tatum', OPENROUTER_API_KEY: 'test-or', MEMWAL_PRIVATE_KEY: 'test-mw', MEMWAL_ACCOUNT_ID: 'test-acct', OPENROUTER_MODEL: 'test/model' });
  delete process.env.ARC_ACCESS_TOKEN;
};
