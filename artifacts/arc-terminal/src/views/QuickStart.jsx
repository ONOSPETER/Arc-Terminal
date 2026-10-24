import { Panel } from '../components/ui.jsx';

const VARS = [
  ['TATUM_API_KEY', 'Required · live Sui, Ethereum, Solana, and Base network data'],
  ['OPENROUTER_API_KEY', 'Required · AI forecasts on Ethereum and Base'],
  ['MEMWAL_PRIVATE_KEY', 'Optional · Walrus Memory writes'],
  ['MEMWAL_ACCOUNT_ID', 'Optional · Walrus Memory account'],
  ['OPENROUTER_MODEL', 'Optional · defaults to openai/gpt-4o-mini'],
  ['MEMWAL_SERVER_URL', 'Optional · defaults to the Walrus Memory relayer'],
  ['MEMWAL_NAMESPACE', 'Optional · defaults to arc-terminal'],
  ['ARC_ACCESS_TOKEN', 'Optional · passcode protection for public deployments'],
];

export default function QuickStart() {
  return (
    <div className="grid-2">
      <Panel title="Run the learning cycle">
        <ol className="steps">
          <li><div><b>Network dashboard.</b> <span className="muted">Sui is checked through Tatum gRPC. Ethereum, Solana, and Base use Tatum JSON-RPC. The view refreshes every 20 seconds.</span></div></li>
          <li><div><b>Forecasts on Ethereum or Base.</b> <span className="muted">Creates forecasts and starts optional Walrus Memory writes.</span></div></li>
          <li><div><b>Memory → Verify.</b> <span className="muted">Check a stored blob id comes back on recall.</span></div></li>
          <li><div><b>Wait for a horizon, then Resolve due.</b> <span className="muted">Shortest horizon is 15 minutes. Outcome, error and lesson are stored.</span></div></li>
          <li><div><b>Run forecast again.</b> <span className="muted">The lesson is recalled, probabilities are calibrated, and Forecast detail shows what changed.</span></div></li>
          <li><div><b>Learning → Run replay.</b> <span className="muted">Compare the forecast policies on past Ethereum or Base data.</span></div></li>
        </ol>
      </Panel>
      <Panel title="Environment variables (server only)">
        <table className="tbl"><tbody>{VARS.map(([k, d]) => (<tr key={k}><td className="mono" style={{ fontSize: 12 }}>{k}</td><td className="muted">{d}</td></tr>))}</tbody></table>
        <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>Add credentials through Replit Secrets. Keep server keys out of browser variables; never prefix them with VITE_.</p>
      </Panel>
    </div>
  );
}
