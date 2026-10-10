/**
 * HTML character references — what a stranger's page head writes (link
 * previews, lib/links/openGraph) and what the story editor's Markdown writes
 * for `<`, `>` and `&` typed as text (lib/markdown/plainText reads them back
 * for excerpts). Pure, and small enough for the browser: the names pages and
 * the editor actually use, plus every numeric reference.
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·',
  bull: '•', times: '×', deg: '°', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', iexcl: '¡',
  iquest: '¿', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', aacute: 'á', acirc: 'â', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ', oacute: 'ó', iacute: 'í', uacute: 'ú',
};

/** One character reference, `&…;`; the body is group 1. */
export const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/gi;

/** What one reference's body (`amp`, `#62`, `#x3E`) stands for; null for a name it doesn't know. */
export function entityValue(body: string): string | null {
  if (body[0] === '#') {
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
    return String.fromCodePoint(code);
  }
  return NAMED[body.toLowerCase()] ?? null;
}

/** HTML character references, decoded once (`&amp;lt;` is `&lt;`). Unknown names are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => entityValue(body) ?? whole);
}
