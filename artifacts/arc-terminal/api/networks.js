import { handler, HttpError } from './_lib/http.js';
import { CHAINS } from '../shared/chains.js';
import { getNetworkSnapshot } from './_lib/networks.js';

export default handler({ methods: ['GET'] }, async ({ query }) => {
  const requested = String(query.chain || 'all').toLowerCase();
  const chains = requested === 'all' ? Object.keys(CHAINS) : [requested];
  const unknown = chains.filter((chain) => !CHAINS[chain]);
  if (unknown.length) throw new HttpError(400, `Unknown chain "${unknown[0]}". Choose Sui, Ethereum, Solana or Base.`);

  const snapshots = await Promise.all(chains.map((chain) => getNetworkSnapshot(chain)));
  return {
    fetchedAt: new Date().toISOString(),
    pollingIntervalSeconds: 20,
    networks: Object.fromEntries(snapshots.map((snapshot) => [snapshot.chain, snapshot])),
  };
});
