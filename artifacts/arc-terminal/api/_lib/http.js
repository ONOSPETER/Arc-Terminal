import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const hits = new Map(); // best-effort, per warm instance
function rateLimit(req, limit = 60, windowMs = 10 * 60 * 1000) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (arr.length > limit) throw new HttpError(429, 'Too many requests. Wait a few minutes and retry.');
}

function checkToken(req) {
  const expected = process.env.ARC_ACCESS_TOKEN;
  if (!expected) return;
  const got = String(req.headers?.['x-arc-token'] || '');
  const a = Buffer.from(got), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Access passcode required or incorrect.', { authRequired: true });
}

export function requireEnv(names, label) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new HttpError(503, `${label} is not configured`, { missing, integration: label });
}

export function handler({ methods = ['GET'], auth = true } = {}, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, `Use ${methods.join(' or ')}`);
      if (auth) { checkToken(req); rateLimit(req); }
      const out = await fn({ query: req.query || {}, body: req.body || {}, req });
      res.status(200).json(out);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', e);
      res.status(status).json({ error: e.message || 'Unexpected error', ...(e.extra || {}) });
    }
  };
}

export const clampInt = (v, lo, hi, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
