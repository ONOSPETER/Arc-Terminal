import { useState } from 'react';
import { useArc, claimText } from '../lib/store.jsx';
import { Panel, Badge, Empty, WriteBadge, Sample, fmt, short } from '../components/ui.jsx';
import { METRICS } from '../../shared/chains.js';

export default function Forecasts() {
  const { s, items } = useArc();
  const [sel, setSel] = useState(null);
  const demo = s.settings.demo;
  const list = items.filter((i) => !i.sample === !demo);
  const f = list.find((i) => i.id === sel) || list[0];
  const w = f && Object.values(s.writes).find((x) => x.refId === f.id && x.kind === 'FORECAST');
  const rw = f && Object.values(s.writes).find((x) => x.refId === f.id && x.kind === 'RESOLUTION');
  if (!list.length) return <Panel title="Forecasts"><Empty title="No forecasts yet">Press Run forecast in the top bar.</Empty></Panel>;
  return (
    <div className="grid-main" style={{ gridTemplateColumns: 'minmax(0,1fr) 430px' }}>
      <Panel title="All forecasts" flush>
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Claim</th><th>p (final)</th><th>Created</th><th>Result</th></tr></thead><tbody>
          {list.map((i) => (
            <tr key={i.id} className={`click ${f?.id === i.id ? 'sel' : ''}`} onClick={() => setSel(i.id)}>
              <td>{claimText(i)} <span className="muted">· {i.chain}</span> {i.sample ? <Sample /> : null}</td>
              <td className="mono">{fmt(i.p, 2)}</td>
              <td className="muted mono" style={{ fontSize: 12 }}>{new Date(i.createdAtTs * 1000).toLocaleString()}</td>
              <td>{i.res ? <Badge kind={i.res.o === 1 ? 'ok' : 'bad'}>{i.res.o === 1 ? 'true' : 'false'} · Brier {fmt(i.res.brier, 2)}</Badge> : <Badge kind="blue">due {new Date(i.deadline * 1000).toLocaleTimeString()}</Badge>}</td>
            </tr>))}
        </tbody></table></div>
      </Panel>

      {f ? (
        <Panel title="Forecast detail">
          <dl className="kv">
            <dt>Claim</dt><dd><b>{claimText(f)}</b> {f.sample ? <Sample /> : null}</dd>
            <dt>Probability</dt><dd className="mono">{fmt(f.pRaw, 2)} raw → {fmt(f.p, 2)} final {f.calibration?.basedOn ? <Badge kind="arc">calibrated on {f.calibration.basedOn} past ({f.calibration.scope === 'pooled' ? 'all metrics' : 'this metric'})</Badge> : <Badge>no calibration yet</Badge>}</dd>
            {f.calibration?.basedOn ? <><dt>Adjustment</dt><dd className="mono">shift {fmt(f.calibration.shift, 3)}, shrink ×{f.calibration.shrink}</dd></> : null}
            <dt>Deadline</dt><dd className="mono">{new Date(f.deadline * 1000).toLocaleString()}</dd>
            <dt><span className="tag-obs">observed</span></dt>
            <dd>{f.evidence?.observed ? <span className="mono" style={{ fontSize: 12 }}>{Object.entries(f.evidence.observed).map(([k, v]) => `${k}=${v}`).join('  ')}</span> : 'n/a'}<div className="dim" style={{ fontSize: 12 }}>{f.evidence?.source}{f.evidence?.latestBlock ? ` · block ${f.evidence.latestBlock}` : ''}</div></dd>
            <dt><span className="tag-ai">AI interpretation</span></dt><dd>{f.rationale || 'n/a'}{f.cites?.length ? <div className="dim" style={{ fontSize: 12 }}>cites: {f.cites.join(', ')}</div> : null}</dd>
            {f.appliedLesson ? <><dt>Lesson applied</dt><dd>{f.appliedLesson}</dd></> : null}
            <dt>Invalidation</dt><dd>{f.invalidation?.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{f.invalidation.map((x) => <li key={x}>{x}</li>)}</ul> : 'n/a'}<div className="dim" style={{ fontSize: 12 }}>Written by the model; shown for context, not auto-evaluated.</div></dd>
            <dt>Memory used</dt><dd>{f.memoryUsed ? <Badge kind="arc">lessons recalled</Badge> : <Badge>none (first run or none found)</Badge>}</dd>
            <dt>Walrus</dt><dd>{f.sample ? <Badge>demo, not written</Badge> : <><WriteBadge w={w} /> {w?.blobId ? <span className="mono dim" style={{ fontSize: 12 }}>{short(w.blobId, 10)}</span> : null}</>}</dd>
          </dl>
          {f.res ? (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <dl className="kv">
                <dt>Observed value</dt><dd className="mono">{f.res.observed} {METRICS[f.metric]?.unit} {f.res.endBlock ? `(block ${f.res.endBlock})` : ''}</dd>
                <dt>Outcome</dt><dd>{f.res.o === 1 ? 'Claim came true' : 'Claim did not come true'} · Brier <b className="mono">{fmt(f.res.brier)}</b></dd>
                <dt>Mistake record</dt><dd>{f.res.mistake}</dd>
                <dt>Resolution memory</dt><dd>{f.sample ? <Badge>demo</Badge> : <WriteBadge w={rw} />}</dd>
              </dl>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
