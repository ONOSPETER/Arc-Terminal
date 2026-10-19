const TOKEN_KEY = 'arc.token';
export const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const setToken = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-arc-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = { error: `HTTP ${res.status} (no JSON body). If this is local dev, check the terminal.` }; }
  if (!res.ok) {
    const e = new Error(json.error || `HTTP ${res.status}`);
    Object.assign(e, { status: res.status, missing: json.missing, integration: json.integration, authRequired: json.authRequired });
    throw e;
  }
  return json;
}
