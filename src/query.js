// What the search box makes of what's typed: a bang, an address, or a search. No DOM,
// settings or chrome.* here, so the tests can run it.

// Kagi's format flags, as Helium's list gives them in "f"
export const FLAG = { OPEN_BASE_PATH: 1, OPEN_SNAP_DOMAIN: 2, ENCODE: 4, SPACE_TO_PLUS: 8 };

// Every %s, as a template can use the terms twice. A function as the replacement, so "$&"
// and the like in the terms stay as typed.
export function fill(template, terms) {
  return template.replaceAll("%s", () => encodeURIComponent(terms));
}

export function findBang(text) {
  // A bang can sit anywhere, like DuckDuckGo: "!yt lofi" or "lofi !yt"
  const m = text.match(/(?:^|\s)!(\S+)/);
  return m ? { key: m[1].toLowerCase(), terms: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() } : null;
}

// "package.json" or "app.js" alone is more likely a file name to look up than a site.
// Extensions that are also top-level domains (.md, .rs, .sh, .py, .zip) are left as sites.
const FILE_EXT = /^[\w-]+\.(json|js|mjs|cjs|ts|tsx|jsx|rb|go|java|kt|swift|c|h|cpp|hpp|cs|php|txt|csv|yml|yaml|toml|ini|lock|log|css|scss|html|xml|svg|png|jpe?g|gif|webp|pdf|exe|dmg)$/i;

export function looksLikeUrl(text) {
  return /^[a-z][\w+.-]*:\/\//i.test(text)
    || /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]\S*)?$/i.test(text)
    || (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(text) && !FILE_EXT.test(text));
}

// One of your own bangs, [name, url template with %s], in the shape of Helium's. Terms are
// encoded the way engines' are, so "New York" in a path stays "New%20York". One without %s
// always opens that page, as is.
export const ownBangEntry = ([s, u]) =>
  ({ s, u: u.replaceAll("%s", "{searchTerms}"), f: u.includes("%s") ? FLAG.ENCODE | FLAG.OPEN_SNAP_DOMAIN : 0 });

export function runBang(bang, terms) {
  const f = bang.f ?? 15; // no flags given means all of them are on
  if (!terms) {
    // With no terms, Kagi opens the site's root (snap domain) or the search page's path (base path)
    try {
      const url = new URL(bang.u.replaceAll("{searchTerms}", ""));
      // A chrome:// or file:// page has no site to snap to, and opens as is
      if (!/^https?:$/.test(url.protocol)) return url.href;
      return f & FLAG.OPEN_SNAP_DOMAIN ? url.origin : f & FLAG.OPEN_BASE_PATH ? url.origin + url.pathname : url.href;
    } catch {
      return null;
    }
  }
  let q = terms;
  if (f & FLAG.ENCODE) q = encodeURIComponent(q);
  if (f & FLAG.SPACE_TO_PLUS) q = q.replace(/%20| /g, "+");
  return bang.u.replaceAll("{searchTerms}", () => q);
}

// The address for what was typed, or null for nothing. lookup(key) gives a bang in Helium's
// shape, or null when it's unknown and goes to unknownBang. search is the engine's template.
export function resolve(raw, { lookup, search, unknownBang }) {
  const text = raw.trim();
  if (!text) return null;
  const bang = findBang(text);
  if (bang) {
    const known = lookup(bang.key);
    if (!known) return fill(unknownBang, text);
    const url = runBang(known, bang.terms);
    if (url) return url;
  }
  if (looksLikeUrl(text)) {
    if (/^[a-z][\w+.-]*:\/\//i.test(text)) return text;
    // Local servers and routers rarely have certificates
    return (/^(localhost|\d{1,3}(\.\d{1,3}){3})\b/i.test(text) ? "http://" : "https://") + text;
  }
  return fill(search, text);
}

// Helium's bangs.json is JSON with a license header in // comments and trailing commas
export const parseBangList = (text) => JSON.parse(text.replace(/^\/\/.*$/gm, "").replace(/,(\s*[\]}])/g, "$1"));

// Bangs with a trigger starting with prefix, at most max. own is your bangs as [trigger,
// name, url], first ones winning; list is Helium's. Kagi's list has no popularity, so an
// exact match comes first, then shorter triggers, then bangs with more aliases (YouTube has 9).
export function matchBangs(prefix, own, list, max) {
  const owned = new Set(own.map(([t]) => t));
  const mine = own
    .filter(([t], i, all) => t.startsWith(prefix) && all.findIndex(([x]) => x === t) === i)
    .map(([t, s, u]) => ({ t, s, u, n: Infinity }));
  const found = [];
  for (const b of list) {
    let t = null;
    // Your own bangs win over Helium's for the same trigger, which leaves its other ones
    for (const x of b.ts) if (x.startsWith(prefix) && (!t || x.length < t.length) && !owned.has(x)) t = x;
    if (t) found.push({ t, s: b.s, u: b.u, n: b.ts.length });
  }
  return [...mine, ...found]
    .sort((a, b) => (b.t === prefix) - (a.t === prefix) || a.t.length - b.t.length || b.n - a.n)
    .slice(0, max)
    .map((b) => ({ bang: b.t, title: b.s, url: b.u.replace(/\{searchTerms\}|%s/g, "") }));
}

// A result page of one of the engines, which would crowd out the pages themselves. Only
// engines with the terms in the query: before a path's "%s", as in
// "https://en.wikipedia.org/wiki/%s", is every page of the site. What follows the terms,
// like "&view=search", has to be there too.
export const isSearchPage = (url, engines) => engines.some((e) => {
  const i = e.indexOf("%s"), prefix = e.slice(0, i);
  return /[?#]/.test(prefix) && url.startsWith(prefix) && url.slice(i).includes(e.slice(i + 2));
});

// The host without www, and with the port if asked
export const hostOf = (url, port = false) => {
  try { const u = new URL(url); return (port ? u.host : u.hostname).replace(/^www\./, ""); } catch { return ""; }
};
export const prettyUrl = (url) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
export const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
