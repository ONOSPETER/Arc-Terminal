import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { METRICS } from '../../shared/chains.js';
import { calibrationStats, lessonFromStats, meanBrier } from '../../shared/scoring.js';
import { demoForecasts, demoLesson, demoReplay, demoResolve, demoSignals } from '../demo/sample.js';

const KEY = 'arc.v1';
const fresh = () => ({ settings: { chain: 'ethereum', count: 3, demo: false }, forecasts: {}, resolutions: {}, lessons: [], writes: {}, signals: {}, recalled: [], replay: null, log: [], health: null, lastRun: null });
const load = () => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}'), health: null }; } catch { return fresh(); } };

export const claimText = (f) => `${METRICS[f.metric]?.label || f.metric} ${f.comparator} ${f.threshold} ${METRICS[f.metric]?.unit || ''} in ${f.horizonMin}m`;
const Ctx = createContext(null);
export const useArc = () => useContext(Ctx);

export function ArcProvider({ children }) {
  const [s, setS] = useState(load);
  const [busy, setBusy] = useState({});
  const [toasts, setToasts] = useState([]);
  const [needToken, setNeedToken] = useState(false);
  const [progress, setProgress] = useState(null);
  const ref = useRef(s); ref.current = s;
  const busyRef = useRef({}); busyRef.current = busy;

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ ...s, log: s.log.slice(-60), health: null })); } catch { /* quota */ } }, [s]);
  const patch = useCallback((fn) => setS((p) => ({ ...p, ...fn(p) })), []);
  const log = useCallback((level, msg) => patch((p) => ({ log: [...p.log, { t: Date.now(), level, msg }].slice(-200) })), [patch]);
  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const fail = useCallback((e) => {
    if (e.authRequired) setNeedToken(true);
    const extra = e.missing ? ` Missing env: ${e.missing.join(', ')}. Add it in Vercel settings or .env, or switch to demo mode.` : '';
    toast(`${e.message}.${extra}`, 'bad');
    log('error', `${e.message}${extra}`);
  }, [toast, log]);

  const guard = useCallback(async (key, fn) => {
    if (busyRef.current[key]) return;
    busyRef.current = { ...busyRef.current, [key]: true };
    setBusy((b) => ({ ...b, [key]: true }));
    try { return await fn(); } catch (e) { fail(e); } finally { busyRef.current = { ...busyRef.current, [key]: false }; setBusy((b) => ({ ...b, [key]: false })); }
  }, [fail]);

  const setSetting = (k, v) => patch((p) => ({ settings: { ...p.settings, [k]: v } }));

  // ---- derived ----
  const items = useMemo(() => Object.values(s.forecasts).sort((a, b) => b.createdAtTs - a.createdAtTs).map((f) => ({ ...f, res: s.resolutions[f.id] || null })), [s.forecasts, s.resolutions]);
  const resolved = items.filter((i) => i.res);
  const open = items.filter((i) => !i.res);
  const nowSec = Math.floor(Date.now() / 1000);
  const due = open.filter((i) => (s.settings.demo ? i.sample : !i.sample && i.deadline <= nowSec));
  const liveBrier = meanBrier(resolved.filter((i) => !i.sample === !s.settings.demo).map((i) => ({ p: i.p, o: i.res.o })));
  const group = (arr) => ({ n: arr.length, brier: meanBrier(arr.map((i) => ({ p: i.p, o: i.res.o }))) });
  const rv = resolved.filter((i) => !i.sample === !s.settings.demo);
  const beforeAfter = { before: group(rv.filter((i) => !i.memoryUsed)), after: group(rv.filter((i) => i.memoryUsed)) };

  const addWrites = (list) => patch((p) => {
    const w = { ...p.writes };
    for (const x of list) { const key = x.jobId ? `job:${x.jobId}` : `${x.status}:${x.refId}:${x.kind}`; w[key] = { key, at: Date.now(), ...x }; }
    return { writes: w };
  });

  // ---- actions ----
  const runForecast = () => guard('forecast', async () => {
    const { chain, count, demo } = ref.current.settings;
    if (demo) {
      const stats = resolved.filter((i) => i.sample).map((i) => ({ metric: i.metric, p: i.pRaw, o: i.res.o }));
      const out = demoForecasts({ chain, count, resolvedForStats: stats });
      patch((p) => ({ forecasts: { ...p.forecasts, ...Object.fromEntries(out.forecasts.map((f) => [f.id, f])) }, signals: { ...p.signals, [chain]: { data: out.signals, at: Date.now() } }, recalled: [], lastRun: { at: Date.now(), sample: true, count: out.forecasts.length } }));
      toast(`Created ${out.forecasts.length} SAMPLE forecasts. Nothing was written to Walrus.`, 'warn');
      return;
    }
    log('info', `Forecast run on ${chain}: collecting signals, recalling memory, calling model`);
    const out = await api('/api/forecast', { method: 'POST', body: { chain, count } });
    const fcs = Object.fromEntries(out.forecasts.map((f) => [f.id, f]));
    patch((p) => ({ forecasts: { ...p.forecasts, ...fcs }, signals: { ...p.signals, [chain]: { data: out.signals, at: Date.now() } }, recalled: out.recalled, lastRun: { at: Date.now(), recalled: out.recalled.length, dropped: out.dropped.length, model: out.llm.model, usage: out.llm.usage, memory: out.memory } }));
    addWrites(out.forecasts.map((f) => ({ kind: 'FORECAST', refId: f.id, jobId: f.mem.jobId, status: f.mem.status === 'pending' ? 'pending' : f.mem.status, headline: f.mem.headline || claimText(f), error: f.mem.error || f.mem.reason })));
    log('info', `${out.forecasts.length} forecasts; recalled ${out.recalled.length} memories; dropped ${out.dropped.length} invalid`);
    toast(`${out.forecasts.length} forecasts created. Recalled ${out.recalled.length} memories first.`);
  });

  const resolveDue = () => guard('resolve', async () => {
    const { demo } = ref.current.settings;
    const batch = due.slice(0, 8);
    if (!batch.length) { toast('Nothing is due yet. Forecasts resolve once their horizon has passed on-chain.', 'warn'); return; }
    if (demo) {
      const rs = batch.map(demoResolve);
      const stats = calibrationStats([...resolved.filter((i) => i.sample).map((i) => ({ metric: i.metric, p: i.pRaw, o: i.res.o })), ...rs.map((r) => ({ metric: r.metric, p: r.pRaw, o: r.o }))]);
      const lessons = Object.entries(stats).map(([m, st]) => demoLesson(batch[0].chain, m, st));
      patch((p) => ({ resolutions: { ...p.resolutions, ...Object.fromEntries(rs.map((r) => [r.forecastId, r])) }, lessons: [...lessons.map((l) => ({ ...l, id: `${l.metric}:${Date.now()}` })), ...p.lessons].slice(0, 60) }));
      toast(`Resolved ${rs.length} SAMPLE forecasts and recorded lessons (sample, not stored on Walrus).`, 'warn');
      return;
    }
    const wr = Object.values(ref.current.writes);
    const payload = batch.map((f) => ({ ...f, res: undefined, mem: { blobId: wr.find((w) => w.refId === f.id && w.kind === 'FORECAST')?.blobId } }));
    log('info', `Resolving ${payload.length} forecasts against chain data at their deadlines`);
    const out = await api('/api/resolve', { method: 'POST', body: { forecasts: payload } });
    patch((p) => ({
      resolutions: { ...p.resolutions, ...Object.fromEntries(out.resolutions.map((r) => [r.forecastId, r])) },
      lessons: [...out.lessons.map((l) => ({ ...l, id: `${l.chain}:${l.metric}:${Date.now()}` })), ...p.lessons].slice(0, 60),
    }));
    addWrites(out.writes);
    out.skipped.forEach((k) => log(k.status === 'not_due' ? 'info' : 'error', `${k.forecastId}: ${k.status}${k.reason ? ' - ' + k.reason : ''}`));
    toast(`Resolved ${out.resolutions.length}, skipped ${out.skipped.length}. Recorded ${out.lessons.length} lessons.`);
  });

  const pollWrites = useCallback(async () => {
    const pend = Object.values(ref.current.writes).filter((w) => w.status === 'pending' && w.jobId).slice(0, 4);
    for (const w of pend) {
      try {
        const r = await api(`/api/memory?action=job&id=${encodeURIComponent(w.jobId)}`);
        if (r.status !== 'pending') patch((p) => ({ writes: { ...p.writes, [w.key]: { ...p.writes[w.key], status: r.status, blobId: r.blobId, error: r.error } } }));
      } catch (e) { if (e.authRequired) setNeedToken(true); return; }
    }
  }, [patch]);

  useEffect(() => {
    if (s.settings.demo) return undefined;
    const t = setInterval(() => { if (Object.values(ref.current.writes).some((w) => w.status === 'pending')) pollWrites(); }, 6000);
    return () => clearInterval(t);
  }, [s.settings.demo, pollWrites]);

  const verifyWrite = (key) => guard(`verify:${key}`, async () => {
    const w = ref.current.writes[key];
    if (!w?.blobId) { toast('No blob id yet. Wait for the write to finish.', 'warn'); return; }
    const r = await api('/api/memory', { method: 'POST', body: { action: 'verify', query: w.headline, blobId: w.blobId, kind: w.kind } });
    patch((p) => ({ writes: { ...p.writes, [key]: { ...p.writes[key], verified: r.verified ? { at: r.checkedAt, headline: r.matchedHeadline } : { at: r.checkedAt, failed: true } } } }));
    toast(r.verified ? 'Verified: Walrus Memory returned this exact blob on recall.' : 'Not found on recall yet. Indexing can lag; retry in a minute.', r.verified ? 'ok' : 'warn');
  });

  const syncWalrus = () => guard('sync', async () => {
    const chain = ref.current.settings.chain;
    const { cards, namespace } = await api(`/api/memory?action=sync&chain=${chain}`);
    patch((p) => {
      const forecasts = { ...p.forecasts }, resolutions = { ...p.resolutions }, writes = { ...p.writes };
      const lessons = [...p.lessons];
      for (const c of cards) {
        const d = c.data;
        writes[`blob:${c.blobId}`] = writes[`blob:${c.blobId}`] || { key: `blob:${c.blobId}`, kind: c.type, refId: d.id || d.forecastId || `${d.chain}:${d.metric}`, status: 'done', blobId: c.blobId, headline: c.headline, at: Date.now(), recalled: true };
        if (c.type === 'FORECAST' && !forecasts[d.id]) forecasts[d.id] = { ...d, policy: 'memory', fromWalrus: true, evidence: { observed: d.observed, latestBlock: d.latestBlock, source: 'Tatum JSON-RPC (observed), recalled from Walrus' }, calibration: { shift: 0, shrink: 1, basedOn: 0 }, cites: [], invalidation: [], createdAt: new Date(d.createdAtTs * 1000).toISOString() };
        if (c.type === 'RESOLUTION' && !resolutions[d.forecastId]) resolutions[d.forecastId] = { ...d, status: 'resolved', resolvedAtTs: d.resolvedAtTs ?? null };
        if (c.type === 'LESSON' && !lessons.some((l) => l.lesson === d.lesson)) lessons.push({ ...d, id: `${d.chain}:${d.metric}:${c.blobId}` });
      }
      return { forecasts, resolutions, writes, lessons };
    });
    toast(`Synced ${cards.length} memories from Walrus (namespace ${namespace}).`);
  });

  const fetchSignals = (chain) => guard('signals', async () => {
    if (ref.current.settings.demo) { patch((p) => ({ signals: { ...p.signals, [chain]: { data: demoSignals(chain), at: Date.now() } } })); return; }
    const out = await api(`/api/signals?chain=${chain}`);
    patch((p) => ({ signals: { ...p.signals, [chain]: { data: out.signals, at: Date.now() } } }));
  });

  const refreshHealth = (probe) => guard('health', async () => {
    const h = await api(`/api/health${probe ? '?probe=1' : ''}`);
    patch(() => ({ health: h }));
  });

  const runReplay = ({ chain, steps, count, spacingH }) => guard('replay', async () => {
    const started = Date.now();
    let result = [];
    if (ref.current.settings.demo) {
      result = demoReplay({ steps, count });
    } else {
      const nowSec2 = Math.floor(Date.now() / 1000);
      const start = nowSec2 - (steps - 1) * spacingH * 3600 - 185 * 60;
      const memRes = [];
      for (let i = 0; i < steps; i++) {
        const asOf = start + i * spacingH * 3600;
        setProgress({ i, steps });
        const prior = memRes.filter((r) => r.resolvedAtTs <= asOf);
        const r = await api('/api/replay-step', { method: 'POST', body: { chain, asOf, count, memResolutions: prior } });
        result.push(r);
        r.memory.filter((f) => f.resolution?.status === 'resolved').forEach((f) => memRes.push({ metric: f.metric, p: f.p, pRaw: f.pRaw, o: f.resolution.o, resolvedAtTs: f.resolution.resolvedAtTs }));
      }
    }
    setProgress(null);
    patch(() => ({ replay: { chain, sample: ref.current.settings.demo, at: Date.now(), tookMs: Date.now() - started, steps: result } }));
    toast(ref.current.settings.demo ? 'SAMPLE replay finished.' : 'Replay finished.', ref.current.settings.demo ? 'warn' : 'ok');
  });

  const reset = () => { localStorage.removeItem(KEY); setS(fresh()); toast('Local cache cleared. Walrus memories are untouched.', 'warn'); };

  const value = { s, busy, toasts, needToken, setNeedToken, progress, items, resolved, open, due, liveBrier, beforeAfter, setSetting, runForecast, resolveDue, pollWrites, verifyWrite, syncWalrus, fetchSignals, refreshHealth, runReplay, reset, toast, lessonFromStats };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
