// Chain registry. Sui uses Tatum gRPC; the other networks use Tatum JSON-RPC.
export const CHAINS = {
  sui: { label: 'Sui', slug: 'sui-mainnet-grpc', kind: 'sui', explorer: 'https://suiscan.xyz/mainnet' },
  ethereum: { label: 'Ethereum', slug: 'ethereum-mainnet', kind: 'evm', blockTimeSec: 12, usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  solana: { label: 'Solana', slug: 'solana-mainnet', kind: 'solana', explorer: 'https://explorer.solana.com' },
  base: { label: 'Base', slug: 'base-mainnet', kind: 'evm', blockTimeSec: 2, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
};

export const FORECAST_CHAINS = ['ethereum', 'base'];

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
