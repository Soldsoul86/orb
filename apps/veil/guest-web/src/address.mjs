// Public routing identity, never a guest credential or an approval grant.
export const ID_PREFIX = 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:';
export function bytes64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_ENCODING');
  const raw = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (encode64(raw) !== value) throw new Error('INVALID_ENCODING');
  return raw;
}
export function encode64(raw) { return btoa(Array.from(raw, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export function origin(value) {
  if (typeof value !== 'string' || value.length > 255 || !/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(value)) throw new Error('INVALID_ORIGIN');
  const u = new URL(value);
  if (u.origin !== value || u.username || u.password || !u.hostname.includes('.') || u.hostname.endsWith('.')) throw new Error('INVALID_ORIGIN');
  return value;
}
export function parseAddress(value, trustedOrigin) {
  origin(trustedOrigin);
  if (typeof value !== 'string' || value.length > 600) throw new Error('INVALID_ADDRESS');
  const match = /^(https:\/\/[a-z0-9.:-]+)\/g\/([A-Za-z0-9_-]{43})(?:#([A-Za-z0-9_-]{43}))?$/.exec(value);
  if (!match || match[1] !== trustedOrigin || bytes64(match[2]).length !== 32 || (match[3] && bytes64(match[3]).length !== 32)) throw new Error('INVALID_ADDRESS');
  return Object.freeze({origin:trustedOrigin, controller:ID_PREFIX+match[2], reference:match[3] ?? null, kind:match[3]?'unlisted':'reusable'});
}
