import { Panel } from '../components/ui.jsx';

const VARS = [['OPENROUTER_API_KEY', 'OpenRouter key'], ['OPENROUTER_MODEL', 'Model slug, e.g. openai/gpt-4o-mini'], ['TATUM_API_KEY', 'Tatum API key'], ['MEMWAL_PRIVATE_KEY', 'Walrus Memory delegate private key'], ['MEMWAL_ACCOUNT_ID', 'Walrus Memory account id'], ['MEMWAL_SERVER_URL', 'Relayer URL (optional)'], ['MEMWAL_NAMESPACE', 'Memory namespace (optional)'], ['ARC_ACCESS_TOKEN', 'Passcode for public deployments (optional)']];

export default function QuickStart() {
  return (
    <div className="grid-2">
      <Panel title="Run the learning cycle">
        <ol className="steps">
          <li><div><b>Settings → Test connections.</b> <span className="muted">Confirm OpenRouter, Tatum and Walrus show configured.</span></div></li>
          <li><div><b>Run forecast.</b> <span className="muted">Creates forecasts and starts Walrus writes (status pending, then stored).</span></div></li>
          <li><div><b>Memory → Verify.</b> <span className="muted">Check a stored blob id comes back on recall.</span></div></li>
          <li><div><b>Wait for a horizon, then Resolve due.</b> <span className="muted">Shortest horizon is 15 minutes. Outcome, error and lesson are stored.</span></div></li>
          <li><div><b>Run forecast again.</b> <span className="muted">The lesson is recalled, probabilities are calibrated, and Forecast detail shows what changed.</span></div></li>
          <li><div><b>Learning → Run replay.</b> <span className="muted">Instant before-versus-after test on past blocks.</span></div></li>
        </ol>
      </Panel>
      <Panel title="Environment variables (server only)">
        <table className="tbl"><tbody>{VARS.map(([k, d]) => (<tr key={k}><td className="mono" style={{ fontSize: 12 }}>{k}</td><td className="muted">{d}</td></tr>))}</tbody></table>
        <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>Add them in Vercel → Project → Settings → Environment Variables. Never prefix with VITE_.</p>
      </Panel>
    </div>
  );
}
