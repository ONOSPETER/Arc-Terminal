// Chain + metric registry. Gateway slugs follow Tatum's `<slug>.gateway.tatum.io` pattern; they can be
// overridden with TATUM_SLUG_<CHAIN>. /api/health probes each one, so a wrong slug shows up as "unreachable".
export const CHAINS = {
  ethereum: { label: 'Ethereum', slug: 'ethereum-mainnet', blockTimeSec: 12, usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  base: { label: 'Base', slug: 'base-mainnet', blockTimeSec: 2, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  polygon: { label: 'Polygon', slug: 'polygon-mainnet', blockTimeSec: 2, usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  arbitrum: { label: 'Arbitrum One', slug: 'arbitrum-one-mainnet', blockTimeSec: 0.25, usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
};

export const METRICS = {
  base_fee_gwei: { label: 'Base fee', unit: 'gwei', digits: 3, desc: 'Average base fee per gas over sampled blocks in the 30 min window ending at the reference time' },
  gas_utilization: { label: 'Gas utilization', unit: '%', digits: 1, desc: 'Average gasUsed / gasLimit (percent) over the same sampled blocks' },
  tx_per_block: { label: 'Txs per block', unit: 'tx', digits: 1, desc: 'Average transaction count per block over the same sampled blocks' },
  usdc_transfers: { label: 'USDC transfers', unit: 'logs / 20 blocks', digits: 0, desc: 'Count of USDC Transfer events in the 20 blocks ending at the reference time' },
};

export const HORIZONS_MIN = [15, 30, 60, 180];
export const WINDOW_SEC = 1800;
export const SAMPLES = 4;
export const USDC_BLOCK_SPAN = 20;
