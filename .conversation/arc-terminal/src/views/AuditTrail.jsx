import { useArc } from '../lib/store.jsx';
import { Panel, Empty } from '../components/ui.jsx';

export default function AuditTrail() {
  const { s } = useArc();
  const rows = [...s.log].reverse();
  return (
    <Panel title="Audit trail" flush>
      {rows.length ? <div className="logbox panel-b">{rows.map((l, i) => <div key={i} className={l.level === 'error' ? 'e' : ''}>{new Date(l.t).toLocaleTimeString()}  {l.level.toUpperCase()}  {l.msg}</div>)}</div> : <Empty title="No activity yet">Actions and errors are logged here.</Empty>}
    </Panel>
  );
}
