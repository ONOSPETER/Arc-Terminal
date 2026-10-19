import { CHAINS } from '../shared/chains.js';
import { handler } from './_lib/http.js';
import { makeRpc, rpcUrl } from './_lib/tatum.js';
import { memoryConfigured, memoryHealth, namespace } from './_lib/memory.js';
import { modelFor } from './_lib/llm.js';

export default handler({ methods: ['GET'], auth: false }, async ({ query }) => {
  const probe = query.probe === '1';
  const tatumConfigured = Boolean(process.env.TATUM_API_KEY);
  const out = {
    authRequired: Boolean(process.env.ARC_ACCESS_TOKEN),
    tatum: { configured: tatumConfigured, chains: {} },
    openrouter: { configured: Boolean(process.env.OPENROUTER_API_KEY), model: modelFor() },
    walrus: { configured: memoryConfigured(), namespace: namespace(), network: 'Sui Mainnet (via Walrus Memory relayer)', relayerOk: null },
  };
  await Promise.all(Object.keys(CHAINS).map(async (c) => {
    const entry = { label: CHAINS[c].label, gateway: rpcUrl(c), ok: null };
    if (probe && tatumConfigured) {
      try { entry.latestBlock = (await makeRpc(c).latest()).number; entry.ok = true; } catch (e) { entry.ok = false; entry.error = String(e.message).slice(0, 120); }
    }
    out.tatum.chains[c] = entry;
  }));
  if (probe && memoryConfigured()) {
    try { await memoryHealth(); out.walrus.relayerOk = true; } catch (e) { out.walrus.relayerOk = false; out.walrus.error = String(e.message).slice(0, 140); }
  }
  return out;
});
