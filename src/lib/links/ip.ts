import { isIP } from 'node:net';

/**
 * Which addresses the server may connect to on behalf of a link in a chat
 * message. A link preview makes OUR servers fetch a URL a stranger chose, so
 * the answer to "is this address on the public internet?" is what keeps that
 * from reaching the metadata service, the loopback, a database on a private
 * subnet or anything else only our own network can see.
 *
 * Deny by default: an address we cannot parse is refused, an IPv6 address is
 * allowed only inside global unicast (2000::/3) and outside the blocks carved
 * out of it, and an IPv4-mapped IPv6 address is judged by the IPv4 inside it.
 */

type Cidr4 = [string, number];

/** IPv4 blocks that are not the public internet (IANA special-purpose registry, RFC 6890 and later). */
const BLOCKED_V4: Cidr4[] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, the cloud metadata address (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation (TEST-NET-1)
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation (TEST-NET-2)
  ['203.0.113.0', 24], // documentation (TEST-NET-3)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and the broadcast address 255.255.255.255
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n;
}

const BLOCKED_V4_RANGES = BLOCKED_V4.map(([base, bits]) => {
  const start = v4ToInt(base)!;
  return { start, end: start + 2 ** (32 - bits) - 1 };
});

function publicV4(n: number): boolean {
  return !BLOCKED_V4_RANGES.some((r) => n >= r.start && n <= r.end);
}

/** An IPv6 address as eight 16-bit groups, or null. Handles `::`, an embedded dotted IPv4 and a zone id. */
export function parseIPv6(address: string): number[] | null {
  let text = address.split('%')[0];
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  if (isIP(text) !== 6) return null;
  const dotted = text.lastIndexOf('.');
  if (dotted !== -1) {
    const colon = text.lastIndexOf(':');
    const v4 = v4ToInt(text.slice(colon + 1));
    if (v4 === null) return null;
    text = `${text.slice(0, colon + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const [head, tail, extra] = text.split('::');
  if (extra !== undefined) return null;
  const groups = (part: string | undefined) => (part ? part.split(':') : []);
  const front = groups(head);
  const back = groups(tail);
  const missing = 8 - front.length - back.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const all = [...front, ...Array<string>(tail === undefined ? 0 : missing).fill('0'), ...back];
  const out = all.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return out.length === 8 && out.every((g) => !Number.isNaN(g)) ? out : null;
}

function publicV6(g: number[]): boolean {
  // ::ffff:a.b.c.d (IPv4-mapped): the connection goes to the IPv4 address inside.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publicV4(g[6] * 65536 + g[7]);
  // ::/96 — the unspecified address, the loopback and the deprecated IPv4-compatible block.
  if (g.slice(0, 6).every((x) => x === 0)) return false;
  // Everything outside global unicast (2000::/3): 64:ff9b::/96 NAT64, 100::/64 discard, fc00::/7 unique local,
  // fe80::/10 link-local, ff00::/8 multicast, and the rest of the unallocated space.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23 IETF protocol assignments: Teredo, ORCHID, anycast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  if (g[0] === 0x2002) return false; // 2002::/16 6to4, which embeds an IPv4 address
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return false; // 3fff::/20 documentation
  return true;
}

/** Whether `address` (as DNS or a URL gives it) is on the public internet. Anything unparseable is not. */
export function isPublicAddress(address: string): boolean {
  const bare = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const kind = isIP(bare.split('%')[0]);
  if (kind === 4) {
    const n = v4ToInt(bare);
    return n !== null && publicV4(n);
  }
  if (kind === 6) {
    const groups = parseIPv6(bare);
    return groups !== null && publicV6(groups);
  }
  return false;
}

/**
 * Names that mean "inside": the loopback and the special-use and
 * intranet suffixes. DNS from our hosts would not answer for them anyway;
 * this refuses them before asking (and `localhost.` with its root dot).
 */
const INTERNAL_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'private', 'home.arpa'];

export function isInternalHostName(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, '');
  return INTERNAL_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}
