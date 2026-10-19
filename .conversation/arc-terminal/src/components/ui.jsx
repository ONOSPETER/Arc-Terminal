const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 12h.01',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  db: 'M12 5m-8 0a8 3 0 1 0 16 0a8 3 0 1 0-16 0M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z',
  book: 'M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM4 16a4 4 0 0 1 4-4h12',
  play: 'M6 4l14 8-14 8z',
  check: 'M4 12l5 5L20 6',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  brain: 'M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3v1a3 3 0 0 0 3 3 3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3 3 3 0 0 1-2 3v1a3 3 0 0 1-3 3 3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z',
  replay: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
};
export const Icon = ({ name }) => (<svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name] || ICONS.grid} /></svg>);

export const Panel = ({ title, right, children, flush }) => (
  <section className="panel">
    <div className="panel-h"><h2>{title}</h2>{right}</div>
    <div className={`panel-b${flush ? ' flush' : ''}`}>{children}</div>
  </section>
);

export const Stat = ({ icon, value, label, delta }) => (
  <div className="stat">
    <div className="chip"><Icon name={icon} /></div>
    <div><div className="v">{value}</div><div className="l">{label}</div></div>
    {delta ? <span className={`delta ${delta.dir}`}>{delta.text}</span> : null}
  </div>
);

export const Badge = ({ kind = '', children, title }) => <span className={`badge ${kind}`} title={title}>{children}</span>;
export const Spinner = () => <span className="spinner" role="status" aria-label="Loading" />;
export const Empty = ({ title, children }) => (<div className="empty"><b>{title}</b>{children}</div>);
export const Sample = () => <Badge kind="warn" title="Synthetic demo data, not from a chain or model">SAMPLE</Badge>;

export const fmt = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : Number(x).toFixed(d));
export const short = (s, n = 10) => (s && s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s || '');
export const ago = (ms) => { const d = Math.max(0, Date.now() - ms) / 1000; return d < 60 ? `${Math.floor(d)}s ago` : d < 3600 ? `${Math.floor(d / 60)}m ago` : d < 86400 ? `${Math.floor(d / 3600)}h ago` : `${Math.floor(d / 86400)}d ago`; };

export function WriteBadge({ w }) {
  if (!w) return <Badge title="No Walrus write recorded for this item">not written</Badge>;
  const map = { done: ['ok', 'stored'], pending: ['warn', 'pending'], failed: ['bad', 'failed'], write_failed: ['bad', 'write failed'], unavailable: ['', 'unavailable'] };
  const [k, t] = map[w.status] || ['', w.status];
  return <Badge kind={k} title={w.error || w.blobId || ''}>{t}</Badge>;
}
