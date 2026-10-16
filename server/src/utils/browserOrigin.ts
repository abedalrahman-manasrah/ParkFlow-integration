import { webOrigins } from '../config/env';
import { ApiError } from './errors';

export type BrowserOriginRequest = {
  method?: string;
  get(name: string): string | undefined;
};

const trustedOrigins = new Set([...webOrigins.customer, ...webOrigins.management]);
const forbidden = (message: string) => new ApiError(403, 'FORBIDDEN', message);

/**
 * Origin is authoritative whenever the header is present. Same-origin browser
 * reads can omit it, but only browser metadata plus a trusted Referer may fill it.
 * Forwarded host/protocol headers never establish a browser's identity.
 */
export function resolveBrowserOrigin(req: BrowserOriginRequest): string | null {
  const explicit = req.get('Origin');
  if (explicit !== undefined) {
    if (!trustedOrigins.has(explicit)) throw forbidden('Origin does not match a trusted browser application');
    return explicit;
  }

  const site = req.get('Sec-Fetch-Site'), mode = req.get('Sec-Fetch-Mode'), referer = req.get('Referer');
  // Native Node fetch adds Sec-Fetch-Mode by itself; it is not browser proof.
  if (site === undefined && referer === undefined) return null;
  if (!['GET', 'HEAD'].includes((req.method ?? '').toUpperCase())
    || site !== 'same-origin' || mode !== 'cors' || !referer) {
    throw forbidden('Browser reads require trusted same-origin metadata');
  }

  let parsed: URL;
  try { parsed = new URL(referer); } catch { throw forbidden('Invalid browser Referer'); }
  if (parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol)
    || !trustedOrigins.has(parsed.origin)) {
    throw forbidden('Referer does not match a trusted browser application');
  }
  return parsed.origin;
}
