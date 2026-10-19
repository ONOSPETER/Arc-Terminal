import { useArc, claimText } from '../lib/store.jsx';
import { Panel, Stat, Badge, Empty, WriteBadge, Sample, fmt, short } from '../components/ui.jsx';
import { StackedBars, LineChart, Donut } from '../components/charts.jsx';
import { METRICS } from '../../shared/chains.js';

const correct = (i) => (i.p >= 0.5) === (i.res.o === 1);

export default function Overview({ go }) {
  const { s, items, liveBrier, beforeAfter, runForecast, busy } = useArc();
  const demo = s.settings.demo;
  const scoped = items.filter((i) => !i.sample === !demo);
  const resolved = scoped.filter((i) => i.res);
  const writes = Object.values(s.writes).filter((w) => !demo || w.status === 'demo');
  const stored = writes.filter((w) => w.status === 'done').length;
  const rows = Object.keys(METRICS).map((m) => {
    const mine = scoped.filter((i) => i.metric === m);
    return { label: METRICS[m].label, open: mine.filter((i) => !i.res).length, right: mine.filter((i) => i.res && correct(i)).length, wrong: mine.filter((i) => i.res && !correct(i)).length };
  }).filter((r) => r.open + r.right + r.wrong > 0);
  const chrono = [...resolved].reverse();
  const lessons = s.lessons.filter((l) => !l.sample === !demo).slice(0, 4);
  const donut = [
    { label: 'stored', value: stored, color: 'var(--ok)' },
    { label: 'pending', value: writes.filter((w) => w.status === 'pending').length, color: 'var(--warn)' },
    { label: 'failed', value: writes.filter((w) => ['failed', 'write_failed'].includes(w.status)).length, color: 'var(--bad)' },
  ];
  const delta = liveBrier === null ? null : liveBrier < 0.25 ? { dir: 'up', text: 'beats coin flip' } : { dir: 'down', text: 'not beating coin flip' };

  return (
    <>
      <div className="grid-4">
        <Stat icon="target" value={scoped.filter((i) => !i.res).length} label="Open forecasts" />
        <Stat icon="check" value={resolved.length} label="Resolved forecasts" />
        <Stat icon="chart" value={fmt(liveBrier)} label="Mean Brier score (lower is better)" delta={delta} />
        <Stat icon="db" value={demo ? 'n/a' : `${stored}/${writes.length}`} label="Walrus memories stored" />
      </div>

      {!scoped.length ? (
        <Panel title="Start the learning loop">
          <ol className="steps">
            <li><div><b>Run forecast.</b> <span className="muted">ARC reads on-chain signals through Tatum, recalls lessons from Walrus Memory, asks the model for forecasts and stores them.</span></div></li>
            <li><div><b>Resolve due.</b> <span className="muted">After each horizon passes, ARC measures the real outcome from the chain at that deadline and scores it.</span></div></li>
            <li><div><b>Run forecast again.</b> <span className="muted">The recorded lesson is recalled and changes the next forecast. The Learning page shows before and after.</span></div></li>
          </ol>
          <div className="row" style={{ marginTop: 16 }}><button className="btn primary" onClick={runForecast} disabled={busy.forecast}>Run forecast</button><button className="btn" onClick={() => go('quickstart')}>Setup guide</button></div>
        </Panel>
      ) : null}

      <div className="grid-main">
        <div className="col">
          <Panel title="Forecast activity by metric">{rows.length ? <StackedBars rows={rows} keys={[{ key: 'open', label: 'Open', color: 'var(--blue)' }, { key: 'right', label: 'Right side', color: 'var(--teal)' }, { key: 'wrong', label: 'Wrong side', color: 'var(--arc)' }]} /> : <Empty title="No activity yet">Forecasts will appear here once created.</Empty>}</Panel>
          <Panel title="Learning curve" right={<span className="muted" style={{ fontSize: 12 }}>Brier per resolved forecast. Orange dots used memory.</span>}>
            {chrono.length >= 2 ? (
              <>
                <LineChart refLine={0.25} yLabel="Brier score over time" series={[{ name: 'Brier', color: 'var(--muted)', points: chrono.map((i) => i.res.brier), dotColors: chrono.map((i) => (i.memoryUsed ? 'var(--arc)' : 'var(--blue)')) }]} />
                <div className="row wrap" style={{ marginTop: 10 }}>
                  <Badge kind="blue">before memory: n={beforeAfter.before.n}, Brier {fmt(beforeAfter.before.brier)}</Badge>
                  <Badge kind="arc">with memory: n={beforeAfter.after.n}, Brier {fmt(beforeAfter.after.brier)}</Badge>
                </div>
              </>
            ) : <Empty title="Need at least two resolved forecasts">Resolve forecasts to see calibration change over time.</Empty>}
          </Panel>
          <Panel title="Latest forecasts" flush right={<button className="btn sm" onClick={() => go('forecasts')}>View all</button>}>
            <div className="scroll-x"><table className="tbl"><thead><tr><th>Claim</th><th>Chain</th><th>p</th><th>Status</th><th>Walrus</th></tr></thead><tbody>
              {scoped.slice(0, 6).map((i) => {
                const w = Object.values(s.writes).find((x) => x.refId === i.id && x.kind === 'FORECAST');
                return (<tr key={i.id} className="click" onClick={() => go('forecasts')}>
                  <td>{claimText(i)} {i.sample ? <Sample /> : null}</td><td className="mono">{i.chain}</td><td className="mono">{fmt(i.p, 2)}</td>
                  <td>{i.res ? <Badge kind={correct(i) ? 'ok' : 'bad'}>{correct(i) ? 'right' : 'wrong'} · {fmt(i.res.brier, 2)}</Badge> : <Badge kind="blue">open</Badge>}</td>
                  <td>{i.sample ? <Badge>demo</Badge> : <WriteBadge w={w} />}</td></tr>);
              })}
              {!scoped.length ? <tr><td colSpan={5} className="muted">No forecasts yet.</td></tr> : null}
            </tbody></table></div>
          </Panel>
        </div>

        <div className="col">
          <Panel title="Lessons learned" right={<button className="btn sm" onClick={() => go('learning')}>Learning</button>}>
            {lessons.length ? <div className="col">{lessons.map((l) => (<div key={l.id} className="lesson-card"><div className="mono muted" style={{ fontSize: 11 }}>{l.chain} · {METRICS[l.metric]?.label || l.metric} · {l.source}</div><div>{l.lesson}</div></div>))}</div> : <Empty title="No lessons yet">Lessons are written when forecasts resolve.</Empty>}
          </Panel>
          <Panel title="Walrus memory">
            {demo ? <Empty title="Demo mode">Nothing is written to Walrus in demo mode.</Empty> : writes.length ? (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Donut parts={donut} center={writes.length} />
                <div className="col" style={{ gap: 6, fontSize: 13 }}>{donut.map((d) => <span key={d.label}><i style={{ display: 'inline-block', width: 9, height: 9, background: d.color, borderRadius: 2, marginRight: 8 }} />{d.value} {d.label}</span>)}</div>
              </div>
            ) : <Empty title="No writes yet">Run a forecast to store the first memory.</Empty>}
          </Panel>
          <Panel title="Recalled before last forecast">
            {s.recalled.length ? <div className="col" style={{ gap: 8 }}>{s.recalled.slice(0, 5).map((r) => (<div key={r.blobId} style={{ fontSize: 12 }}><Badge kind="arc">{r.type}</Badge> <span className="muted">{r.summary}</span> <div className="mono dim">{short(r.blobId, 8)}</div></div>))}</div> : <Empty title="Nothing recalled">The first run starts with an empty memory.</Empty>}
          </Panel>
        </div>
      </div>
    </>
  );
}
