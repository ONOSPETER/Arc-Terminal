import { useEffect } from 'react';
import { useArc } from '../lib/store.jsx';
import { Badge, Empty, Panel, Spinner } from '../components/ui.jsx';
import { CHAINS } from '../../shared/chains.js';

const number = (value, digits = 0) => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
);

const time = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : '—';

function NetworkCard({ network }) {
  const chain = CHAINS[network.chain];
  const details = network.chain === 'solana'
    ? [
      [network.heightLabel || 'Confirmed slot', number(network.height)],
      ['Transactions / second', network.transactionsPerSecond === null ? '—' : `${number(network.transactionsPerSecond, 2)}/s`],
      ['Sample window', network.samplePeriodSeconds ? `${network.samplePeriodSeconds}s` : '—'],
    ]
    : [
      [network.heightLabel || 'Latest block', number(network.height)],
      ['Transactions / block', number(network.transactionsPerBlock)],
      ['Base fee', network.baseFeeGwei === null ? '—' : `${number(network.baseFeeGwei, 3)} gwei`],
    ];

  return (
    <article className={`network-card${network.chain === 'sui' ? ' featured' : ''}`}>
      <div className="row between">
        <div>
          <div className="network-name">{chain.label}</div>
          <div className="mono dim network-kind">{network.chain === 'sui' ? 'TATUM SUI GRPC' : 'TATUM JSON-RPC'}</div>
        </div>
        <Badge kind={network.ok ? 'ok' : 'bad'}>{network.ok ? 'Connected' : 'Offline'}</Badge>
      </div>
      {network.ok ? (
        <div className="network-facts">
          {details.map(([label, value]) => (
            <div className="network-fact" key={label}>
              <span className="muted">{label}</span><b className="mono">{value}</b>
            </div>
          ))}
          <div className="network-fact">
            <span className="muted">Updated</span><span className="mono">{time(network.observedAt)}</span>
          </div>
        </div>
      ) : (
        <p className="network-error">{network.error || 'Waiting for a successful RPC check.'}</p>
      )}
      <a className="network-link" href={network.gateway} target="_blank" rel="noreferrer">
        Open RPC endpoint <span aria-hidden="true">↗</span>
      </a>
    </article>
  );
}

function SuiDetails({ network }) {
  if (!network?.ok) {
    return (
      <Empty title={network ? 'Sui is not connected' : 'Waiting for the first RPC check'}>
        {network?.error || 'The dashboard checks the Sui mainnet endpoint automatically.'}
      </Empty>
    );
  }

  const facts = [
    ['Latest checkpoint', number(network.height)],
    ['Network epoch', number(network.epoch)],
    ['Transactions / second', network.transactionsPerSecond === null ? '—' : number(network.transactionsPerSecond, 2)],
    ['Reference gas price', network.referenceGasPriceMist ? `${number(network.referenceGasPriceMist)} MIST` : '—'],
    ['Total network transactions', number(network.totalNetworkTransactions)],
  ];

  return (
    <>
      <div className="sui-facts">
        {facts.map(([label, value]) => (
          <div className="sui-fact" key={label}>
            <span className="muted">{label}</span><b className="mono">{value}</b>
          </div>
        ))}
      </div>
      <div className="row between wrap network-meta">
        <a className="network-link" href={network.gateway} target="_blank" rel="noreferrer">
          https://sui-mainnet-grpc.gateway.tatum.io <span aria-hidden="true">↗</span>
        </a>
        <span className="muted">Last checkpoint {time(network.observedAt)}</span>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { s, fetchNetworks, busy } = useArc();
  const networks = s.networks || {};
  const networkPollAt = s.networkPollAt;
  const sui = networks.sui;
  const others = ['ethereum', 'solana', 'base'].map((chain) => networks[chain]).filter(Boolean);

  useEffect(() => {
    if (!Object.keys(networks).length && !s.settings.demo) fetchNetworks('all');
    // The provider owns the 20-second polling loop; this only fills an empty cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="network-dashboard">
      <div className="row between wrap dashboard-intro">
        <p className="muted">Live status from Tatum. Sui is the primary network; Ethereum, Solana, and Base are also available.</p>
        <div className="row wrap">
          <span className="muted dashboard-poll">
            {s.settings.demo ? 'Live polling paused in demo mode' : `Auto-refresh every 20 seconds${networkPollAt ? ` · updated ${time(networkPollAt)}` : ''}`}
          </span>
          <button className="btn sm" onClick={() => fetchNetworks('all')} disabled={busy.networks}>
            {busy.networks ? <Spinner /> : null} Refresh now
          </button>
        </div>
      </div>

      {s.settings.demo ? (
        <div className="banner warn"><b>Demo mode is on.</b> Switch it off in Settings to query Tatum live.</div>
      ) : null}

      <Panel
        title="Sui mainnet"
        right={<Badge kind={sui?.ok ? 'ok' : 'warn'}>{sui?.ok ? 'LIVE' : 'Connecting'}</Badge>}
      >
        <div className="sui-heading">
          <div>
            <div className="sui-title">Tatum Sui gRPC</div>
            <p className="muted">Checkpoint, network activity, and reference gas price from the Sui mainnet.</p>
          </div>
          <a className="btn sm" href="https://docs.tatum.io/reference/sui-grpc" target="_blank" rel="noreferrer">Tatum gRPC docs ↗</a>
        </div>
        <SuiDetails network={sui} />
      </Panel>

      <Panel title="Other supported networks">
        <div className="network-grid">
          {others.length ? others.map((network) => <NetworkCard key={network.chain} network={network} />) : (
            <Empty title="Checking Ethereum, Solana, and Base">Network readings update automatically every 20 seconds.</Empty>
          )}
        </div>
      </Panel>
    </div>
  );
}
