const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP_LEVEL = /^[a-z]{2,63}$/;
const MAX_LENGTH = 253;

/**
 * The client's hub address as stored: a subdomain such as `marca.cliente.com`, in lower case,
 * without scheme, path or trailing dot. Apex domains, IP addresses and malformed names are refused
 * with null, matching the database check.
 */
export function normaliseHostname(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) {
    const rest = host.slice(host.indexOf('://') + 3);
    host = rest.split(/[/?#]/, 1)[0] ?? '';
  }
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (!host || host.length > MAX_LENGTH) return null;
  const labels = host.split('.');
  if (labels.length < 3) return null;
  const topLevel = labels[labels.length - 1] ?? '';
  if (!TOP_LEVEL.test(topLevel)) return null;
  return labels.every((label) => LABEL.test(label)) ? host : null;
}
