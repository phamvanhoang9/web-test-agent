// url-template.mjs — pure URL helpers for the crawler: normalize discovered links, refuse
// URLs that look like they change state, recognise file links, and group URLs into route
// templates (/orders/42 and /orders/43 -> /orders/:id).

const TRACKING_PARAM = /^(utm_.+|gclid|fbclid)$/i;
const UNSAFE_WORDS = [
  'logout', 'log-out', 'signout', 'sign-out', 'logoff', 'delete', 'remove', 'destroy',
  'unsubscribe', 'cancel', 'revoke', 'deactivate', 'disable', 'archive', 'reset', 'export',
  'generate',
];
const FILE_EXTENSIONS = new Set([
  'pdf', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'gz', 'tar', 'rar', '7z',
  'txt', 'json', 'xml', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'mov', 'webm',
]);

/** Split 'report.pdf' into ['report', '.pdf']; segments without an extension keep ''. */
function splitExtension(segment) {
  const dot = segment.lastIndexOf('.');
  if (dot <= 0 || !/^[a-z0-9]{1,5}$/i.test(segment.slice(dot + 1))) return [segment, ''];
  return [segment.slice(0, dot), segment.slice(dot)];
}

/**
 * Resolve `href` against `base` and return a canonical URL, or null when it leaves the
 * origin of `base`, is not http(s), or does not parse. Fragments and tracking parameters
 * are dropped and the query is sorted by key, so equivalent links compare equal.
 */
export function normalizeUrl(href, base) {
  if (!URL.canParse(href, base)) return null;
  const url = new URL(href, base);
  if (url.origin !== new URL(base).origin) return null;
  url.hash = '';
  const params = [...url.searchParams].filter(([key]) => !TRACKING_PARAM.test(key));
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(params).toString();
  return url.href;
}

function looksUnsafe(token) {
  const [stem] = splitExtension(token.toLowerCase());
  return UNSAFE_WORDS.some(
    (word) => stem === word || stem.startsWith(`${word}-`) || stem.startsWith(`${word}_`),
  );
}

/**
 * True when opening `url` could change state: a path segment, query key or query value is
 * (or starts with, before '-' / '_') a word such as logout or delete. `exclude` patterns
 * always block; `allow` patterns reopen URLs the default word list would block.
 */
export function isUnsafe(url, { exclude = [], allow = [] } = {}) {
  if (exclude.some((pattern) => pattern.test(url))) return true;
  if (allow.some((pattern) => pattern.test(url))) return false;
  const { pathname, searchParams } = new URL(url);
  return [...pathname.split('/'), ...[...searchParams].flat()].some(looksUnsafe);
}

/** True when the URL's last path segment has a known file extension (sitemap.xml aside). */
export function isFileUrl(url) {
  const { pathname } = new URL(url);
  if (pathname === '/sitemap.xml') return false;
  const [, extension] = splitExtension(pathname.slice(pathname.lastIndexOf('/') + 1));
  return FILE_EXTENSIONS.has(extension.slice(1).toLowerCase());
}
