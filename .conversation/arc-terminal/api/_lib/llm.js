// OpenRouter gateway. Key and model come from env only.
export const modelFor = (kind = 'forecast') =>
  (kind === 'lesson' && process.env.OPENROUTER_MODEL_LESSON) || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

export function parseJsonLoose(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('Model did not return JSON');
}

export async function chatJSON({ system, user, kind = 'forecast', maxTokens = 900, temperature = 0.2, fetchImpl = globalThis.fetch }) {
  const model = modelFor(kind);
  const send = async (withFormat) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      return await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'x-title': 'ARC Terminal',
        },
        body: JSON.stringify({
          model, temperature, max_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...(withFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } finally { clearTimeout(timer); }
  };
  let res = await send(true);
  if (res.status === 400) res = await send(false); // some models reject response_format
  if (res.status === 401) throw new Error('OpenRouter rejected the API key');
  if (res.status === 402) throw new Error('OpenRouter: insufficient credits');
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response');
  return { json: parseJsonLoose(content), usage: j.usage || null, model: j.model || model };
}
