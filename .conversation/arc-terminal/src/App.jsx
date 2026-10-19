import { useEffect, useState } from 'react';
import { ArcProvider, useArc } from './lib/store.jsx';
import { setToken } from './lib/api.js';
import { Logo } from './components/Logo.jsx';
import { Icon, Spinner } from './components/ui.jsx';
import { CHAINS } from '../shared/chains.js';
import Overview from './views/Overview.jsx';
import Forecasts from './views/Forecasts.jsx';
import Signals from './views/Signals.jsx';
import MemoryExplorer from './views/MemoryExplorer.jsx';
import Learning from './views/Learning.jsx';
import AuditTrail from './views/AuditTrail.jsx';
import Settings from './views/Settings.jsx';
import QuickStart from './views/QuickStart.jsx';

const ROUTES = [
  { group: 'Monitoring', items: [['overview', 'Overview', 'grid', Overview], ['forecasts', 'Forecasts', 'target', Forecasts], ['signals', 'Signals', 'pulse', Signals], ['memory', 'Memory explorer', 'db', MemoryExplorer]] },
  { group: 'Evaluation', items: [['learning', 'Learning and replay', 'chart', Learning], ['audit', 'Audit trail', 'book', AuditTrail]] },
  { group: 'Management', items: [['settings', 'Settings', 'gear', Settings], ['quickstart', 'Quick start', 'play', QuickStart]] },
];
const FLAT = ROUTES.flatMap((g) => g.items);
const current = () => (window.location.hash.replace('#/', '') || 'overview');

function Shell() {
  const a = useArc();
  const { s, busy, due, toasts, needToken, setNeedToken, setSetting, runForecast, resolveDue } = a;
  const [route, setRoute] = useState(current());
  const [pass, setPass] = useState('');
  useEffect(() => { const f = () => setRoute(current()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (r) => { window.location.hash = `#/${r}`; };
  const entry = FLAT.find((x) => x[0] === route) || FLAT[0];
  const View = entry[3];
  const demo = s.settings.demo;

  return (
    <div className="app">
      <aside className="side">
        <Logo />
        {ROUTES.map((g) => (
          <nav className="nav-group" key={g.group} aria-label={g.group}>
            <div className="nav-title">{g.group}</div>
            {g.items.map(([id, label, icon]) => (<button key={id} className={`nav-item ${entry[0] === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={entry[0] === id ? 'page' : undefined}><Icon name={icon} />{label}</button>))}
          </nav>
        ))}
        <div className="side-foot">Research only. ARC never trades or moves funds.</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{entry[1]}</h1>
          <span className={`pill ${demo ? 'demo' : 'live'}`}>{demo ? 'DEMO · sample data' : 'LIVE'}</span>
          <select className="select" value={s.settings.chain} onChange={(e) => setSetting('chain', e.target.value)} aria-label="Chain">{Object.entries(CHAINS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>
          <button className="btn" onClick={resolveDue} disabled={busy.resolve}>{busy.resolve ? <Spinner /> : null} Resolve due{due.length ? ` (${due.length})` : ''}</button>
          <button className="btn primary" onClick={runForecast} disabled={busy.forecast}>{busy.forecast ? <Spinner /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" /></svg>} Run forecast</button>
        </header>
        <main className="page">
          {demo ? <div className="banner warn"><b>Demo mode.</b> Everything here is synthetic sample data. No chain data was read, no model was called and nothing was written to Walrus.</div> : null}
          {needToken ? (
            <div className="banner bad"><b>Passcode required.</b>
              <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Access passcode" aria-label="Access passcode" style={{ maxWidth: 240 }} />
              <button className="btn sm" onClick={() => { setToken(pass); setNeedToken(false); }}>Save</button></div>
          ) : null}
          <View go={go} />
        </main>
      </div>
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'ok' ? '' : t.kind}`}>{t.msg}</div>)}</div>
    </div>
  );
}

export default function App() { return <ArcProvider><Shell /></ArcProvider>; }
