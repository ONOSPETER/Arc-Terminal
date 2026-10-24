import { useEffect } from 'react';
import { useArc } from '../lib/store.jsx';
import { Panel, Empty, Spinner, Sample, fmt, ago } from '../components/ui.jsx';
import { Spark } from '../components/charts.jsx';
import { CHAINS, METRICS } from '../../shared/chains.js';

export default function Signals() {
  const { s, fetchSignals, fetchNetworks, busy } = useArc();
  const chain = s.settings.chain;
  const entry = s.signals[chain];
  const d = entry?.data;
  const network = s.networks?.[chain];
  useEffect(() => {
    if (CHAINS[chain].kind === 'evm' && !entry) fetchSignals(chain);
    if (CHAINS[chain].kind !== 'evm' && !network) fetchNetworks(chain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  if (CHAINS[chain].kind !== 'evm') {
    const facts = chain === 'sui'
      ? [
        ['Latest checkpoint', network?.height],
        ['Network epoch', network?.epoch],
        ['Transactions per second', network?.transactionsPerSecond],
        ['Reference gas price (MIST)', network?.referenceGasPriceMist],
        ['Total network transactions', network?.totalNetworkTransactions],
      ]
      : [
        ['Confirmed slot', network?.height],
        ['Transactions per second', network?.transactionsPerSecond],
        ['Performance sample (seconds)', network?.samplePeriodSeconds],
      ];
    return (
      <Panel
        title={`${CHAINS[chain].label} network data`}
        flush
        right={<div className="row">{network?.ok ? <span className="muted" style={{ fontSize: 12 }}>{ago(Date.parse(network.observedAt))}</span> : null}<button className="btn sm" onClick={() => fetchNetworks(chain)} disabled={busy.networks}>{busy.networks ? <Spinner /> : null} Refresh</button></div>}
      >
        {!network?.ok ? <Empty title={network ? 'No live data' : 'Loading network data'}>{network?.error || 'Reading from Tatum…'}</Empty> : (
          <>
            <div className="scroll-x"><table className="tbl"><thead><tr><th>Network metric</th><th>Current value</th></tr></thead><tbody>
              {facts.map(([label, value]) => <tr key={label}><td>{label}</td><td className="mono"><b>{value === null || value === undefined ? 'n/a' : Number.isFinite(Number(value)) ? Number(value).toLocaleString() : value}</b></td></tr>)}
            </tbody></table></div>
            <div style={{ padding: 16, borderTop: '1px solid var(--line)' }} className="muted">
              Source: {network.gateway}. Readings refresh automatically every 20 seconds.
            </div>
          </>
        )}
      </Panel>
    );
  }

  return (
    <Panel title={`On-chain signals · ${chain}`} flush right={<div className="row">{d?.sample ? <Sample /> : null}{entry ? <span className="muted" style={{ fontSize: 12 }}>{ago(entry.at)}</span> : null}<button className="btn sm" onClick={() => fetchSignals(chain)} disabled={busy.signals}>{busy.signals ? <Spinner /> : null} Refresh</button></div>}>
      {!d ? <Empty title={busy.signals ? 'Loading signals' : 'No signals loaded'}>Signals come from Tatum JSON-RPC and are observed facts.</Empty> : (
        <>
          <div className="scroll-x"><table className="tbl"><thead><tr><th>Metric</th><th>Now</th><th>30m ago</th><th>60m ago</th><th>90m ago</th><th>Change 30m</th><th>Trend</th></tr></thead><tbody>
            {Object.keys(METRICS).map((m) => {
              const c = d.compact[m];
              if (!c) return <tr key={m}><td>{METRICS[m].label}</td><td colSpan={6} className="muted">Unavailable: {d.unavailable?.[m] || 'no data'}</td></tr>;
              return (<tr key={m}><td>{METRICS[m].label} <span className="dim">({METRICS[m].unit})</span></td><td className="mono"><b>{c.now}</b></td><td className="mono">{c.prev_30m ?? 'n/a'}</td><td className="mono">{c.prev_60m ?? 'n/a'}</td><td className="mono">{c.prev_90m ?? 'n/a'}</td>
                <td className="mono" style={{ color: c.change_pct_30m > 0 ? 'var(--ok)' : c.change_pct_30m < 0 ? 'var(--bad)' : undefined }}>{c.change_pct_30m === null ? 'n/a' : `${c.change_pct_30m > 0 ? '+' : ''}${c.change_pct_30m}%`}</td>
                <td><Spark values={d.series[m].map((p) => p.value)} /></td></tr>);
            })}
          </tbody></table></div>
          <div style={{ padding: 16, borderTop: '1px solid var(--line)' }} className="muted">
            <span className="tag-obs">observed</span> {d.provenance?.source}{d.latestBlock ? ` · latest block ${d.latestBlock}` : ''}{d.provenance?.rpcCalls ? ` · ${d.provenance.rpcCalls} RPC calls` : ''}.
            {' '}Each value averages {d.provenance?.samplesPerWindow ?? 4} sampled blocks in the 30 minute window ending at that time. USDC transfers count Transfer events in 20 blocks.
          </div>
        </>
      )}
    </Panel>
  );
}
