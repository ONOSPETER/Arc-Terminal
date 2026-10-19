// Dependency-free SVG charts.
export function StackedBars({ rows, keys }) {
  const max = Math.max(1, ...rows.map((r) => keys.reduce((a, k) => a + (r[k.key] || 0), 0)));
  return (
    <div className="col" style={{ gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', gap: 10, alignItems: 'center' }}>
          <span className="mono muted" style={{ fontSize: 12 }}>{r.label}</span>
          <div style={{ display: 'flex', height: 16, background: 'var(--panel2)', borderRadius: 3, overflow: 'hidden' }}>
            {keys.map((k) => (r[k.key] ? <div key={k.key} title={`${k.label}: ${r[k.key]}`} style={{ width: `${(r[k.key] / max) * 100}%`, background: k.color }} /> : null))}
          </div>
          <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{keys.reduce((a, k) => a + (r[k.key] || 0), 0)}</span>
        </div>
      ))}
      <div className="legend">{keys.map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label}</span>)}</div>
    </div>
  );
}

export function LineChart({ series, height = 180, yMin = 0, yMax = 1, refLine, yLabel }) {
  const W = 600, H = height, P = { l: 34, r: 10, t: 10, b: 20 };
  const n = Math.max(2, ...series.map((s) => s.points.length));
  const x = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={yLabel || 'chart'} style={{ display: 'block' }}>
      {ticks.map((t) => (<g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--dim)" fontFamily="var(--mono)">{t.toFixed(2)}</text></g>))}
      {refLine !== undefined ? <g><line x1={P.l} x2={W - P.r} y1={y(refLine)} y2={y(refLine)} stroke="var(--warn)" strokeDasharray="4 4" /><text x={W - P.r} y={y(refLine) - 4} textAnchor="end" fontSize="10" fill="var(--warn)" fontFamily="var(--mono)">coin flip 0.25</text></g> : null}
      {series.map((s) => (
        <g key={s.name}>
          <polyline fill="none" stroke={s.color} strokeWidth="2" points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          {s.points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.dotColors?.[i] || s.color} />)}
        </g>
      ))}
    </svg>
  );
}

export function Donut({ parts, size = 120, center }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const R = 44, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="breakdown">
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--panel2)" strokeWidth="14" />
      {parts.map((p) => { const len = (p.value / total) * C; const el = <circle key={p.label} cx="60" cy="60" r={R} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += len; return el; })}
      <text x="60" y="58" textAnchor="middle" fontSize="20" fill="var(--text)" fontFamily="var(--mono)">{center}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">memories</text>
    </svg>
  );
}

export function Spark({ values, color = 'var(--arc)' }) {
  const v = values.filter((x) => x !== null && x !== undefined);
  if (v.length < 2) return <span className="dim">n/a</span>;
  const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = v.map((d, i) => `${(i / (v.length - 1)) * 80},${22 - ((d - min) / r) * 20}`).join(' ');
  return <svg viewBox="0 0 80 24" width="80" height="24" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" /></svg>;
}
