import { useState } from 'react';
import { useArc } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { Panel, Badge, Empty, Spinner, WriteBadge, ago, short } from '../components/ui.jsx';

const EXPLORER = import.meta.env?.VITE_WALRUS_BLOB_URL || 'https://walruscan.com/mainnet/blob/{id}';

export default function MemoryExplorer() {
  const { s, busy, verifyWrite, syncWalrus, pollWrites, toast } = useArc();
  const [tab, setTab] = useState('ledger');
  const [q, setQ] = useState('ARC LESSON ethereum');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const demo = s.settings.demo;
  const writes = Object.values(s.writes).sort((a, b) => b.at - a.at);
  const search = async () => {
    setSearching(true);
    try { setFound((await api(`/api/memory?action=recall&q=${encodeURIComponent(q)}&limit=10`)).cards); }
    catch (e) { toast(e.message, 'bad'); } finally { setSearching(false); }
  };
  if (demo) return <Panel title="Memory explorer"><Empty title="Demo mode">Walrus Memory is not used in demo mode. Switch to live mode in Settings to write and verify real memories.</Empty></Panel>;
  return (
    <>
      <Panel title="How to verify a memory" >
        <ol className="steps">
          <li><div><b>Pending → stored.</b> <span className="muted">A write returns a job id first. The row turns “stored” only after Walrus Memory reports the job finished with a blob id.</span></div></li>
          <li><div><b>Verify.</b> <span className="muted">Runs a recall and checks the exact blob id comes back. That proves the memory is retrievable, not just accepted.</span></div></li>
          <li><div><b>Sync from Walrus.</b> <span className="muted">Rebuilds this dashboard from what Walrus returns, so you can clear local data and see the history survive.</span></div></li>
        </ol>
      </Panel>
      <Panel title="Memory explorer" flush right={
        <div className="row">
          <div className="tabs"><button className={`tab ${tab === 'ledger' ? 'on' : ''}`} onClick={() => setTab('ledger')}>Write ledger</button><button className={`tab ${tab === 'recall' ? 'on' : ''}`} onClick={() => setTab('recall')}>Recall search</button></div>
          <button className="btn sm" onClick={pollWrites}>Check pending</button>
          <button className="btn sm" onClick={syncWalrus} disabled={busy.sync}>{busy.sync ? <Spinner /> : null} Sync from Walrus</button>
        </div>}>
        {tab === 'ledger' ? (
          writes.length ? (
            <div className="scroll-x"><table className="tbl"><thead><tr><th>Type</th><th>Memory</th><th>Status</th><th>Blob id</th><th>When</th><th /></tr></thead><tbody>
              {writes.map((w) => (
                <tr key={w.key}>
                  <td><Badge kind="arc">{w.kind}</Badge></td>
                  <td><span className="trunc" style={{ maxWidth: 260 }} title={w.headline}>{w.headline}</span>{w.recalled ? <> <Badge>recalled</Badge></> : null}{w.error ? <div className="dim" style={{ fontSize: 12 }}>{w.error}</div> : null}</td>
                  <td><WriteBadge w={w} /> {w.verified ? <Badge kind={w.verified.failed ? 'warn' : 'ok'}>{w.verified.failed ? 'not found yet' : 'verified'}</Badge> : null}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{w.blobId ? <><a href={EXPLORER.replace('{id}', w.blobId)} target="_blank" rel="noreferrer">{short(w.blobId, 8)}</a> <button className="btn sm" onClick={() => navigator.clipboard?.writeText(w.blobId)}>copy</button></> : <span className="dim">{w.jobId ? `job ${short(w.jobId, 6)}` : '-'}</span>}</td>
                  <td className="muted">{ago(w.at)}</td>
                  <td>{w.blobId ? <button className="btn sm" onClick={() => verifyWrite(w.key)} disabled={busy[`verify:${w.key}`]}>{busy[`verify:${w.key}`] ? <Spinner /> : null} Verify</button> : null}</td>
                </tr>))}
            </tbody></table></div>
          ) : <Empty title="No writes yet">Run a forecast, or sync to load what Walrus already holds for this namespace.</Empty>
        ) : (
          <div className="panel-b col">
            <div className="row"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} aria-label="Recall query" /><button className="btn" onClick={search} disabled={searching}>{searching ? <Spinner /> : null} Recall</button></div>
            {found === null ? <span className="muted">Search Walrus Memory semantically, for example “ARC RESOLUTION ethereum base_fee_gwei”.</span> : found.length ? found.map((c) => (
              <div key={c.blobId} className="lesson-card"><Badge kind="arc">{c.type}</Badge> <span className="mono dim" style={{ fontSize: 12 }}>{short(c.blobId, 8)} · distance {c.distance?.toFixed?.(3) ?? c.distance}</span><div>{c.headline}</div></div>
            )) : <Empty title="No matching memories">Nothing returned for that query.</Empty>}
          </div>
        )}
      </Panel>
    </>
  );
}
