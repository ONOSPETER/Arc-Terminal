import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Dev-only middleware: serves /api/* by calling the same handlers Vercel runs in production,
// so `npm run dev` is a single command. Secrets come from .env (never VITE_-prefixed, never bundled).
function apiDevPlugin(env) {
  return {
    name: 'arc-api-dev',
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.replace('/api/', '').replace(/\/$/, '');
        if (!/^[a-z0-9-]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(path.resolve(`api/${name}.js`));
          req.query = Object.fromEntries(url.searchParams);
          if (req.method === 'POST') {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            const raw = Buffer.concat(chunks).toString('utf8');
            try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
          }
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
          await mod.default(req, res);
        } catch (e) {
          console.error('[api-dev]', e);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { plugins: [react(), apiDevPlugin(env)], server: { port: 5173 } };
});
