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
// A day's sources hold counts per kind in this order, as a company like Google can be both
const KINDS = ["trackers", "ads", "other"];

// Storage: "start" is the day counting began, and each day has its own "day:YYYY-MM-DD" key
// holding { trackers, ads, other, sources }. Only today changes. The page shows up to 90 days.
const KEEP_DAYS = 90;
const days = {};              // the days touched since the worker started
let trackers = new Map();     // domain -> [kind, company]

const dayOf = (t) => new Date(t).toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const today = () => dayOf(Date.now());
const ready = load();

async function load() {
  const day = today();
  let got = await chrome.storage.local.get(["start", "trackerList", "day:" + day]);
  // No start means a fresh install, or data from an earlier version: start clean
  if (!got.start) {
    await chrome.storage.local.clear();
    got = { start: day };
    await chrome.storage.local.set({ start: day });
  }
  if (got["day:" + day]) days[day] = got["day:" + day];
  trackers = new Map(got.trackerList?.domains);
  if (!got.trackerList || Date.now() - got.trackerList.at > LIST_TTL) updateTrackerList();
  prune();
}

// Drops days past KEEP_DAYS, each time the worker starts
async function prune() {
  const cutoff = "day:" + dayOf(Date.now() - KEEP_DAYS * 86_400_000);
  const old = (await chrome.storage.local.getKeys()).filter((k) => k.startsWith("day:") && k < cutoff);
  if (old.length) await chrome.storage.local.remove(old);
}

async function updateTrackerList() {
  try {
    const res = await fetch(TRACKER_LIST);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const map = new Map();
    for (const [category, entries] of Object.entries((await res.json()).categories)) {
      const kind = KIND[category] ?? "other";
      for (const entry of entries) for (const [company, sites] of Object.entries(entry)) {
        // Besides its URL -> domains, an entry can hold flags like "dnt": "eff"
        for (const domains of Object.values(sites)) if (Array.isArray(domains)) for (const d of domains) {
          // A domain can be in several categories. Ads win, then trackers.
          const had = map.get(d);
          if (!had || RANK[kind] < RANK[had[0]]) map.set(d, [kind, company]);
        }
      }
    }
    trackers = map;
    await chrome.storage.local.set({ trackerList: { at: Date.now(), domains: [...map] } });
  } catch {
    // Unlisted until the next time the worker starts
  }
}

function classify(host) {
  for (let h = host; h.includes("."); h = h.slice(h.indexOf(".") + 1)) {
    const hit = trackers.get(h);
    if (hit) return hit;
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

async function countBlocked(details) {
  // Requests from tabs only, not from extensions (this page's weather, for one)
  if (details.tabId < 0) return;
  await ready;
  const [kind, name] = classify(new URL(details.url).hostname);
  const day = today();
  const entry = days[day] ??= { trackers: 0, ads: 0, other: 0, sources: {} };
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
    const changes = {};
    for (const day of dirty) changes["day:" + day] = days[day];
    dirty.clear();
    chrome.storage.local.set(changes);
  }, 5000);
}

// Listeners have to be added on the worker's first turn, so Chrome can wake it for them
const all = { urls: ["<all_urls>"] };
chrome.webRequest.onErrorOccurred.addListener((d) => { if (d.error === BLOCKED) countBlocked(d); }, all);
chrome.webRequest.onBeforeRedirect.addListener((d) => { if (STAND_IN.test(d.redirectUrl)) countBlocked(d); }, all);
