import * as net from 'net';

/**
 * Converts an IPv4 address string to a 32-bit integer.
 */
function ipv4ToInt(ip: string): number {
  return (
    ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
  );
}

/**
 * Checks whether `ip` is contained in the CIDR block `cidr`.
 * Supports both IPv4 CIDR (e.g. "10.0.0.0/8") and exact IPv4 matches.
 * For IPv6 this falls back to an exact string comparison (no CIDR).
 */
function matchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    // Exact match (normalise IPv6 casing)
    return ip === cidr || ip.toLowerCase() === cidr.toLowerCase();
  }

  const [range, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (net.isIPv4(ip) && net.isIPv4(range)) {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
  }

  // IPv6 CIDR – not implemented; fall back to exact match
  return ip.toLowerCase() === range.toLowerCase();
}

/**
 * Normalises an IP string for comparison, e.g. strips the IPv4-mapped
 * IPv6 prefix (`::ffff:1.2.3.4` -> `1.2.3.4`).
 */
function normalizeIp(ip: string): string {
  return ip.toLowerCase().replace(/^::ffff:/, '');
}

/**
 * Returns true when `ip` matches one of the trusted proxy entries
 * (exact IP match or CIDR block).
 */
function isTrustedProxy(ip: string, trustedProxies: string[]): boolean {
  return trustedProxies.some((entry) => matchesCidr(normalizeIp(ip), entry));
}

/**
 * Parses a comma-separated `TRUSTED_PROXY_IPS` value into a list of
 * IP addresses / CIDR blocks. Returns an empty list when unset.
 */
export function parseTrustedProxyList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Extracts the real client IP from an Express request.
 *
 * The client-supplied `X-Forwarded-For` header is only honoured when the
 * immediate connecting peer (`req.socket.remoteAddress`) is a configured
 * trusted proxy; otherwise the header is attacker-controlled and the socket
 * peer address is used. When a trusted proxy is present, the rightmost
 * `X-Forwarded-For` entry that is not itself a trusted proxy is the client —
 * this defeats forged leading entries inserted by a client behind the proxy.
 */
export function extractClientIp(
  req: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    connection?: { remoteAddress?: string };
    socket?: { remoteAddress?: string };
  },
  trustedProxies: string[] = [],
): string | undefined {
  const peer = normalizeIp(
    req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? req.ip ?? '',
  );
  if (!peer) return undefined;

  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded && isTrustedProxy(peer, trustedProxies)) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const entries = raw
      .split(',')
      .map((entry) => normalizeIp(entry.trim()))
      .filter(Boolean);

    // Walk from the right, skipping trusted proxies, to find the client IP.
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!isTrustedProxy(entries[i], trustedProxies)) {
        return entries[i];
      }
    }

    // Every hop in the chain is a trusted proxy — fall back to the peer.
    return peer;
  }

  return peer;
}

/**
 * Returns true when `ip` is allowed by `allowedIps`.
 * An empty allowlist means no restriction (all IPs pass).
 */
export function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;
  return allowedIps.some((entry) => matchesCidr(normalizeIp(ip), entry));
}
