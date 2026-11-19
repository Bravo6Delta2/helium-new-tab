// Defaults. Time format, temperature unit, search engine and cities can be changed in
// Settings (⌥ ,), and what's picked there wins over these. Settings can also add search
// engines and bangs to the ones here.
const CONFIG = {
  hour12: false,
  fahrenheit: false,

  search: {
    engine: "Google",
    // The engines Settings offers. Add your own as name: URL, with %s for the search terms.
    engines: {
      Google: "https://www.google.com/search?q=%s",
      DuckDuckGo: "https://duckduckgo.com/?q=%s",
      Brave: "https://search.brave.com/search?q=%s",
      Bing: "https://www.bing.com/search?q=%s",
      Kagi: "https://kagi.com/search?q=%s",
      Startpage: "https://www.startpage.com/do/search?query=%s",
      Ecosia: "https://www.ecosia.org/search?q=%s",
    },
    // Bangs come from Helium's own list (the one its address bar uses).
    // A bang that isn't in it is passed to DuckDuckGo, which knows a few thousand more.
    bangList: "https://services.helium.imput.net/bangs.json",
    unknownBang: "https://duckduckgo.com/?q=%s",
  },
  // Your own bangs. These win over Helium's list, and ones added in Settings win over these, e.g.
  // cl: ["Claude", "https://claude.ai/new?q=%s"],
  bangs: {
  },

  // The left and right slots. null leaves a slot empty. Weather needs coordinates,
  // e.g. { name: "Tokyo", lat: 35.6895, lon: 139.6917 }, and world clocks a time zone,
  // e.g. { name: "Tokyo", country: "Japan", tz: "Asia/Tokyo" }
  cities: [null, null],
  clocks: [null, null],

  // A blocked request never loads, so bandwidth and time saved are estimates:
  // rough averages per blocked request, about the ratios Brave's new tab uses.
  ublock: { bytesPerBlock: 45_000, msPerBlock: 50 },
};

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (err) { console.warn(`Couldn't save "${k}":`, err); return false; }
  },
};
// Older versions kept the browsing activity cache here, where background.js can't remove
// it when history is deleted. It moved to extension storage (see buildActivity).
try { localStorage.removeItem("activity"); } catch {}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// A zone the browser doesn't know makes every date function given it throw
const validTz = (tz) => {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};

// The engines in CONFIG, then yours from Settings. Names in that order, as an object puts
// keys like "1" first.
const engineNames = (s = settings) => [...Object.keys(CONFIG.search.engines), ...s.engines.map((e) => e.name)];
const allEngines = (s = settings) =>
  ({ ...CONFIG.search.engines, ...Object.fromEntries(s.engines.map((e) => [e.name, e.url])) });
// CONFIG's, or the first engine if that one's gone
const defaultEngine = () =>
  Object.hasOwn(CONFIG.search.engines, CONFIG.search.engine) ? CONFIG.search.engine : Object.keys(CONFIG.search.engines)[0];

// Two slots each, left and right. Once saved, these win over CONFIG.
const SLOTS = ["Left", "Right"];
function readSettings() {
  const s = {
    weather: CONFIG.cities, clocks: CONFIG.clocks,
    hour12: CONFIG.hour12, fahrenheit: CONFIG.fahrenheit, engine: CONFIG.search.engine,
    engines: [], bangs: [],
    ...store.get("settings"),
  };
  for (const k of ["weather", "clocks"]) s[k] = SLOTS.map((_, i) => s[k]?.[i] || null);
  s.clocks = s.clocks.map((c) => c && validTz(c.tz) ? c : null);
  // Your own engines ({ name, url }) and bangs ({ t, name, url }). Anything malformed is dropped.
  const str = (v) => typeof v === "string" && v !== "";
  s.engines = (Array.isArray(s.engines) ? s.engines : []).filter((e) => str(e?.name) && str(e.url));
  s.bangs = (Array.isArray(s.bangs) ? s.bangs : []).filter((b) => str(b?.t) && str(b.url) && typeof b.name === "string");
  // An engine since removed falls back to the first one
  if (!Object.hasOwn(allEngines(s), s.engine)) s.engine = defaultEngine();
  return s;
}
const settings = readSettings();

// "15:05", or "3:05 PM"
const fmtTime = (d, timeZone) => d.toLocaleTimeString(settings.hour12 ? "en-US" : "en-GB",
  { hour: settings.hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12: settings.hour12, timeZone });

// Tabler icons (MIT), the set Prism uses. Only the path data, wrapped by icon().
const ICONS = {
  "search": '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
  "sun": '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
  "moon": '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"/>',
  "cloud": '<path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878"/>',
  "cloud-fog": '<path d="M7 16a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-12"/><path d="M5 20l14 0"/>',
  "cloud-rain": '<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7"/><path d="M11 13v2m0 3v2m4 -5v2m0 3v2"/>',
  "snowflake": '<path d="M10 4l2 1l2 -1"/><path d="M12 2v6.5l3 1.72"/><path d="M17.928 6.268l.134 2.232l1.866 1.232"/><path d="M20.66 7l-5.629 3.25l.01 3.458"/><path d="M19.928 14.268l-1.866 1.232l-.134 2.232"/><path d="M20.66 17l-5.629 -3.25l-2.99 1.738"/><path d="M14 20l-2 -1l-2 1"/><path d="M12 22v-6.5l-3 -1.72"/><path d="M6.072 17.732l-.134 -2.232l-1.866 -1.232"/><path d="M3.34 17l5.629 -3.25l-.01 -3.458"/><path d="M4.072 9.732l1.866 -1.232l.134 -2.232"/><path d="M3.34 7l5.629 3.25l2.99 -1.738"/>',
  "cloud-storm": '<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1"/><path d="M13 14l-2 4l3 0l-2 4"/>',
  "wind": '<path d="M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24"/><path d="M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24"/><path d="M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24"/>',
  "umbrella": '<path d="M4 12a8 8 0 0 1 16 0l-16 0"/><path d="M12 12v6a2 2 0 0 0 4 0"/>',
  "leaf": '<path d="M5 21c.5 -4.5 2.5 -8 7 -10"/><path d="M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3z"/>',
  "flower": '<path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M12 2a3 3 0 0 1 3 3c0 .562 -.259 1.442 -.776 2.64l-.724 1.36l1.76 -1.893c.499 -.6 .922 -1 1.27 -1.205a2.968 2.968 0 0 1 4.07 1.099a3.011 3.011 0 0 1 -1.09 4.098c-.374 .217 -.99 .396 -1.846 .535l-2.664 .366l2.4 .326c1 .145 1.698 .337 2.11 .576a3.011 3.011 0 0 1 1.09 4.098a2.968 2.968 0 0 1 -4.07 1.098c-.348 -.202 -.771 -.604 -1.27 -1.205l-1.76 -1.893l.724 1.36c.516 1.199 .776 2.079 .776 2.64a3 3 0 0 1 -6 0c0 -.562 .259 -1.442 .776 -2.64l.724 -1.36l-1.76 1.893c-.499 .601 -.922 1 -1.27 1.205a2.968 2.968 0 0 1 -4.07 -1.098a3.011 3.011 0 0 1 1.09 -4.098c.374 -.218 .99 -.396 1.846 -.536l2.664 -.366l-2.4 -.325c-1 -.145 -1.698 -.337 -2.11 -.576a3.011 3.011 0 0 1 -1.09 -4.099a2.968 2.968 0 0 1 4.07 -1.099c.348 .203 .771 .604 1.27 1.205l1.76 1.894c-1 -2.292 -1.5 -3.625 -1.5 -4a3 3 0 0 1 3 -3z"/>',
  "droplet": '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546"/>',
  "sunrise": '<path d="M3 17h1m16 0h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7m-9.7 5.7a4 4 0 0 1 8 0"/><path d="M3 21l18 0"/><path d="M12 9v-6l3 3m-6 0l3 -3"/>',
  "sunset": '<path d="M3 13h1"/><path d="M20 13h1"/><path d="M5.6 6.6l.7 .7"/><path d="M18.4 6.6l-.7 .7"/><path d="M8 13a4 4 0 1 1 8 0"/><path d="M3 17h18"/><path d="M7 20h5"/><path d="M16 20h1"/><path d="M12 5v-1"/>',
  // Prism's own IconBang
  "bang": '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/><path d="M10 13v.01"/><path d="M10 7v3"/>',
  "settings": '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/>',
  "world": '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>',
  "bookmark": '<path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z"/>',
  "activity": '<path d="M3 12h4l3 8l4 -16l3 8h4"/>',
  "chevron-down": '<path d="M6 9l6 6l6 -6"/>',
  "x": '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  "map-pin": '<path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"/>',
  "clock": '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>',
  "shield": '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/>',
  "download": '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>',
  "hourglass": '<path d="M6.5 7h11"/><path d="M6.5 17h11"/><path d="M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z"/><path d="M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1z"/>',
};
const icon = (name, size = 18) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/* ---------- background ---------- */
const shimmer = window.startShimmer ? startShimmer($("shimmer")) : { emphasize() {} };

/* ---------- clock ---------- */
function tick() {
  const now = new Date();
  // Set first, so a throw while painting can't stop the clock
  setTimeout(tick, 1000 - now.getMilliseconds());
  paintTime(now);
}
// Only touch the DOM when the text changes, so it stays selectable
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
function paintTime(now) {
  // AM and PM are set smaller, so the big clock keeps its size
  const time = esc(fmtTime(now)).replace(/\s?([AP]M)$/, '<span class="ampm">$1</span>');
  if ($("time").innerHTML !== time) $("time").innerHTML = time;
  setText($("date"), now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  // A weather panel's clock shows the time in that city
  for (const el of document.querySelectorAll("[data-clock]")) setText(el, fmtTime(now, el.dataset.clock || undefined));
  renderClocks(now);
}

/* ---------- world clocks ---------- */
// Minutes the zone is ahead of UTC at d, from its wall clock read back as UTC
const wallClocks = new Map(); // zone -> its formatter, as the clocks ask every second
function utcOffset(tz, d) {
  let fmt = wallClocks.get(tz);
  if (!fmt) wallClocks.set(tz, fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }));
  const parts = {};
  for (const { type, value } of fmt.formatToParts(d)) parts[type] = Number(value);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wall - Math.floor(d / 1000) * 1000) / 60_000);
}
// Minutes the zone is ahead of local time
const tzOffset = (tz, d) => utcOffset(tz, d) + d.getTimezoneOffset();
function offsetLabel(min) {
  if (!min) return "Same time";
  const a = Math.abs(min);
  return `${min > 0 ? "+" : "−"}${Math.floor(a / 60)}h${a % 60 ? ` ${a % 60}m` : ""}`;
}

let clocksHtml = "";
function renderClocks(now) {
  const html = settings.clocks.map((city, i) => city ? `
    <div class="wc${i ? " end" : ""}">
      <h6>${esc(city.name)}</h6>
      <div class="wc-time">${fmtTime(now, city.tz)}</div>
      <p>${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: city.tz })} · ${offsetLabel(tzOffset(city.tz, now))}</p>
    </div>` : "").join("");
  // Only touch the DOM when the minute changes, so text stays selectable
  if (html !== clocksHtml) $("clocks").innerHTML = clocksHtml = html;
}
tick();

/* ---------- search + bangs ---------- */
const q = $("q");
$("search-icon").innerHTML = icon("search");

// Every %s, as a template can use the terms twice. A function as the replacement, so "$&"
// and the like in the terms stay as typed.
function fill(template, terms) {
  return template.replaceAll("%s", () => encodeURIComponent(terms));
}

function findBang(text) {
  // A bang can sit anywhere, like DuckDuckGo: "!yt lofi" or "lofi !yt"
  const m = text.match(/(?:^|\s)!(\S+)/);
  return m ? { key: m[1].toLowerCase(), terms: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() } : null;
}

// "package.json" or "app.js" alone is more likely a file name to look up than a site.
// Extensions that are also top-level domains (.md, .rs, .sh, .py, .zip) are left as sites.
const FILE_EXT = /^[\w-]+\.(json|js|mjs|cjs|ts|tsx|jsx|rb|go|java|kt|swift|c|h|cpp|hpp|cs|php|txt|csv|yml|yaml|toml|ini|lock|log|css|scss|html|xml|svg|png|jpe?g|gif|webp|pdf|exe|dmg)$/i;

function looksLikeUrl(text) {
  return /^[a-z][\w+.-]*:\/\//i.test(text)
    || /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]\S*)?$/i.test(text)
    || (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(text) && !FILE_EXT.test(text));
}

// Helium's list is Kagi's bangs plus Helium's extras. "f" holds Kagi's format flags.
// Helium keeps its copy in memory only, so the page can't borrow it. Instead the list is
// left to the browser's HTTP cache (the server allows a day, then revalidates by ETag),
// and only fetched once a bang is typed.
const FLAG = { OPEN_BASE_PATH: 1, OPEN_SNAP_DOMAIN: 2, ENCODE: 4, SPACE_TO_PLUS: 8 };
let heliumBangs = null; // Map of trigger -> { s: name, ts: [trigger], u: url template, f: flags }
let heliumBangList = []; // The same bangs in a list, for suggestions
let bangsLoading = null, bangsFailedAt = 0;
const BANGS_RETRY = 30_000;

// Older versions kept a second copy in localStorage
try { localStorage.removeItem("bangs"); } catch {}

function loadHeliumBangs() {
  // Offline, every keystroke would ask again. Wait a little between tries.
  if (!bangsLoading && Date.now() - bangsFailedAt < BANGS_RETRY) return Promise.resolve();
  bangsLoading ??= (async () => {
    try {
      const res = await fetch(CONFIG.search.bangList);
      if (!res.ok) throw new Error("HTTP " + res.status);
      // The file is JSON with a license header in // comments and trailing commas
      const text = (await res.text()).replace(/^\/\/.*$/gm, "").replace(/,(\s*[\]}])/g, "$1");
      const list = JSON.parse(text), map = new Map();
      for (const b of list) for (const t of b.ts) map.set(t, b);
      heliumBangs = map;
      heliumBangList = list;
      updateBangHint();
      if (document.activeElement === q) updateSuggestions();
    } catch {
      // Unknown bangs still work through DuckDuckGo. Try again on a later bang.
      bangsLoading = null;
      bangsFailedAt = Date.now();
    }
  })();
  return bangsLoading;
}

// [name, url template]. Bangs from Settings win over CONFIG's. Own properties only, so
// "!constructor" isn't Object's.
function ownBang(key) {
  const b = settings.bangs.find((b) => b.t === key);
  if (b) return [b.name, b.url];
  return Object.hasOwn(CONFIG.bangs, key) ? CONFIG.bangs[key] : null;
}

function lookupBang(key) {
  const own = ownBang(key);
  // Terms encoded the way engines' are, so "New York" in a path stays "New%20York". One
  // without %s always opens that page, as is.
  if (own) return { s: own[0], u: own[1].replaceAll("%s", "{searchTerms}"), f: own[1].includes("%s") ? FLAG.ENCODE | FLAG.OPEN_SNAP_DOMAIN : 0 };
  return heliumBangs?.get(key) || null;
}

function runBang(bang, terms) {
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

function resolve(raw) {
  const text = raw.trim();
  if (!text) return null;
  const bang = findBang(text);
  if (bang) {
    const known = lookupBang(bang.key);
    if (!known) return fill(CONFIG.search.unknownBang, text);
    const url = runBang(known, bang.terms);
    if (url) return url;
  }
  if (looksLikeUrl(text)) {
    if (/^[a-z][\w+.-]*:\/\//i.test(text)) return text;
    // Local servers and routers rarely have certificates
    return (/^(localhost|\d{1,3}(\.\d{1,3}){3})\b/i.test(text) ? "http://" : "https://") + text;
  }
  return fill(allEngines()[settings.engine] ?? CONFIG.search.engines[defaultEngine()], text);
}

function updateBangHint() {
  const bang = findBang(q.value);
  if (bang && !heliumBangs) loadHeliumBangs();
  let label = "";
  if (bang?.key) label = lookupBang(bang.key)?.s ?? (heliumBangs ? `!${bang.key} via DuckDuckGo` : "");
  $("bang-chip").textContent = label;
  $("search-icon").innerHTML = icon(bang?.key ? "bang" : "search");
}
q.addEventListener("input", () => {
  // The rows on screen are for the old text until the new ones arrive, so Enter searches
  if (active !== -1) { active = -1; paintSuggestions(); }
  updateBangHint();
  updateSuggestions();
});

function go(url, newTab) {
  shimmer.emphasize();
  // A page can't open chrome:// and the like itself, but the tabs API can
  if (!/^https?:/i.test(url) && globalThis.chrome?.tabs) {
    if (newTab) chrome.tabs.create({ url });
    else chrome.tabs.update({ url });
  } else if (newTab) window.open(url, "_blank");
  else location.href = url;
}

// Like the address bar's "Switch to tab". This new tab closes, unless it has been used to
// go somewhere and has a back button to keep.
async function switchTab(tab) {
  let t;
  try {
    // Closed, or gone somewhere else, since it was suggested: the page opens here instead
    const live = await chrome.tabs.get(tab.id);
    if ((live.pendingUrl || live.url) !== tab.url) throw 0;
    t = await chrome.tabs.update(tab.id, { active: true });
  } catch {
    return go(tab.url);
  }
  // Its window now, as it may have been moved to another since
  await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
  if (history.length <= 1) chrome.tabs.getCurrent().then((t) => t && chrome.tabs.remove(t.id)).catch(() => {});
}

q.addEventListener("keydown", async (e) => {
  // Enter and the arrows belong to the IME while it's composing
  if (e.isComposing || e.keyCode === 229) return;
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) {
    e.preventDefault();
    // Not into rows still showing for what was typed before, which are about to change
    if (rowsFor !== q.value) return;
    // -1 is the text as typed, between the last row and the first
    const n = rows.length + 1;
    active = ((active + 1 + (e.key === "ArrowDown" ? 1 : -1) + n) % n) - 1;
    paintSuggestions();
  } else if (e.key === "Tab" && !e.shiftKey && rows[0]?.bang) {
    e.preventDefault();
    pick(rows[Math.max(active, 0)]);
  } else if (e.key === "Escape") {
    // Close the suggestions first, then clear the box. A search box clears itself on Escape.
    if (rows.length) { e.preventDefault(); return closeSuggestions(); }
    q.value = ""; updateBangHint(); q.blur();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (rows[active]) return pick(rows[active], e.metaKey || e.ctrlKey);
    const text = q.value;
    // The list may still be loading. Give it a moment.
    if (!heliumBangs && findBang(text) && !ownBang(findBang(text).key)) {
      await Promise.race([loadHeliumBangs(), new Promise((r) => setTimeout(r, 1500))]);
      // Cleared or edited while waiting: that's a new search, with its own Enter
      if (q.value !== text) return;
    }
    const url = resolve(text);
    if (url) go(url, e.metaKey || e.ctrlKey);
  }
});

/* ---------- suggestions ---------- */
// Bangs while one is being typed, otherwise open tabs and pages from history and bookmarks.
// Nothing is picked until an arrow key says so, so Enter still searches what was typed.
const suggest = $("suggest");
const SUGGEST_MAX = 6;
let rows = [], rowsFor = "", active = -1, suggestSeq = 0;

// The "!yt" the caret is in, if any
function caretBang() {
  const end = q.value.slice(q.selectionStart).match(/^\S*/)[0].length + q.selectionStart;
  const m = q.value.slice(0, end).match(/(?:^|\s)!(\S+)$/);
  return m ? { prefix: m[1].toLowerCase(), start: end - m[1].length - 1, end } : null;
}

// Bangs with a trigger starting with prefix. Kagi's list has no popularity, so an exact
// match comes first, then shorter triggers, then bangs with more aliases (YouTube has 9).
function matchBangs(prefix) {
  // Settings' before CONFIG's, so the first of a trigger is the one used
  const own = [...settings.bangs.map((b) => [b.t, b.name, b.url]), ...Object.entries(CONFIG.bangs).map(([t, [s, u]]) => [t, s, u])]
    .filter(([t], i, all) => t.startsWith(prefix) && all.findIndex(([x]) => x === t) === i)
    .map(([t, s, u]) => ({ t, s, u, n: Infinity }));
  const found = [];
  for (const b of heliumBangList) {
    let t = null;
    // Your own bangs win over Helium's for the same trigger, which leaves its other ones
    for (const x of b.ts) if (x.startsWith(prefix) && (!t || x.length < t.length) && !ownBang(x)) t = x;
    if (t) found.push({ t, s: b.s, u: b.u, n: b.ts.length });
  }
  return [...own, ...found]
    .sort((a, b) => (b.t === prefix) - (a.t === prefix) || a.t.length - b.t.length || b.n - a.n)
    .slice(0, SUGGEST_MAX)
    .map((b) => ({ bang: b.t, title: b.s, url: b.u.replace(/\{searchTerms\}|%s/g, "") }));
}

// Result pages of the engines in Settings, which would crowd out the pages themselves.
// Only engines with the terms in the query: before a path's "%s", as in
// "https://en.wikipedia.org/wiki/%s", is every page of the site. What follows the terms,
// like "&view=search", has to be there too.
const isSearchPage = (url) => Object.values(allEngines()).some((e) => {
  const i = e.indexOf("%s"), prefix = e.slice(0, i);
  return /[?#]/.test(prefix) && url.startsWith(prefix) && url.slice(i).includes(e.slice(i + 2));
});
// The host without www, and with the port if asked
const hostOf = (url, port = false) => {
  try { const u = new URL(url); return (port ? u.host : u.hostname).replace(/^www\./, ""); } catch { return ""; }
};
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Tabs in every window but this one, leaving out other new tabs and incognito ones
async function openTabs() {
  const [tabs, self] = await Promise.all([chrome.tabs.query({}), chrome.tabs.getCurrent()]);
  return tabs.filter((t) => t.id !== self?.id && !t.incognito && t.url && !/^chrome:\/\/new-?tab\b/i.test(t.url));
}

async function matchPages(text) {
  const [visits, marks, tabs] = await Promise.all([
    chrome.history.search({ text, startTime: 0, maxResults: 100 }),
    chrome.bookmarks ? chrome.bookmarks.search(text).catch(() => []) : [],
    openTabs().catch(() => []),
  ]);
  const words = text.toLowerCase().split(/\s+/);
  const byUrl = new Map();
  for (const h of visits) byUrl.set(h.url, { url: h.url, title: h.title, weight: h.typedCount * 3 + h.visitCount });
  for (const b of marks) {
    if (!b.url) continue; // a folder
    const page = byUrl.get(b.url) ?? { url: b.url, weight: 0 };
    byUrl.set(b.url, { ...page, title: b.title || page.title, bookmark: true });
  }
  // A page that's open switches to its tab. Tabs with every typed word in their title or
  // address are added, as history may not have them (yet).
  for (const t of tabs) {
    const page = byUrl.get(t.url);
    if (page) page.tab ??= t;
    else if (words.every((w) => `${t.title} ${t.url}`.toLowerCase().includes(w))) {
      byUrl.set(t.url, { url: t.url, title: t.title, weight: 0, tab: t });
    }
  }
  // Pages whose site starts with what was typed first, then a word in the title.
  // Within each, open tabs, then bookmarks, then the most visited.
  const first = words[0];
  const word = new RegExp("(^|\\W)" + reEscape(first), "i");
  const tier = (p) => hostOf(p.url).startsWith(first) ? 0 : word.test(p.title) ? 1 : 2;
  return [...byUrl.values()]
    .filter((p) => !/^(javascript|chrome-extension):/i.test(p.url) && !isSearchPage(p.url))
    .map((p) => ({ ...p, tier: tier(p) }))
    .sort((a, b) => a.tier - b.tier || !!b.tab - !!a.tab || (b.bookmark ?? 0) - (a.bookmark ?? 0) || b.weight - a.weight)
    .slice(0, SUGGEST_MAX);
}

async function updateSuggestions() {
  const seq = ++suggestSeq, value = q.value;
  const text = value.trim(), token = caretBang();
  let next = [];
  if (token) next = matchBangs(token.prefix);
  // Opened as a plain file:// page there's no history to search
  else if (text && !findBang(text) && globalThis.chrome?.history) next = await matchPages(text).catch(() => []);
  // A newer keystroke may have finished first
  if (seq !== suggestSeq || document.activeElement !== q) return;
  rows = next;
  rowsFor = value;
  active = -1;
  paintSuggestions();
}

function closeSuggestions() {
  suggestSeq++;
  rows = [];
  active = -1;
  paintSuggestions();
}

// Text with the typed words in bold
function mark(text, words) {
  words = words.filter(Boolean);
  if (!words.length) return esc(text);
  let out = "", last = 0;
  for (const m of text.matchAll(new RegExp(words.map(reEscape).join("|"), "gi"))) {
    out += esc(text.slice(last, m.index)) + `<b>${esc(m[0])}</b>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

// Chrome's favicon cache, which only extension pages can reach
const favicon = (url) => globalThis.chrome?.runtime?.id
  ? `<img class="fav" src="${esc(chrome.runtime.getURL("/_favicon/?pageUrl=" + encodeURIComponent(url) + "&size=32"))}" alt="">`
  : `<span class="fav">${icon("world", 16)}</span>`;
const prettyUrl = (url) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

function paintSuggestions() {
  const words = rows[0]?.bang ? [] : q.value.trim().split(/\s+/);
  suggest.innerHTML = rows.map((r, i) => `
    <li role="option" id="sg-${i}" data-i="${i}" class="${i === active ? "active" : ""}" aria-selected="${i === active}">
      ${favicon(r.url)}
      <span class="txt"><span class="title">${mark(r.title || prettyUrl(r.url), words)}</span><small>${esc(r.bang ? hostOf(r.url) : prettyUrl(r.url))}</small></span>
      ${r.bang ? `<span class="tag">!${esc(r.bang)}</span>` : r.tab ? `<span class="tag">Switch to tab</span>`
        : r.bookmark ? `<span class="mark" title="Bookmark">${icon("bookmark", 16)}</span>` : ""}
    </li>`).join("");
  q.setAttribute("aria-expanded", rows.length > 0);
  if (rows.length) closePanels();
  if (rows[active]) q.setAttribute("aria-activedescendant", "sg-" + active);
  else q.removeAttribute("aria-activedescendant");
}

// ⌘ or Ctrl opens an open tab's page again in a new one, instead of switching to it
function pick(row, newTab) {
  if (row.tab && !newTab) return switchTab(row.tab);
  if (!row.bang) return go(row.url, newTab);
  // Swap the half-typed bang for the whole one, ready for the search terms
  const token = caretBang();
  if (!token) return;
  const before = q.value.slice(0, token.start), after = q.value.slice(token.end).trimStart();
  q.value = `${before}!${row.bang} ${after}`;
  const caret = before.length + row.bang.length + 2;
  q.setSelectionRange(caret, caret);
  updateBangHint();
  updateSuggestions();
}

q.addEventListener("focus", updateSuggestions);
q.addEventListener("blur", closeSuggestions);
// Moving the caret in or out of a bang changes what's suggested
q.addEventListener("click", updateSuggestions);
q.addEventListener("keyup", (e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) updateSuggestions(); });
// mousedown would blur the box and clear the list before the click lands
suggest.addEventListener("mousedown", (e) => e.preventDefault());
suggest.addEventListener("mousemove", (e) => {
  if (rowsFor !== q.value) return;
  const i = Number(e.target.closest("[data-i]")?.dataset.i ?? active);
  if (i !== active) { active = i; paintSuggestions(); }
});
// A middle click opens a page in a new tab, like a link
suggest.addEventListener("click", (e) => {
  const li = e.target.closest("[data-i]");
  if (li) pick(rows[li.dataset.i], e.metaKey || e.ctrlKey);
});
suggest.addEventListener("auxclick", (e) => {
  const li = e.target.closest("[data-i]");
  if (li && e.button === 1 && !rows[li.dataset.i].bang) pick(rows[li.dataset.i], true);
});
$("search").addEventListener("submit", (e) => e.preventDefault());

// The box isn't focused on open, but typing anywhere on the page goes into it
// Space is left alone: on a focused button it presses it, and a search doesn't start with one.
document.addEventListener("keydown", (e) => {
  if (e.target === q || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || $("settings").open) return;
  if ((e.key.length === 1 && e.key !== " ") || e.key === "Backspace") q.focus({ preventScroll: true });
});

/* ---------- weather (Open-Meteo) ---------- */
const WEATHER_TTL = 15 * 60_000;
// Current conditions older than this are from a saved copy that couldn't be refreshed, and
// say when they're from
const WEATHER_STALE = 60 * 60_000;

// WMO weather code -> [description, icon]. "sun" turns into "moon" at night.
const WMO = {
  0: ["Clear", "sun"],
  1: ["Mostly clear", "sun"],
  2: ["Partly cloudy", "cloud"],
  3: ["Overcast", "cloud"],
  45: ["Fog", "cloud-fog"],
  48: ["Freezing fog", "cloud-fog"],
  51: ["Light drizzle", "cloud-rain"],
  53: ["Drizzle", "cloud-rain"],
  55: ["Heavy drizzle", "cloud-rain"],
  56: ["Freezing drizzle", "cloud-rain"],
  57: ["Freezing drizzle", "cloud-rain"],
  61: ["Light rain", "cloud-rain"],
  63: ["Rain", "cloud-rain"],
  65: ["Heavy rain", "cloud-rain"],
  66: ["Freezing rain", "cloud-rain"],
  67: ["Freezing rain", "cloud-rain"],
  71: ["Light snow", "snowflake"],
  73: ["Snow", "snowflake"],
  75: ["Heavy snow", "snowflake"],
  77: ["Snow grains", "snowflake"],
  80: ["Light showers", "cloud-rain"],
  81: ["Showers", "cloud-rain"],
  82: ["Heavy showers", "cloud-rain"],
  85: ["Snow showers", "snowflake"],
  86: ["Snow showers", "snowflake"],
  95: ["Thunderstorm", "cloud-storm"],
  96: ["Thunderstorm, hail", "cloud-storm"],
  99: ["Thunderstorm, hail", "cloud-storm"],
};
const describe = (code, isDay = true) => {
  const [text, name] = WMO[code] || ["Unknown", "cloud"];
  return { text, icon: name === "sun" && !isDay ? "moon" : name };
};

function weatherUrl(cities) {
  const lat = cities.map((c) => c.lat).join(",");
  const lon = cities.map((c) => c.lon).join(",");
  return "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat}&longitude=${lon}`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset"
    + "&wind_speed_unit=ms&timezone=auto&forecast_days=7"
    + (settings.fahrenheit ? "&temperature_unit=fahrenheit" : "");
}

// Air quality is a separate Open-Meteo API. Pollen is only modelled for Europe, and is 0 off-season.
const POLLEN = { alder: "Alder", birch: "Birch", grass: "Grass", mugwort: "Mugwort", olive: "Olive", ragweed: "Ragweed" };

function airUrl(cities) {
  const lat = cities.map((c) => c.lat).join(",");
  const lon = cities.map((c) => c.lon).join(",");
  return "https://air-quality-api.open-meteo.com/v1/air-quality"
    + `?latitude=${lat}&longitude=${lon}`
    + "&current=european_aqi," + Object.keys(POLLEN).map((k) => k + "_pollen").join(",")
    + "&timezone=auto";
}

// European AQI bands
const AQI = [[20, "Good"], [40, "Fair"], [60, "Moderate"], [80, "Poor"], [100, "Very poor"], [Infinity, "Extremely poor"]];
const aqiLabel = (v) => AQI.find(([max]) => v <= max)[1];
// Rough levels in grains/m³. The official thresholds differ a little per plant.
const pollenLevel = (v) => v < 1 ? "None" : v < 10 ? "Low" : v < 50 ? "Moderate" : "High";

function topPollen(current) {
  let top = null;
  for (const [key, name] of Object.entries(POLLEN)) {
    const v = current[key + "_pollen"];
    if (v != null && (!top || v > top.v)) top = { name, v };
  }
  return top;
}

// Each city or unit change gives new URLs. Entries for ones no longer shown are dropped.
function pruneWeatherCache(keep) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("wx:") && !keep.includes(k.slice(3))) localStorage.removeItem(k);
  } catch {}
}

async function getCached(url, timeout) {
  // One request covers every city. Open-Meteo returns an array when given several coordinates.
  const cached = store.get("wx:" + url);
  if (cached && Date.now() - cached.at < WEATHER_TTL) return cached.data;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = [].concat(await res.json());
    store.set("wx:" + url, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}

// Open-Meteo sends null for a value a model doesn't have, shown as a dash
const has = (v) => typeof v === "number" && Number.isFinite(v);
const deg = (t) => has(t) ? `${Math.round(t)}°` : "–";
const fixed = (v, unit) => has(v) ? `${v.toFixed(1)} ${unit}` : "–";
const compass = (d) => has(d) ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8] : "";
// Open-Meteo gives times as the city's wall clock, "2026-11-17T06:52"
const clockOf = (iso) => {
  if (typeof iso !== "string") return "–";
  const h = Number(iso.slice(11, 13)), m = iso.slice(14, 16);
  return settings.hour12 ? `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}` : iso.slice(11, 16);
};
// The same, with the day when it isn't today: "Mon, Nov 16, 22:00"
const whenOf = (iso, today) => typeof iso === "string" && iso.slice(0, 10) !== today
  ? `${new Date(iso.slice(0, 10) + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${clockOf(iso)}`
  : clockOf(iso);

const isStale = (now, time) => !(Date.parse(now + "Z") - Date.parse(time + "Z") <= WEATHER_STALE);

// What a forecast says depends on the city's date and time, as a saved copy is shown
// offline: which day is today, whether the sun has set, and how old the conditions are.
// The key changes when any of them does, for the card to be drawn again.
function weatherNow(w) {
  const at = new Date();
  // The zone, for summer time since the forecast was fetched, or else its offset then
  const min = validTz(w.timezone) ? utcOffset(w.timezone, at) : (w.utc_offset_seconds ?? 0) / 60;
  const now = new Date(at.getTime() + min * 60_000).toISOString().slice(0, 16), today = now.slice(0, 10);
  const first = w.daily.time.indexOf(today);
  const sunsetPassed = first !== -1 && typeof w.daily.sunset[first] === "string" && now > w.daily.sunset[first];
  // NaN, for conditions without a time, counts as stale
  const stale = isStale(now, w.current.time);
  return { now, today, first, sunsetPassed, stale, key: [today, first, sunsetPassed, stale].join() };
}

function renderCity(el, city, w, air) {
  const c = w.current, d = w.daily;
  const now = describe(c.weather_code, c.is_day);
  const { now: cityNow, today, first, sunsetPassed, stale, key } = weatherNow(w);
  // From the city's today on. A saved week that's all past has no days left.
  const shown = first === -1 ? [] : d.time.slice(first).map((_, k) => first + k);
  const weekLo = Math.min(...shown.map((i) => d.temperature_2m_min[i]).filter(has));
  const weekHi = Math.max(...shown.map((i) => d.temperature_2m_max[i]).filter(has));
  const pos = (t) => ((t - weekLo) / (weekHi - weekLo || 1)) * 100;
  const todays = (values) => first === -1 ? null : values[first];
  const asOf = whenOf(c.time, today);
  // paintTime redraws this clock every second, so a zone it can't use would stop the clock
  const tz = validTz(w.timezone) ? w.timezone : "";

  const days = shown.map((i) => {
    const day = d.time[i], lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i], mm = d.precipitation_sum[i];
    const date = new Date(day + "T12:00");
    const label = i === first ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
    const cond = describe(d.weather_code[i]);
    // Stale conditions aren't today's temperature
    const dot = i === first && !stale && has(c.temperature_2m) ? `<em style="left:${pos(c.temperature_2m)}%"></em>` : "";
    const range = has(lo) && has(hi) ? `<i style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></i>` : "";
    return `<li>
      <span class="day">${label}</span>
      <span class="ic">${icon(cond.icon, 20)}</span>
      <span class="mm">${mm >= 0.1 ? `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm` : ""}</span>
      <span class="lo">${deg(lo)}</span>
      <span class="bar">${range}${dot}</span>
      <span class="hi">${deg(hi)}</span>
    </li>`;
  }).join("") || `<li class="muted">The saved forecast has ended</li>`;

  const sun = sunsetPassed
    ? `${icon("sunrise")}<div><p>Sunrise</p><h4>${clockOf(d.sunrise[first + 1])}</h4></div>`
    : `${icon("sunset")}<div><p>Sunset</p><h4>${clockOf(todays(d.sunset))}</h4></div>`;
  const rain = todays(d.precipitation_probability_max);

  el.innerHTML = `
    <div class="panel">
      <div class="p-head"><h5>${esc(city.name)}</h5><h5 class="muted" data-clock="${esc(tz)}">${fmtTime(new Date(), tz || undefined)}</h5></div>
      <div class="hero">
        <span class="hero-ic">${icon(now.icon, 44)}</span>
        <h1>${deg(c.temperature_2m)}</h1>
        <div class="hero-meta">
          <h4>${now.text}</h4>
          <p>Feels like ${deg(c.apparent_temperature)}</p>
          <p>H ${deg(todays(d.temperature_2m_max))} · L ${deg(todays(d.temperature_2m_min))}</p>
          ${stale ? `<p class="stale">As of ${asOf}</p>` : ""}
        </div>
      </div>
      <div class="stats">
        <div class="card">${icon("wind")}<div><p>Wind</p><h4>${fixed(c.wind_speed_10m, "m/s")} ${compass(c.wind_direction_10m)}</h4></div></div>
        <div class="card">${icon("umbrella")}<div><p>Rain today</p><h4>${fixed(todays(d.precipitation_sum), "mm")}${first === -1 ? "" : ` · ${rain ?? 0}%`}</h4></div></div>
        <div class="card">${icon("droplet")}<div><p>Humidity</p><h4>${has(c.relative_humidity_2m) ? `${c.relative_humidity_2m}%` : "–"}</h4></div></div>
        ${airCards(air, cityNow)}
        <div class="card">${sun}</div>
      </div>
      <h6 class="section">${shown.length ? `${shown.length}-day forecast` : "Forecast"}</h6>
      <ol class="week">${days}</ol>
      <div class="p-foot"><a href="https://open-meteo.com/">Weather data by Open-Meteo</a><p>Updated ${asOf}</p></div>
    </div>
    <button class="button pill${stale ? " stale" : ""}" type="button" aria-expanded="${el.classList.contains("open")}"${stale ? ` title="As of ${esc(asOf)}"` : ""}>
      ${icon(now.icon)}<strong>${deg(c.temperature_2m)}</strong><span class="name" title="${esc(city.name)}">${esc(city.name)}</span>
    </button>`;
  return key;
}

// Left out when the saved copy is too old to say much about now
function airCards(air, now) {
  const aqi = air?.current?.european_aqi;
  if (aqi == null || isStale(now, air.current.time)) return "";
  const pollen = topPollen(air.current);
  return `<div class="card">${icon("leaf")}<div><p>Air quality · ${Math.round(aqi)}</p><h4>${aqiLabel(aqi)}</h4></div></div>
        ${pollen ? `<div class="card">${icon("flower")}<div><p>Pollen${pollen.v >= 1 ? ` · ${pollen.name}` : ""}</p><h4>${pollenLevel(pollen.v)}</h4></div></div>` : ""}`;
}

function closePanels(except) {
  for (const el of document.querySelectorAll(".wx.open")) {
    if (el === except) continue;
    el.classList.remove("open");
    el.querySelector(".pill").setAttribute("aria-expanded", "false");
  }
}

// A .wx holds a pill and the panel it opens
function bindPanel(el) {
  el.addEventListener("click", (e) => {
    if (!e.target.closest(".pill")) return;
    closePanels(el);
    el.classList.toggle("open");
    el.querySelector(".pill").setAttribute("aria-expanded", el.classList.contains("open"));
    if (el.classList.contains("open")) shimmer.emphasize();
  });
}

// One card per filled slot. An empty left slot still leaves the right card on the right.
let cards = [];
function buildWeather() {
  closePanels();
  cards = settings.weather.flatMap((city, i) => {
    if (!city) return [];
    const el = document.createElement("div");
    el.className = "wx" + (i === 1 ? " end" : "");
    el.innerHTML = `<button class="button pill" type="button"><span class="name" title="${esc(city.name)}">${esc(city.name)}</span></button>`;
    bindPanel(el);
    return [{ city, el }];
  });
  $("weather").replaceChildren(...cards.map((c) => c.el));
}
document.addEventListener("click", (e) => { if (!e.target.closest(".wx")) closePanels(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

// Each load is numbered, and only the newest one renders. An older one may finish last,
// for one with the cities or the unit since changed in Settings.
let weatherSeq = 0, weatherUrls = null;
async function loadWeather() {
  const list = cards, seq = ++weatherSeq;
  const cities = list.map((c) => c.city);
  const urls = list.length ? [weatherUrl(cities), airUrl(cities)] : [];
  if (String(urls) !== String(weatherUrls)) pruneWeatherCache(weatherUrls = urls);
  if (!list.length) return;
  try {
    // Air quality is a nice-to-have, so the forecast shows without it, and doesn't wait long for it
    const [data, air] = await Promise.all([getCached(urls[0], 15_000), getCached(urls[1], 5_000).catch(() => [])]);
    if (seq !== weatherSeq) return;
    list.forEach((card, i) => {
      Object.assign(card, { w: data[i], air: air[i] });
      card.key = renderCity(card.el, card.city, card.w, card.air);
    });
  } catch (err) {
    if (seq !== weatherSeq) return;
    list.forEach((card) => {
      card.w = null;
      card.el.querySelector(".pill").innerHTML = `<span class="name" title="${esc(card.city.name)}">${esc(card.city.name)}: weather unavailable</span>`;
    });
  }
}
// Midnight, sunset and the conditions going stale change the card between loads
function refreshWeather() {
  for (const card of cards) if (card.w && weatherNow(card.w).key !== card.key) card.key = renderCity(card.el, card.city, card.w, card.air);
}
buildWeather();
loadWeather();
setInterval(loadWeather, WEATHER_TTL);
setInterval(refreshWeather, 30_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });

/* ---------- the dock ---------- */
// The activity and uBlock pills sit beside the gear, centred together. The dock stays
// hidden until both have their numbers, then shows all at once, so nothing in it moves
// after it appears. A slow history rebuild (first run, daily, after deleting history)
// isn't waited for long.
const DOCK_WAIT = 2000;
const dockPending = new Set();
const showDock = () => document.querySelector(".dock").classList.add("ready");
function settleDock(part) {
  dockPending.delete(part);
  if (!dockPending.size) showDock();
}
setTimeout(showDock, DOCK_WAIT);

/* ---------- uBlock Origin stats ---------- */
// background.js counts what uBlock Origin blocks. Opened as a plain file:// page there's
// no extension storage, and the pill stays hidden.
// The order background.js stores each source's counts in (its KINDS), so keep the two alike
const KINDS = [["trackers", "Trackers"], ["ads", "Ads"], ["other", "Other"]];
// [id, label, days]. background.js keeps 90 days.
const PERIODS = [["today", "Today", 1], ["7d", "7D", 7], ["30d", "30D", 30], ["90d", "90D", 90]];
let period = PERIODS.find(([id]) => id === store.get("ublock:period"))?.[0] ?? "30d";

const ublock = $("ublock");
ublock.innerHTML = `
  <div class="panel">
    <div class="p-head"><h5>Privacy report</h5><div class="seg" role="group" aria-label="Period">
      ${PERIODS.map(([id, label]) => `<button type="button" data-period="${id}">${label}</button>`).join("")}
    </div></div>
    <div class="report"></div>
  </div>
  <button class="button pill" type="button" aria-expanded="false">${icon("shield")}<strong></strong>blocked</button>`;
bindPanel(ublock);
ublock.querySelector(".seg").addEventListener("click", (e) => {
  const id = e.target.closest("[data-period]")?.dataset.period;
  if (!id) return;
  period = id;
  store.set("ublock:period", id);
  showUblock();
});

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("en-US");
const dayOf = (d) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const fmtDay = (day) => new Date(day + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayOf(d); };

function fmtBytes(b) {
  const units = ["KB", "MB", "GB", "TB"];
  let i = 0;
  for (b /= 1000; b >= 1000 && i < units.length - 1; i++) b /= 1000;
  return `${b < 10 ? b.toFixed(2) : b < 100 ? b.toFixed(1) : Math.round(b)} ${units[i]}`;
}
function fmtDuration(ms) {
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(min < 600 ? 1 : 0)} h`;
}

function renderUblock({ start, days }) {
  const [, , length] = PERIODS.find(([id]) => id === period);
  const from = daysAgo(length - 1), to = daysAgo(0);

  // Sum the period, and each company's or domain's share of it. No prototype, so a
  // domain like "constructor" is just a name.
  const sum = { trackers: 0, ads: 0, other: 0 }, sources = Object.create(null);
  for (const [day, d] of Object.entries(days)) {
    // Days after today were counted while the clock was set ahead
    if (day < from || day > to) continue;
    for (const k in sum) sum[k] += d[k];
    // Per kind, in KINDS order
    for (const [name, counts] of Object.entries(d.sources)) {
      const s = sources[name] ??= [0, 0, 0];
      counts.forEach((n, i) => { s[i] += n; });
    }
  }
  const blocked = sum.trackers + sum.ads + sum.other;
  // Each source's total, coloured by what it mostly is
  const top = Object.entries(sources)
    .map(([name, s]) => [name, KINDS[s.indexOf(Math.max(...s))][0], s[0] + s[1] + s[2]])
    .sort((a, b) => b[2] - a[2])
    .slice(0, 5);

  let note;
  if (length === 1) note = "Since midnight";
  else if (start > from) note = `Counting since ${fmtDay(start)}`;
  else note = `${count.format(Math.round(blocked / length))} a day on average`;

  ublock.hidden = false;
  const pill = ublock.querySelector(".pill");
  pill.querySelector("strong").textContent = compact.format(blocked);
  pill.title = length === 1 ? "Blocked today" : `Blocked in the last ${length} days`;
  for (const b of ublock.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", b.dataset.period === period);
  ublock.querySelector(".report").innerHTML = `
    <div class="hero">
      <span class="hero-ic">${icon("shield", 44)}</span>
      <h1 title="${count.format(blocked)}">${compact.format(blocked)}</h1>
      <div class="hero-meta">
        <h4>Requests blocked</h4>
        <p>${note}</p>
      </div>
    </div>
    <div class="split">${KINDS.filter(([k]) => sum[k]).map(([k]) => `<i class="k-${k}" style="flex-grow:${sum[k]}"></i>`).join("")}</div>
    <ul class="legend">${KINDS.map(([k, name]) => `<li><span class="dot k-${k}"></span>${name}<strong>${count.format(sum[k])}</strong></li>`).join("")}</ul>
    <div class="stats">
      <div class="card">${icon("download")}<div><p>Bandwidth saved</p><h4>${fmtBytes(blocked * CONFIG.ublock.bytesPerBlock)}</h4></div></div>
      <div class="card">${icon("hourglass")}<div><p>Time saved</p><h4>${fmtDuration(blocked * CONFIG.ublock.msPerBlock)}</h4></div></div>
    </div>
    <h6 class="section">Most blocked</h6>
    <ol class="top">${top.length ? top.map(([name, kind, n]) => `<li>
      <span class="dot k-${kind}"></span>
      <span class="name">${esc(name)}</span>
      <span class="bar"><i style="width:${(n / top[0][2]) * 100}%"></i></span>
      <span class="n">${count.format(n)}</span>
    </li>`).join("") : `<li class="muted">Nothing blocked yet</li>`}</ol>
    <div class="p-foot"><a href="https://disconnect.me/trackerprotection">Categories by Disconnect</a><p>Bandwidth and time are estimates</p></div>`;
}

// background.js keeps "start" and a "day:YYYY-MM-DD" key per day, and saves every 5 s
// while pages load. Tabs in the background wait to re-render.
const ublockData = { start: null, days: {} };
const showUblock = () => { if (ublockData.start && !document.hidden) renderUblock(ublockData); };
if (globalThis.chrome?.storage) {
  dockPending.add("ublock");
  const dayKeys = Array.from({ length: PERIODS.at(-1)[2] }, (_, i) => "day:" + daysAgo(i));
  chrome.storage.local.get(["start", ...dayKeys]).then((got) => {
    ublockData.start = got.start;
    for (const k of dayKeys) if (got[k]) ublockData.days[k.slice(4)] = got[k];
    showUblock();
  }).catch(() => {}).finally(() => settleDock("ublock"));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.historyRemoved?.newValue) historyRemoved();
    let changed = false;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (k === "start") ublockData.start = newValue;
      else if (!k.startsWith("day:")) continue;
      else if (newValue) ublockData.days[k.slice(4)] = newValue;
      else delete ublockData.days[k.slice(4)];
      changed = true;
    }
    if (changed) showUblock();
  });
  document.addEventListener("visibilitychange", showUblock);
}

/* ---------- browsing activity ---------- */
// Like Vivaldi's: visits per day, the busiest hour, top sites and how pages were reached,
// all from the browser's history. History records visits, not time spent on a page.
// [id, label]. "typed" is the address bar, typing or picking a suggestion. "other" also
// holds redirects, start pages and form posts.
const HOW = [["typed", "Typed"], ["links", "Links"], ["bookmarks", "Bookmarks"], ["other", "Other"]];
const howOf = (transition) =>
  ["typed", "generated", "keyword", "keyword_generated"].includes(transition) ? 0
    : transition === "link" ? 1
    : transition === "auto_bookmark" ? 2
    : 3;
// Chrome keeps 90 days of history
const ACTIVITY_DAYS = 90;
// Deleted history only shows up on a full rebuild, so one happens daily
const ACTIVITY_REBUILD = 24 * 3600_000;
let activityPeriod = PERIODS.find(([id]) => id === store.get("activity:period"))?.[0] ?? "7d";
// Days per bar, so each period has 7 to 15 bars. Today has 12 bars of two hours.
const GROUP = { "7d": 1, "30d": 2, "90d": 6 };

const activity = $("activity");
activity.innerHTML = `
  <div class="panel">
    <div class="p-head"><h5>Browsing activity</h5><div class="seg" role="group" aria-label="Period">
      ${PERIODS.map(([id, label]) => `<button type="button" data-period="${id}">${label}</button>`).join("")}
    </div></div>
    <div class="report"></div>
  </div>
  <button class="button pill" type="button" aria-expanded="false">${icon("activity")}<strong></strong>visits</button>`;
bindPanel(activity);
activity.querySelector(".seg").addEventListener("click", (e) => {
  const id = e.target.closest("[data-period]")?.dataset.period;
  if (!id) return;
  activityPeriod = id;
  store.set("activity:period", id);
  renderActivity();
});

// Visits summed per local day, kept in chrome.storage.local as "activity" and topped up
// with what's new since "until":
// { v, built, removed, until, origins: { site: origin }, days: { "YYYY-MM-DD": { n, hours: [24], how: [HOW], sites: { site: n } } } }
// A site is the host and port, without www. "origins" holds an origin actually visited for
// each, like https://www.example.com or http://localhost:8080, for its link. https wins.
// "removed" is the "historyRemoved" stamp it was built after. background.js removes the
// cache whenever history is deleted, even with no new tab open, and a cache built before
// the latest stamp is never used or kept.
const ACTIVITY_VERSION = 3;
let activityData = null, activityLoading = null, activityStale = false;
// A tab coming back tops up at most this often, unless history was deleted meanwhile.
// A cache newer than this is shown as it is, by a new tab too.
const ACTIVITY_TOPUP = 60_000;

// No prototype, so a host like "constructor" or "__proto__" is just a key
const dict = (o) => Object.assign(Object.create(null), o);

const removedStamp = async () => (await chrome.storage.local.get("historyRemoved")).historyRemoved ?? 0;

async function buildActivity() {
  const now = Date.now();
  // Another tab may have just built it, while this one waited for the lock
  let { activity: data, historyRemoved = 0 } = await chrome.storage.local.get(["activity", "historyRemoved"]);
  const reuse = data?.v === ACTIVITY_VERSION && data.removed === historyRemoved && data.built <= now && now - data.built < ACTIVITY_REBUILD;
  if (!reuse) {
    // A millisecond before midnight, as visits at "until" itself were counted last time
    data = { v: ACTIVITY_VERSION, built: now, removed: historyRemoved, until: new Date(daysAgo(ACTIVITY_DAYS - 1) + "T00:00").getTime() - 1, origins: {}, days: {} };
  }
  data.origins = dict(data.origins);
  for (const d of Object.values(data.days)) d.sites = dict(d.sites);
  if (reuse && data.until <= now && now - data.until < ACTIVITY_TOPUP) return data;
  // Every page visited since, then each one's visits. Reloads aren't new visits.
  const pages = await chrome.history.search({ text: "", startTime: data.until, endTime: now, maxResults: 1_000_000 });
  for (let i = 0; i < pages.length; i += 200) {
    const batch = pages.slice(i, i + 200).filter((p) => /^https?:/i.test(p.url));
    const visits = await Promise.all(batch.map((p) => chrome.history.getVisits({ url: p.url })));
    batch.forEach((p, j) => {
      const origin = new URL(p.url).origin, site = hostOf(origin, true);
      if (!data.origins[site]?.startsWith("https:")) data.origins[site] = origin;
      for (const v of visits[j]) {
        if (v.visitTime <= data.until || v.visitTime > now || v.transition === "reload") continue;
        const at = new Date(v.visitTime);
        const d = data.days[dayOf(at)] ??= { n: 0, hours: Array(24).fill(0), how: HOW.map(() => 0), sites: dict() };
        d.n++;
        d.hours[at.getHours()]++;
        d.how[howOf(v.transition)]++;
        d.sites[site] = (d.sites[site] ?? 0) + 1;
      }
    });
  }
  data.until = now;
  const oldest = daysAgo(ACTIVITY_DAYS - 1);
  for (const day in data.days) if (day < oldest) delete data.days[day];
  const seen = new Set(Object.values(data.days).flatMap((d) => Object.keys(d.sites)));
  for (const site in data.origins) if (!seen.has(site)) delete data.origins[site];
  // History deleted while this was counting may be in it. The worker stamps a deletion
  // before removing the cache, so a stamp read after saving also catches one in between.
  if (await removedStamp() === data.removed) {
    try {
      await chrome.storage.local.set({ activity: data });
    } catch (err) {
      // Too big or storage failing: shown anyway, and rebuilt by the next tab
      console.warn(`Couldn't save "activity":`, err);
    }
    if (await removedStamp() === data.removed) return data;
    await chrome.storage.local.remove("activity").catch(() => {});
  }
  return buildActivity();
}

function loadActivity() {
  if (activityLoading) return activityLoading;
  activityStale = false;
  // One tab at a time, so tabs opened together don't each rebuild 90 days of history
  const locked = (fn) => navigator.locks ? navigator.locks.request("activity", fn) : fn();
  activityLoading = locked(buildActivity)
    .then((data) => { activityData = data; renderActivity(); })
    // History is unavailable. The pill stays hidden, and the next tab tries again.
    .catch(() => {})
    .finally(() => { activityLoading = null; settleDock("activity"); });
  return activityLoading;
}

// From storage.onChanged in the uBlock section. A tab in the background rebuilds when it's next shown.
function historyRemoved() {
  activityStale = true;
  if (document.hidden || !globalThis.chrome?.history) return;
  reloadActivity();
}
// A load already running may have counted deleted visits, so another one follows it
const reloadActivity = () => (activityLoading ?? Promise.resolve()).then(loadActivity);

const siteUrl = (site) => `${activityData.origins[site] ?? "https://" + site}/`;
const hourLabel = (h) => settings.hour12 ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : `${String(h).padStart(2, "0")}:00`;

function renderActivity() {
  if (!activityData || document.hidden) return;
  const [, , length] = PERIODS.find(([id]) => id === activityPeriod);
  const dayList = Array.from({ length }, (_, i) => daysAgo(length - 1 - i));
  const empty = { n: 0, hours: Array(24).fill(0), how: HOW.map(() => 0), sites: {} };
  const days = dayList.map((day) => activityData.days[day] ?? empty);

  const total = days.reduce((n, d) => n + d.n, 0);
  const hours = Array(24).fill(0), how = HOW.map(() => 0), sites = dict();
  for (const d of days) {
    d.hours.forEach((n, h) => { hours[h] += n; });
    d.how.forEach((n, k) => { how[k] += n; });
    for (const [host, n] of Object.entries(d.sites)) sites[host] = (sites[host] ?? 0) + n;
  }
  const peak = hours.indexOf(Math.max(...hours));
  const top = Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Bars of { n, label, now }. Today is all one day, so its hours come straight from it.
  let bars, axis;
  if (length === 1) {
    const hour = new Date().getHours();
    bars = Array.from({ length: 12 }, (_, i) => ({
      n: hours[i * 2] + hours[i * 2 + 1],
      label: `${hourLabel(i * 2)} – ${hourLabel((i * 2 + 2) % 24)}`,
      now: i === Math.floor(hour / 2),
    }));
    // Every six hours, under the bar each starts at
    axis = `<div class="axis hours">${[0, 6, 12, 18].map((h) => `<span>${hourLabel(h)}</span>`).join("")}</div>`;
  } else {
    const size = GROUP[activityPeriod], dayName = (day, i) => i === length - 1 ? "Today" : fmtDay(day);
    bars = Array.from({ length: length / size }, (_, b) => {
      const from = b * size, to = from + size - 1;
      return {
        n: days.slice(from, to + 1).reduce((n, d) => n + d.n, 0),
        label: size === 1
          ? (to === length - 1 ? "Today" : new Date(dayList[to] + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }))
          : `${dayName(dayList[from], from)} – ${dayName(dayList[to], to)}`,
        now: to === length - 1,
      };
    });
    axis = `<div class="axis"><span>${fmtDay(dayList[0])}</span><span>Today</span></div>`;
  }
  const most = Math.max(1, ...bars.map((b) => b.n));
  for (const b of bars) b.pct = (b.n / most) * 100;
  activityBars = bars;

  const pill = activity.querySelector(".pill");
  pill.querySelector("strong").textContent = compact.format(total);
  pill.title = length === 1 ? "Pages visited today" : `Pages visited in the last ${length} days`;
  for (const b of activity.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", b.dataset.period === activityPeriod);
  activity.hidden = false;
  activity.querySelector(".report").innerHTML = `
    <div class="hero">
      <span class="hero-ic">${icon("activity", 44)}</span>
      <h1 title="${count.format(total)}">${compact.format(total)}</h1>
      <div class="hero-meta">
        <h4>Pages visited</h4>
        <p>${length === 1 ? "Since midnight" : `${count.format(Math.round(total / length))} a day on average`}</p>
      </div>
    </div>
    <div class="chart">${bars.map((b, i) =>
      `<span class="col${b.now ? " now" : ""}" data-i="${i}"><i style="height:${b.pct}%"></i></span>`).join("")}
      <div class="chart-tip" hidden></div>
    </div>
    ${axis}
    <div class="stats">
      <div class="card">${icon("world")}<div><p>Sites</p><h4>${count.format(Object.keys(sites).length)}</h4></div></div>
      <div class="card">${icon("clock")}<div><p>Busiest hour</p><h4>${total ? hourLabel(peak) : "–"}</h4></div></div>
    </div>
    <h6 class="section">How you got there</h6>
    <div class="split">${HOW.map(([id], k) => how[k] ? `<i class="k-${id}" style="flex-grow:${how[k]}"></i>` : "").join("")}</div>
    <ul class="legend two">${HOW.map(([id, name], k) => `<li><span class="dot k-${id}"></span>${name}<strong>${count.format(how[k])}</strong></li>`).join("")}</ul>
    <h6 class="section">Most visited</h6>
    <ol class="top sites">${top.length ? top.map(([site, n]) => `<li>
      ${favicon(siteUrl(site))}
      <a class="name" href="${esc(siteUrl(site))}">${esc(site)}</a>
      <span class="bar"><i style="width:${(n / top[0][1]) * 100}%"></i></span>
      <span class="n">${count.format(n)}</span>
    </li>`).join("") : `<li class="muted">No visits yet</li>`}</ol>
    <div class="p-foot"><p>From your browser history</p><p>Updated ${fmtTime(new Date(activityData.until))}</p></div>`;
}

// The pages in the bar under the pointer. A bar's column is its whole height, with no gaps
// between columns, so moving along the chart goes straight from one bar to the next.
let activityBars = [];
function showChartTip(col) {
  const chart = col.parentElement, tip = chart.querySelector(".chart-tip"), bar = activityBars[col.dataset.i];
  chart.querySelector(".col.on")?.classList.remove("on");
  col.classList.add("on");
  tip.innerHTML = `<strong>${count.format(bar.n)}</strong>${bar.n === 1 ? "page" : "pages"}<span>${esc(bar.label)}</span>`;
  tip.hidden = false;
  // Centred over the bar, but kept inside the chart
  const half = tip.offsetWidth / 2, center = col.offsetLeft + col.offsetWidth / 2;
  tip.style.left = `${Math.min(Math.max(center, half), chart.clientWidth - half)}px`;
  tip.style.bottom = `calc(${bar.pct}% + 8px)`;
}
activity.addEventListener("pointerover", (e) => {
  const col = e.target.closest(".chart .col");
  if (col && !col.classList.contains("on")) showChartTip(col);
});
activity.addEventListener("pointerout", (e) => {
  const chart = e.target.closest(".chart");
  if (!chart || chart.contains(e.relatedTarget)) return;
  chart.querySelector(".col.on")?.classList.remove("on");
  chart.querySelector(".chart-tip").hidden = true;
});

// Opened as a plain file:// page there's no history, and the pill stays hidden
if (globalThis.chrome?.history) {
  dockPending.add("activity");
  loadActivity();
  // Top up when the tab comes back. Deleted history comes through historyRemoved().
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    // A tab opened in the background skipped rendering until now
    renderActivity();
    if (activityStale) reloadActivity();
    else if (!activityData || Date.now() - activityData.until >= ACTIVITY_TOPUP) loadActivity();
  });
}

if (!dockPending.size) showDock();

/* ---------- settings (⌥ , or the gear) ---------- */
const dialog = $("settings");
$("settings-open").innerHTML = icon("settings");
// ⌘O and ⌘, belong to the browser, so the page uses Option/Alt + comma
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥ ," : "Alt + ,";
$("shortcut").textContent = shortcut;
$("settings-open").title = `Settings (${shortcut})`;

function openSettings() {
  closePanels();
  renderGeneral();
  renderSlots();
  renderSearch();
  dialog.showModal();
  shimmer.emphasize();
}
$("settings-open").addEventListener("click", openSettings);
// A click on the backdrop closes it
dialog.addEventListener("click", (e) => {
  const r = dialog.getBoundingClientRect();
  if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
});
document.addEventListener("keydown", (e) => {
  // e.code, because ⌥ , types "≤" on a Mac
  if (e.code !== "Comma" || !e.altKey || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (dialog.open) dialog.close();
  else openSettings();
});

// Another tab saved its settings. Taking them on keeps this tab from later saving its
// older copy over them.
window.addEventListener("storage", (e) => {
  if (e.key !== "settings") return;
  const next = readSettings();
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(settings[k]));
  Object.assign(settings, next);
  for (const kind of changed) applySettings(kind);
  // Only what changed, as redrawing a list loses the focus in it
  if (!dialog.open) return;
  if (changed.some((k) => k === "hour12" || k === "fahrenheit")) renderGeneral();
  if (changed.some((k) => k === "weather" || k === "clocks")) renderSlots();
  if (changed.some((k) => k === "engine" || k === "engines" || k === "bangs")) renderSearch();
});

function saveSettings(kind) {
  store.set("settings", settings);
  applySettings(kind);
}
function applySettings(kind) {
  if (kind === "weather") { buildWeather(); loadWeather(); }
  else if (kind === "clocks") renderClocks(new Date());
  else if (kind === "hour12") { paintTime(new Date()); loadWeather(); renderActivity(); }
  else if (kind === "fahrenheit") loadWeather();
  else if (kind === "bangs") updateBangHint();
}

// General, or Search: the engine and your own engines and bangs. Tabs, so only the
// selected one is in the Tab order and the arrow keys move between them.
const tabs = $("settings-tabs");
function showTab(name) {
  for (const b of tabs.children) {
    b.setAttribute("aria-selected", b.dataset.tab === name);
    b.tabIndex = b.dataset.tab === name ? 0 : -1;
  }
  for (const pane of dialog.querySelectorAll("[data-pane]")) pane.hidden = pane.dataset.pane !== name;
}
tabs.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (b) showTab(b.dataset.tab);
});
tabs.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const next = tabs.querySelector('[aria-selected="false"]');
  showTab(next.dataset.tab);
  next.focus();
});
showTab("general");

// Time format and temperature unit
for (const seg of dialog.querySelectorAll(".seg[data-setting]")) {
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-value]");
    if (!b) return;
    settings[seg.dataset.setting] = b.dataset.value === "true";
    renderGeneral();
    saveSettings(seg.dataset.setting);
  });
}
function renderGeneral() {
  for (const seg of dialog.querySelectorAll(".seg[data-setting]")) {
    for (const b of seg.children) b.setAttribute("aria-pressed", b.dataset.value === String(settings[seg.dataset.setting]));
  }
}

// The search engine, and your own engines and bangs. Each list is edited with the form
// under it: a row loads into the form, which then saves over that row (form.dataset.editing
// holds its name or trigger) until it's saved or emptied.
const engine = $("engine"), engineForm = $("engine-add"), bangForm = $("bang-add");
$("engine-field").insertAdjacentHTML("beforeend", icon("chevron-down", 16));
engine.addEventListener("change", () => { settings.engine = engine.value; saveSettings("engine"); });

const entry = (i, key, name, url) => `
  <li>
    <button class="edit" type="button" data-i="${i}" title="Edit">
      <span class="key">${esc(key)}</span><span class="txt">${name ? `<span>${esc(name)}</span>` : ""}<small>${esc(prettyUrl(url))}</small></span>
    </button>
    <button class="icon-btn" type="button" data-remove="${i}" aria-label="Remove ${esc(key)}">${icon("x", 16)}</button>
  </li>`;

function renderSearch() {
  // A value of its own, as an option's text has its spaces collapsed
  engine.innerHTML = engineNames().map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
  engine.value = settings.engine;
  $("engines-list").innerHTML = settings.engines.map((e, i) => entry(i, e.name, "", e.url)).join("");
  $("bangs-list").innerHTML = settings.bangs.map((b, i) => entry(i, "!" + b.t, b.name, b.url)).join("");
  // A name refused as taken may not be any more
  for (const input of dialog.querySelectorAll(".add input")) input.setCustomValidity("");
  for (const form of [engineForm, bangForm]) labelSubmit(form);
}

// What's in the box is found where the browser's validation bubble points
function invalid(input, message) {
  input.setCustomValidity(message);
  input.reportValidity();
}
// A web address with %s where the search terms go. A bang may leave it out, to always open
// the same page.
function templateError(url, needTerms) {
  if (needTerms && !url.includes("%s")) return "Put %s where the search terms go";
  try {
    if (!/^(https?|chrome|file):$/.test(new URL(url.replaceAll("%s", "x")).protocol)) throw 0;
  } catch {
    return "Enter a web address, like https://example.com/search?q=%s";
  }
  return "";
}

// What a form's key field holds
const formKey = {
  engines: (f) => f.elements.label.value.trim().replace(/\s+/g, " "),
  bangs: (f) => f.elements.trigger.value.trim().replace(/^!/, "").toLowerCase(),
};
// And a saved entry's
const keyOf = { engines: (e) => e.name, bangs: (b) => b.t };
// The row being edited. Gone when another tab has removed it, and then it's added again.
const editingIndex = (form) =>
  "editing" in form.dataset ? settings[form.dataset.kind].findIndex((x) => keyOf[form.dataset.kind](x) === form.dataset.editing) : -1;
// "Save" while editing a row, "Add" otherwise
function labelSubmit(form) {
  form.querySelector("[type=submit]").textContent = "editing" in form.dataset ? "Save" : "Add";
}
function resetForm(form) {
  form.reset();
  delete form.dataset.editing;
  labelSubmit(form);
}

// Over the row being edited, or as a new one. A name or trigger another row has is refused.
function saveEntry(form, item, keyInput, key) {
  const kind = form.dataset.kind, list = settings[kind];
  const i = editingIndex(form), taken = list.findIndex((x) => keyOf[kind](x) === key);
  if (taken !== -1 && taken !== i) return invalid(keyInput, `${kind === "bangs" ? "!" + key : key} is already in your list. Click it there to edit it.`);
  if (i === -1) list.push(item);
  else {
    // The engine in use keeps being used under its new name
    if (kind === "engines" && list[i].name === settings.engine) settings.engine = item.name;
    list[i] = item;
  }
  saveSettings(kind);
  resetForm(form);
  renderSearch();
}

engineForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const { label, url } = engineForm.elements;
  const name = formKey.engines(engineForm), template = url.value.trim();
  if (!name) return invalid(label, "Give it a name");
  if (Object.hasOwn(CONFIG.search.engines, name)) return invalid(label, `${name} is already in the list`);
  const err = templateError(template, true);
  if (err) return invalid(url, err);
  saveEntry(engineForm, { name, url: template }, label, name);
});
bangForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const { trigger, label, url } = bangForm.elements;
  const t = formKey.bangs(bangForm), template = url.value.trim();
  if (!t || /\s/.test(t)) return invalid(trigger, "One word, like cl");
  const err = templateError(template, false);
  if (err) return invalid(url, err);
  saveEntry(bangForm, { t, name: label.value.trim() || hostOf(template.replaceAll("%s", "x")) || "!" + t, url: template }, trigger, t);
});

for (const form of [engineForm, bangForm]) {
  const kind = form.dataset.kind;
  const inputs = form.querySelectorAll("input"), list = $(kind + "-list");
  form.addEventListener("input", (e) => {
    e.target.setCustomValidity("");
    // Emptied, it's back to adding a new one
    if ([...inputs].every((i) => !i.value)) resetForm(form);
  });
  list.addEventListener("click", (e) => {
    const edit = e.target.closest("[data-i]"), remove = e.target.closest("[data-remove]");
    // A double click's second click would land on the ✕ of the row moving up into its place
    if (remove && e.detail > 1) return;
    if (remove) {
      const i = Number(remove.dataset.remove);
      const [gone] = settings[kind].splice(i, 1);
      // The engine in use falls back to the default
      if (kind === "engines" && gone.name === settings.engine) settings.engine = defaultEngine();
      if (form.dataset.editing === keyOf[kind](gone)) resetForm(form);
      saveSettings(kind);
      renderSearch();
      // Focus stays in the list, on the row that took its place, rather than going back to the top
      const buttons = list.querySelectorAll("[data-remove]");
      (buttons[Math.min(i, buttons.length - 1)] ?? inputs[0]).focus();
    } else if (edit) {
      const item = settings[kind][edit.dataset.i];
      const { elements: f } = form;
      if (kind === "engines") f.label.value = item.name;
      else {
        f.trigger.value = item.t;
        // A name that was only the site's is left out, to follow the address if it changes
        f.label.value = item.name === hostOf(item.url.replaceAll("%s", "x")) ? "" : item.name;
      }
      f.url.value = item.url;
      for (const input of inputs) input.setCustomValidity("");
      form.dataset.editing = keyOf[kind](item);
      labelSubmit(form);
      f.url.focus();
    }
  });
}

// Open-Meteo's geocoder, which also gives each city's time zone
async function searchCities(name, signal) {
  const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" + encodeURIComponent(name), { signal });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return ((await res.json()).results || []).filter((r) => r.timezone && validTz(r.timezone)).map((r) => ({
    name: r.name, region: r.admin1 ?? "", country: r.country ?? "",
    lat: r.latitude, lon: r.longitude, tz: r.timezone,
  }));
}

function renderSlots() {
  for (const box of dialog.querySelectorAll(".slots")) {
    box.replaceChildren(...SLOTS.map((label, i) => slotField(box.dataset.kind, i, label)));
  }
}

function slotField(kind, i, label) {
  const el = document.createElement("div");
  el.className = "slot";
  const id = `results-${kind}-${i}`;
  el.innerHTML = `
    <span>${label}</span>
    <div class="input-field">
      <span class="accessory">${icon(kind === "weather" ? "map-pin" : "clock", 16)}</span>
      <input type="text" placeholder="Add a city" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}"
        aria-label="${label} ${kind === "weather" ? "weather" : "world clock"} city" autocomplete="off" spellcheck="false">
      <span class="country"></span>
      <button class="icon-btn" type="button" aria-label="Remove ${label.toLowerCase()} city">${icon("x", 16)}</button>
    </div>
    <ul class="results" id="${id}" role="listbox"></ul>`;
  const input = el.querySelector("input"), list = el.querySelector(".results");
  const country = el.querySelector(".country"), remove = el.querySelector(".icon-btn");
  // "foundFor" is the text the results are for. Enter only picks one while it's still in the box.
  let found = [], foundFor = "", active = 0, timer, ctrl;

  const paint = (note) => {
    list.innerHTML = note ? `<li class="note">${note}</li>` : found.map((c, j) =>
      `<li role="option" id="${id}-${j}" data-j="${j}" class="${j === active ? "active" : ""}" aria-selected="${j === active}">
        ${esc(c.name)}<small>${esc([c.region, c.country].filter(Boolean).join(", "))}</small>
      </li>`).join("");
    input.setAttribute("aria-expanded", list.children.length > 0);
    if (found[active]) input.setAttribute("aria-activedescendant", `${id}-${active}`);
    else input.removeAttribute("aria-activedescendant");
  };
  const show = (items, note, query = "") => { found = items; foundFor = query; active = 0; paint(note); };
  // Back to the saved city, dropping whatever was typed
  const reset = () => {
    clearTimeout(timer);
    ctrl?.abort();
    const city = settings[kind][i];
    input.value = city?.name ?? "";
    country.textContent = city?.country ?? "";
    remove.hidden = !city;
    show([]);
  };
  const set = (city) => {
    settings[kind][i] = city;
    saveSettings(kind);
    reset();
  };

  input.addEventListener("focus", () => input.select());
  input.addEventListener("blur", reset);
  input.addEventListener("input", () => {
    clearTimeout(timer);
    // A search for older text may still answer, and mustn't
    ctrl?.abort();
    const name = input.value.trim();
    if (name.length < 2) return show([]);
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const cities = await searchCities(name, ctrl.signal);
        show(cities, cities.length ? "" : "No cities found", name);
      } catch (err) {
        if (err.name !== "AbortError") show([], "City search is unavailable right now");
      }
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && found.length) {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length;
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (found[active] && foundFor === input.value.trim()) set(found[active]);
    } else if (e.key === "Escape" && list.children.length) {
      // Close the results first, the dialog on the next Escape
      e.preventDefault();
      e.stopPropagation();
      reset();
    }
  });
  // mousedown would blur the input and clear the list before the click lands
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("mousemove", (e) => {
    const j = Number(e.target.closest("[data-j]")?.dataset.j ?? active);
    if (j !== active) { active = j; paint(); }
  });
  list.addEventListener("click", (e) => {
    const li = e.target.closest("[data-j]");
    if (li) set(found[li.dataset.j]);
  });
  remove.addEventListener("click", () => set(null));
  el.querySelector(".input-field").addEventListener("click", (e) => { if (!e.target.closest("button")) input.focus(); });

  reset();
  return el;
}
