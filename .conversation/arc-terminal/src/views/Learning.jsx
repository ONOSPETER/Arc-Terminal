import { useState } from 'react';
import { useArc } from '../lib/store.jsx';
import { Panel, Stat, Badge, Empty, Spinner, Sample, fmt } from '../components/ui.jsx';
import { LineChart } from '../components/charts.jsx';
import { CHAINS } from '../../shared/chains.js';
import { meanBrier } from '../../shared/scoring.js';

const flat = (steps, key) => steps.flatMap((st) => st[key].filter((f) => f.resolution?.status === 'resolved').map((f) => ({ p: f.p, o: f.resolution.o })));
const cum = (steps, key) => { const acc = []; const out = []; steps.forEach((st) => { acc.push(...st[key].filter((f) => f.resolution?.status === 'resolved').map((f) => ({ p: f.p, o: f.resolution.o }))); out.push(meanBrier(acc)); }); return out; };

export default function Learning() {
  const { s, beforeAfter, runReplay, busy, progress } = useArc();
  const demo = s.settings.demo;
  const [steps, setSteps] = useState(6);
  const [count, setCount] = useState(2);
  const [spacing, setSpacing] = useState(3);
  const r = s.replay && !!s.replay.sample === demo ? s.replay : null;
  const bB = r ? meanBrier(flat(r.steps, 'baseline')) : null;
  const mB = r ? meanBrier(flat(r.steps, 'memory')) : null;
  const better = bB !== null && mB !== null && mB < bB;
  const exportJson = () => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `arc-replay-${Date.now()}.json`; a.click(); };
  return (
    <>
      <div className="grid-4">
        <Stat icon="clock" value={beforeAfter.before.n ? fmt(beforeAfter.before.brier) : 'n/a'} label={`Live Brier before memory (n=${beforeAfter.before.n})`} />
        <Stat icon="brain" value={beforeAfter.after.n ? fmt(beforeAfter.after.brier) : 'n/a'} label={`Live Brier with memory (n=${beforeAfter.after.n})`} />
        <Stat icon="replay" value={bB === null ? 'n/a' : fmt(bB)} label="Replay baseline policy Brier" />
        <Stat icon="shield" value={mB === null ? 'n/a' : fmt(mB)} label="Replay memory policy Brier" delta={bB === null ? null : better ? { dir: 'up', text: `${fmt(bB - mB)} better` } : { dir: 'down', text: 'no gain' }} />
      </div>
      <Panel title="Replay and backtest" right={r?.sample ? <Sample /> : null}>
        <p className="muted" style={{ marginTop: 0 }}>
          Walk-forward test on past blocks. At each step both policies see only data up to that moment. The baseline never uses memory. The memory policy only uses lessons from outcomes that were already known at that moment, and the server rejects anything newer. Outcomes are measured afterwards at each forecast’s own deadline.
        </p>
        <div className="row wrap">
          <label className="muted">Steps <select className="select" value={steps} onChange={(e) => setSteps(+e.target.value)}>{[3, 4, 6, 8, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="muted">Forecasts per step <select className="select" value={count} onChange={(e) => setCount(+e.target.value)}>{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="muted">Spacing <select className="select" value={spacing} onChange={(e) => setSpacing(+e.target.value)}>{[3, 4, 6].map((n) => <option key={n} value={n}>{n} h</option>)}</select></label>
          <button className="btn primary" disabled={busy.replay} onClick={() => runReplay({ chain: s.settings.chain, steps, count, spacingH: spacing })}>{busy.replay ? <Spinner /> : null} Run replay on {CHAINS[s.settings.chain].label}</button>
          {progress ? <span className="muted mono">step {progress.i + 1} / {progress.steps}</span> : null}
          {r ? <button className="btn" onClick={exportJson}>Export JSON</button> : null}
        </div>
        {!demo ? <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>Each step makes two model calls and roughly 60 RPC calls. The model is not deterministic, so exact numbers vary between runs; the exported JSON records what happened.</p> : null}
      </Panel>
      {r ? (
        <div className="grid-main" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          <Panel title="Cumulative Brier score by step">
            <LineChart refLine={0.25} yLabel="Cumulative Brier by policy" series={[{ name: 'Baseline', color: 'var(--blue)', points: cum(r.steps, 'baseline') }, { name: 'Memory', color: 'var(--arc)', points: cum(r.steps, 'memory') }]} />
            <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: 'var(--blue)' }} />Baseline (no memory)</span><span><i style={{ background: 'var(--arc)' }} />Memory-enhanced</span></div>
          </Panel>
          <Panel title="Steps" flush>
            <div className="scroll-x"><table className="tbl"><thead><tr><th>Step</th><th>Baseline</th><th>Memory</th><th>Lessons</th></tr></thead><tbody>
              {r.steps.map((st, i) => (<tr key={i}><td className="mono">{i + 1}{!r.sample ? <div className="dim" style={{ fontSize: 11 }}>{new Date(st.asOf * 1000).toLocaleString()}</div> : null}</td>
                <td className="mono">{fmt(meanBrier(flat([st], 'baseline')), 2)}</td><td className="mono">{fmt(meanBrier(flat([st], 'memory')), 2)}</td><td><Badge kind={st.lessonsUsed?.length ? 'arc' : ''}>{st.lessonsUsed?.length || 0}</Badge></td></tr>))}
            </tbody></table></div>
          </Panel>
        </div>
      ) : <Panel title="Results"><Empty title="No replay yet">Run a replay to compare the original policy with the memory-enhanced policy.</Empty></Panel>}
    </>
  );
}
