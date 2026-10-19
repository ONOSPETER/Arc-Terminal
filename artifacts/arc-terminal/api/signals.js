import { handler, requireEnv } from './_lib/http.js';
import { makeRpc, collectSignals } from './_lib/tatum.js';
import { pickChain } from './_lib/engine.js';

export default handler({ methods: ['GET'] }, async ({ query }) => {
  requireEnv(['TATUM_API_KEY'], 'Tatum');
  const chain = pickChain(query.chain || 'ethereum');
  const rpc = makeRpc(chain);
  const latest = await rpc.latest();
  const signals = await collectSignals(rpc, chain, latest.timestamp);
  return { signals, fetchedAt: new Date().toISOString() };
});
