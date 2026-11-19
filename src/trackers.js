// Which company a blocked domain belongs to, and what it does, from Disconnect's list
// (CC BY-NC-SA 4.0). No chrome.* here, so the tests can run it.
import { KINDS } from "./shared.js";

// Its categories, folded into the page's three. The rest (Content, Anti-fraud,
// ConsentManagers) and unlisted domains count as "other".
const KIND = {
  Advertising: "ads",
  Analytics: "trackers", Social: "trackers", Cryptomining: "trackers", Email: "trackers", EmailAggressive: "trackers",
  FingerprintingInvasive: "trackers", FingerprintingGeneral: "trackers",
};
const RANK = { ads: 0, trackers: 1, other: 2 };

// The list as background.js stores it, { names: [company], index: { domain: companyIndex * 3 + kind } },
// with kind in KINDS order. A plain object of numbers parses about twice as fast as
// domain/company pairs, and each name is stored once.
export function indexTrackers(json) {
  const best = new Map(); // domain -> [kind, company]
  for (const [category, entries] of Object.entries(json.categories)) {
    const kind = KIND[category] ?? "other";
    for (const entry of entries) for (const [company, sites] of Object.entries(entry)) {
      // Besides its URL -> domains, an entry can hold flags like "dnt": "eff"
      for (const domains of Object.values(sites)) if (Array.isArray(domains)) for (const d of domains) {
        // A domain can be in several categories. Ads win, then trackers.
        const had = best.get(d);
        if (!had || RANK[kind] < RANK[had[0]]) best.set(d, [kind, company]);
      }
    }
  }
  const names = [], ids = new Map(), index = {};
  for (const [d, [kind, company]] of best) {
    let id = ids.get(company);
    if (id === undefined) ids.set(company, id = names.push(company) - 1);
    index[d] = id * 3 + KINDS.indexOf(kind);
  }
  return { names, index };
}

// [kind, company], or ["other", its domain] when the list doesn't have it (or there's no list)
export function classify(host, list) {
  // Every candidate has a dot, so none can match a property like "constructor"
  if (list) for (let h = host; h.includes("."); h = h.slice(h.indexOf(".") + 1)) {
    const code = list.index[h];
    if (code !== undefined) return [KINDS[code % 3], list.names[Math.floor(code / 3)]];
  }
  return ["other", baseDomain(host)];
}

// Close enough to the registrable domain for a label: example.com, example.co.uk
export function baseDomain(host) {
  if (/^[\d.]+$|:/.test(host)) return host;
  const parts = host.split(".");
  const n = parts.length > 2 && parts.at(-1).length === 2 && parts.at(-2).length <= 3 ? 3 : 2;
  return parts.slice(-n).join(".");
}
