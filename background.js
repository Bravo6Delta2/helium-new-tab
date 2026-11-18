// Counts the requests uBlock Origin blocks. Extensions can't read each other's storage, but
// every extension watching webRequest sees a request another one cancelled, with this error.
const BLOCKED = "net::ERR_BLOCKED_BY_CLIENT";
// uBO swaps some scripts for harmless stand-ins from its own package instead of cancelling them
const STAND_IN = /^chrome-extension:\/\/[a-p]{32}\/web_accessible_resources\//;

// Disconnect's list (CC BY-NC-SA 4.0) says which company a domain belongs to and what it does
const TRACKER_LIST = "https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/services.json";
const LIST_TTL = 7 * 24 * 3600_000;
// Its categories, folded into the page's three. The rest (Content, Anti-fraud,
// ConsentManagers) and unlisted domains count as "other".
const KIND = {
  Advertising: "ads",
  Analytics: "trackers", Social: "trackers", Cryptomining: "trackers", Email: "trackers", EmailAggressive: "trackers",
  FingerprintingInvasive: "trackers", FingerprintingGeneral: "trackers",
};
const RANK = { ads: 0, trackers: 1, other: 2 };
// A day's sources hold counts per kind in this order, as a company like Google can be both.
// app.js reads them in the same order (its KINDS), so keep the two alike.
const KINDS = ["trackers", "ads", "other"];

// Storage: "start" is the day counting began, and each day has its own "day:YYYY-MM-DD" key
// holding { trackers, ads, other, sources }. Only today changes. The page shows up to 90 days.
// "historyRemoved" is when history was last deleted, and "activity" the page's browsing
// activity cache (see app.js), which the worker drops whenever history is deleted.
// "trackerList" is { at, names: [company], index: { domain: companyIndex * 3 + kind } }, with
// kind in KINDS order. A plain object of numbers parses about twice as fast as domain/company
// pairs, and each name is stored once.
const KEEP_DAYS = 90;
const days = {};              // the days touched since the worker started
let list = null;

const dayOf = (t) => new Date(t).toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const today = () => dayOf(Date.now());

// Chrome stops the worker after 30 s idle and starts it for the next event, blocked or not.
// Storage is only read once a request is actually blocked.
// A failed load is tried again on the next block, rather than never.
let ready = null;
const init = () => ready ??= load().catch((err) => { ready = null; throw err; });

async function load() {
  const got = await chrome.storage.local.get(["start", "trackerList", "historyRemoved"]);
  // No start means a fresh install, or data from an earlier version: start clean, but keep
  // the page's activity cache and note of deleted history, and the tracker list (an old
  // one is replaced below)
  if (!got.start) {
    const keep = ["activity", "historyRemoved", "trackerList"];
    await chrome.storage.local.remove((await chrome.storage.local.getKeys()).filter((k) => !keep.includes(k)));
    await chrome.storage.local.set({ start: today() });
  }
  // Lists saved by earlier versions have no index. Without a list, wait (a while) for one so
  // the first blocks get their categories. A stale one keeps working while it refreshes.
  list = got.trackerList?.index ? got.trackerList : null;
  if (!list) await updateTrackerList();
  else if (Date.now() - list.at > LIST_TTL) updateTrackerList();
}

// A day not touched since the worker started is read from storage first, so its counts
// add to what's saved rather than replace it. That's also the case when the clock goes
// back to a day already counted. A failed read is forgotten, so the next block tries again.
const loading = {};
function dayEntry(day) {
  if (days[day]) return days[day];
  return loading[day] ??= chrome.storage.local.get("day:" + day).then((got) => {
    const saved = got["day:" + day];
    if (!saved) prune().catch(() => {});
    // No prototype, so a source like "constructor" is just a name
    return days[day] ??= saved
      ? { ...saved, sources: Object.assign(Object.create(null), saved.sources) }
      : { trackers: 0, ads: 0, other: 0, sources: Object.create(null) };
  }).finally(() => { delete loading[day]; });
}

// Drops days past KEEP_DAYS, when a day's first block is counted
async function prune() {
  const cutoff = "day:" + dayOf(Date.now() - KEEP_DAYS * 86_400_000);
  const old = (await chrome.storage.local.getKeys()).filter((k) => k.startsWith("day:") && k < cutoff);
  if (old.length) await chrome.storage.local.remove(old);
}

async function updateTrackerList() {
  try {
    const res = await fetch(TRACKER_LIST, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const best = new Map(); // domain -> [kind, company]
    for (const [category, entries] of Object.entries((await res.json()).categories)) {
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
    list = { at: Date.now(), names, index };
    await chrome.storage.local.set({ trackerList: list });
  } catch {
    // Unlisted until the next time the worker starts
  }
}

function classify(host) {
  // Every candidate has a dot, so none can match a property like "constructor"
  if (list) for (let h = host; h.includes("."); h = h.slice(h.indexOf(".") + 1)) {
    const code = list.index[h];
    if (code !== undefined) return [KINDS[code % 3], list.names[Math.floor(code / 3)]];
  }
  return ["other", baseDomain(host)];
}

// Close enough to the registrable domain for a label: example.com, example.co.uk
function baseDomain(host) {
  if (/^[\d.]+$|:/.test(host)) return host;
  const parts = host.split(".");
  const n = parts.length > 2 && parts.at(-1).length === 2 && parts.at(-2).length <= 3 ? 3 : 2;
  return parts.slice(-n).join(".");
}

// Allowed in incognito, the worker also sees incognito tabs' requests, which aren't counted.
// webRequest doesn't say which those are, so a tab is looked up once (its incognito flag
// needs no "tabs" permission) and remembered, as a tab never changes window type. Not
// allowed, which is the default, nothing is looked up. A tab that can't be looked up, like
// one already closed, isn't counted either.
let incognitoAllowed = null;
const incognitoTabs = new Map(); // tabId -> Promise<boolean>
async function isIncognito(tabId) {
  if (!await (incognitoAllowed ??= chrome.extension.isAllowedIncognitoAccess().catch(() => true))) return false;
  let known = incognitoTabs.get(tabId);
  if (!known) {
    incognitoTabs.set(tabId, known = chrome.tabs.get(tabId).then((tab) => tab.incognito !== false));
    // Forgotten when the lookup fails, as a tab can be looked up before it's ready
    known.catch(() => incognitoTabs.delete(tabId));
  }
  return known;
}

async function countBlocked(details) {
  // Requests from tabs only, not from extensions (this page's weather, for one)
  if (details.tabId < 0) return;
  if (await isIncognito(details.tabId)) return;
  await init();
  const [kind, name] = classify(new URL(details.url).hostname);
  const day = today();
  const entry = await dayEntry(day);
  entry[kind]++;
  (entry.sources[name] ??= [0, 0, 0])[KINDS.indexOf(kind)]++;
  dirty.add(day);
  save();
}

// Every open new tab re-renders on a save, so blocks are batched for 5 s.
// A save writes only the day that changed.
const dirty = new Set();
let saveTimer = null;
function save() {
  saveTimer ??= setTimeout(() => {
    saveTimer = null;
    const changes = {}, saving = [...dirty];
    for (const day of saving) changes["day:" + day] = days[day];
    dirty.clear();
    // Kept for the save after the next block if this one fails, rather than retried in a loop
    chrome.storage.local.set(changes).catch(() => {
      for (const day of saving) dirty.add(day);
    });
  }, 5000);
}

// Listeners have to be added on the worker's first turn, so Chrome can wake it for them.
// uBO blocks and swaps subresources. A page it blocks gets its warning page instead, which
// isn't counted, so leaving out main_frame skips the most common redirects and cancelled
// loads (link shorteners, http -> https, navigating away) without waking the worker.
const filter = {
  urls: ["<all_urls>"],
  types: Object.values(chrome.webRequest.ResourceType).filter((t) => t !== "main_frame"),
};
// A redirect can't be filtered by where it goes, only by type: these are the ones uBO has
// stand-ins for (noop.js, 1x1.gif, noop.html, noop.txt, noop.css, noop.mp3 and the like).
const STAND_IN_TYPES = ["script", "image", "sub_frame", "xmlhttprequest", "stylesheet", "media", "object", "other"];
// A block that can't be counted (storage failing, an unknown tab) is dropped.
const count = (d) => { countBlocked(d).catch(() => {}); };
chrome.webRequest.onErrorOccurred.addListener((d) => { if (d.error === BLOCKED) count(d); }, filter);
chrome.webRequest.onBeforeRedirect.addListener((d) => { if (STAND_IN.test(d.redirectUrl)) count(d); },
  { ...filter, types: filter.types.filter((t) => STAND_IN_TYPES.includes(t)) });

// Deleting any history wakes the worker, even with no new tab open, and the page's
// activity cache goes with it, as it holds the sites visited. The stamp comes first: a tab
// saving a cache it built from older history checks it after saving, and removes its copy.
// Each deletion gets a new stamp, even two in the same millisecond.
let lastRemoved = 0;
chrome.history.onVisitRemoved.addListener(async () => {
  lastRemoved = Math.max(Date.now(), lastRemoved + 1);
  await chrome.storage.local.set({ historyRemoved: lastRemoved }).catch(() => {});
  await chrome.storage.local.remove("activity").catch(() => {});
});
