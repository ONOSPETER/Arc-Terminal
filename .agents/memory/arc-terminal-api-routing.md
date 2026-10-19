---
name: ARC Terminal API routing
description: Why the shared API service owns only its health endpoint while ARC Terminal handles the rest of `/api/*`.
---

The shared API server artifact is routed only to `/api/healthz`. ARC Terminal is served at `/` and its Vite middleware handles the remaining `/api/*` endpoints.

**Why:** the workspace's generic API service originally claimed all of `/api`, which intercepted ARC Terminal's own Vite-hosted endpoints. Narrowing the generic service preserves its health endpoint without changing ARC's app source.

**How to apply:** If service routing changes, keep the shared API server's route narrow or deliberately redesign ARC's API routing. Do not restore a broad `/api` route while ARC's own API handlers are served by Vite.
