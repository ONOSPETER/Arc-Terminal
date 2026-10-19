import { useEffect, useState } from 'react';
import { useArc } from '../lib/store.jsx';
import { getToken, setToken } from '../lib/api.js';
import { Panel, Badge, Spinner } from '../components/ui.jsx';
import { CHAINS } from '../../shared/chains.js';

const Row = ({ label, ok, children }) => (<div className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{label}</span><span className="row">{children}{ok === null ? <Badge>unknown</Badge> : <Badge kind={ok ? 'ok' : 'bad'}>{ok ? 'configured' : 'missing'}</Badge>}</span></div>);

export default function Settings() {
  const { s, setSetting, refreshHealth, busy, reset, toast } = useArc();
  const [tok, setTok] = useState(getToken());
  const h = s.health;
  useEffect(() => { if (!h) refreshHealth(false); /* eslint-disable-next-line */ }, []);
  return (
    <div className="grid-2">
      <Panel title="Integrations" right={<button className="btn sm" onClick={() => refreshHealth(true)} disabled={busy.health}>{busy.health ? <Spinner /> : null} Test connections</button>}>
        {!h ? <span className="muted">Loading status…</span> : (
          <>
            <Row label="OpenRouter" ok={h.openrouter.configured}><span className="mono muted" style={{ fontSize: 12 }}>{h.openrouter.model}</span></Row>
            <Row label="Tatum" ok={h.tatum.configured} />
            {Object.entries(h.tatum.chains).map(([k, c]) => (<div key={k} className="row between" style={{ padding: '6px 0 6px 14px', fontSize: 13 }}><span className="muted">{c.label}</span>{c.ok === null ? <Badge>not tested</Badge> : c.ok ? <Badge kind="ok">block {c.latestBlock}</Badge> : <Badge kind="bad" title={c.error}>unreachable</Badge>}</div>))}
            <Row label="Walrus Memory (Sui Mainnet)" ok={h.walrus.configured}><span className="mono muted" style={{ fontSize: 12 }}>ns: {h.walrus.namespace}</span>{h.walrus.relayerOk === true ? <Badge kind="ok">relayer ok</Badge> : h.walrus.relayerOk === false ? <Badge kind="bad" title={h.walrus.error}>relayer error</Badge> : null}</Row>
            <Row label="Access passcode required" ok={null}><Badge kind={h.authRequired ? 'warn' : ''}>{h.authRequired ? 'yes' : 'no'}</Badge></Row>
            <p className="dim" style={{ fontSize: 12 }}>Status never reveals secret values. Keys live only in server environment variables.</p>
          </>
        )}
      </Panel>
      <div className="col">
        <Panel title="Mode and defaults">
          <div className="col">
            <label className="row"><input type="checkbox" checked={s.settings.demo} onChange={(e) => setSetting('demo', e.target.checked)} /> <span><b>Demo mode</b> <span className="muted">uses clearly labelled sample data and never touches Tatum, OpenRouter or Walrus.</span></span></label>
            <label className="muted">Default chain <select className="select" value={s.settings.chain} onChange={(e) => setSetting('chain', e.target.value)}>{Object.entries(CHAINS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></label>
            <label className="muted">Forecasts per run <select className="select" value={s.settings.count} onChange={(e) => setSetting('count', +e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          </div>
        </Panel>
        <Panel title="Access passcode">
          <p className="muted" style={{ marginTop: 0 }}>Needed only if you set ARC_ACCESS_TOKEN on the server. Stored in this tab’s session only.</p>
          <div className="row"><input className="input" type="password" value={tok} onChange={(e) => setTok(e.target.value)} placeholder="passcode" aria-label="Access passcode" /><button className="btn" onClick={() => { setToken(tok); toast('Passcode saved for this tab'); }}>Save</button></div>
        </Panel>
        <Panel title="Local data">
          <p className="muted" style={{ marginTop: 0 }}>Forecast history is cached in this browser. Walrus remains the source of truth, so you can clear the cache and use Sync from Walrus to restore it.</p>
          <button className="btn" onClick={reset}>Clear local cache</button>
        </Panel>
      </div>
    </div>
  );
}
