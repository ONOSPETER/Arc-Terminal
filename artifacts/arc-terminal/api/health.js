import { CHAINS } from '../shared/chains.js';
import { handler } from './_lib/http.js';
import { memoryConfigured, namespace } from './_lib/memory.js';
import { modelFor } from './_lib/llm.js';

export default handler({ methods: ['GET'], auth: false }, async ({ query }) => {
  const tatumConfigured = Boolean(process.env.TATUM_API_KEY);
  const out = {
    authRequired: Boolean(process.env.ARC_ACCESS_TOKEN),
    tatum: { configured: tatumConfigured, chains: {} },
    openrouter: { configured: Boolean(process.env.OPENROUTER_API_KEY), model: modelFor() },
    walrus: { configured: memoryConfigured(), namespace: namespace(), network: 'Sui Mainnet (via Walrus Memory relayer)', relayerOk: null },
  };
  await Promise.all(Object.keys(CHAINS).map(async (c) => {
    const entry = { label: CHAINS[c].label, gateway: CHAINS[c].kind === 'sui' ? 'https://sui-mainnet-grpc.gateway.tatum.io' : `https://${CHAINS[c].slug}.gateway.tatum.io`, ok: null };
    out.tatum.chains[c] = entry;
  }));
  return out;
});
