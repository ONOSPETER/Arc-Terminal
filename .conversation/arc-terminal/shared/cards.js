// Memory cards: one-line text written to Walrus Memory. A readable header helps semantic recall;
// the JSON tail is the machine-readable record. Cards never contain secrets, only chain facts and model output.
export const CARD_TYPES = ['FORECAST', 'RESOLUTION', 'LESSON'];

const SECRET_PATTERNS = [/suiprivkey1[0-9a-z]+/i, /sk-or-[A-Za-z0-9_-]{10,}/, /\b[0-9a-f]{64}\b/i];

export function assertSafeText(text) {
  const bare = text.replace(/0x[0-9a-fA-F]{64}/g, ''); // 0x-prefixed 32-byte ids are public hashes
  for (const re of SECRET_PATTERNS) if (re.test(bare)) throw new Error('Refusing to write: text looks like a secret');
  return text;
}

export function encodeCard(type, headline, data) {
  if (!CARD_TYPES.includes(type)) throw new Error(`Unknown card type ${type}`);
  const text = `[ARC:${type}] ${headline} | ${JSON.stringify(data)}`;
  return assertSafeText(text);
}

export function decodeCard(text) {
  const m = /^\[ARC:([A-Z]+)\]\s(.*?)\s\|\s(\{.*\})\s*$/s.exec(text || '');
  if (!m) return null;
  try { return { type: m[1], headline: m[2], data: JSON.parse(m[3]) }; } catch { return null; }
}
