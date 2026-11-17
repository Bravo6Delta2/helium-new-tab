// Defaults. Time format, temperature unit, search engine and cities can be changed in
// Settings (⌥ ,), and what's picked there wins over these.
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
  // Your own bangs. These win over Helium's list, e.g.
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
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Two slots each, left and right. Once saved, these win over CONFIG.
const SLOTS = ["Left", "Right"];
const settings = {
  weather: CONFIG.cities, clocks: CONFIG.clocks,
  hour12: CONFIG.hour12, fahrenheit: CONFIG.fahrenheit, engine: CONFIG.search.engine,
  ...store.get("settings"),
};
for (const k of ["weather", "clocks"]) settings[k] = SLOTS.map((_, i) => settings[k]?.[i] || null);
// An engine since removed from CONFIG falls back to the first one
if (!CONFIG.search.engines[settings.engine]) settings.engine = Object.keys(CONFIG.search.engines)[0];

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
  paintTime(now);
  setTimeout(tick, 1000 - now.getMilliseconds());
}
function paintTime(now) {
  // AM and PM are set smaller, so the big clock keeps its size
  $("time").innerHTML = esc(fmtTime(now)).replace(/\s?([AP]M)$/, '<span class="ampm">$1</span>');
  $("date").textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  // A weather panel's clock shows the time in that city
  for (const el of document.querySelectorAll("[data-clock]")) el.textContent = fmtTime(now, el.dataset.clock || undefined);
  renderClocks(now);
}

/* ---------- world clocks ---------- */
// Minutes the zone is ahead of local time
function tzOffset(tz, d) {
  const wall = (timeZone) => new Date(d.toLocaleString("en-US", { timeZone }));
  return Math.round((wall(tz) - wall()) / 60_000);
}
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

function fill(template, terms) {
  return template.replace("%s", encodeURIComponent(terms));
}

function findBang(text) {
  // A bang can sit anywhere, like DuckDuckGo: "!yt lofi" or "lofi !yt"
  const m = text.match(/(?:^|\s)!(\S+)/);
  return m ? { key: m[1].toLowerCase(), terms: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() } : null;
}

function looksLikeUrl(text) {
  return /^[a-z][\w+.-]*:\/\//i.test(text)
    || /^localhost(:\d+)?(\/\S*)?$/i.test(text)
    || /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(text);
}

// Helium's list is Kagi's bangs plus Helium's extras. "f" holds Kagi's format flags.
// Helium keeps its copy in memory only, so the page can't borrow it. Instead the list is
// left to the browser's HTTP cache (the server allows a day, then revalidates by ETag),
// and only fetched once a bang is typed.
const FLAG = { OPEN_BASE_PATH: 1, OPEN_SNAP_DOMAIN: 2, ENCODE: 4, SPACE_TO_PLUS: 8 };
let heliumBangs = null; // Map of trigger -> { s: name, u: url template, f: flags }
let bangsLoading = null;

// Older versions kept a second copy in localStorage
try { localStorage.removeItem("bangs"); } catch {}

function loadHeliumBangs() {
  bangsLoading ??= (async () => {
    try {
      const res = await fetch(CONFIG.search.bangList);
      if (!res.ok) throw new Error("HTTP " + res.status);
      // The file is JSON with a license header in // comments and trailing commas
      const text = (await res.text()).replace(/^\/\/.*$/gm, "").replace(/,(\s*[\]}])/g, "$1");
      const map = new Map();
      for (const b of JSON.parse(text)) for (const t of b.ts) map.set(t, b);
      heliumBangs = map;
      updateBangHint();
    } catch {
      // Unknown bangs still work through DuckDuckGo. Try again on the next bang.
      bangsLoading = null;
    }
  })();
  return bangsLoading;
}

function lookupBang(key) {
  const own = CONFIG.bangs[key];
  if (own) return { s: own[0], u: own[1].replace("%s", "{searchTerms}") };
  return heliumBangs?.get(key) || null;
}

function runBang(bang, terms) {
  const f = bang.f ?? 15; // no flags given means all of them are on
  if (!terms) {
    try {
      const url = new URL(bang.u.replace("{searchTerms}", ""));
      return f & (FLAG.OPEN_BASE_PATH | FLAG.OPEN_SNAP_DOMAIN) ? url.origin : url.href;
    } catch {
      return null;
    }
  }
  let q = terms;
  if (f & FLAG.ENCODE) q = encodeURIComponent(q);
  if (f & FLAG.SPACE_TO_PLUS) q = q.replace(/%20| /g, "+");
  return bang.u.replace("{searchTerms}", q);
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
    return (/^localhost\b/i.test(text) ? "http://" : "https://") + text;
  }
  return fill(CONFIG.search.engines[settings.engine], text);
}

function updateBangHint() {
  const bang = findBang(q.value);
  if (bang && !heliumBangs) loadHeliumBangs();
  let label = "";
  if (bang?.key) label = lookupBang(bang.key)?.s ?? (heliumBangs ? `!${bang.key} via DuckDuckGo` : "");
  $("bang-chip").textContent = label;
  $("search-icon").innerHTML = icon(bang?.key ? "bang" : "search");
}
q.addEventListener("input", updateBangHint);

q.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") { q.value = ""; updateBangHint(); q.blur(); }
  if (e.key === "Enter") {
    e.preventDefault();
    // The list may still be loading. Give it a moment.
    if (!heliumBangs && findBang(q.value)) await Promise.race([loadHeliumBangs(), new Promise((r) => setTimeout(r, 1500))]);
    const url = resolve(q.value);
    if (!url) return;
    shimmer.emphasize();
    if (e.metaKey || e.ctrlKey) window.open(url, "_blank");
    else location.href = url;
  }
});
$("search").addEventListener("submit", (e) => e.preventDefault());

// The box isn't focused on open, but typing anywhere on the page goes into it
document.addEventListener("keydown", (e) => {
  if (e.target === q || e.metaKey || e.ctrlKey || e.altKey || $("settings").open) return;
  if (e.key.length === 1 || e.key === "Backspace") q.focus({ preventScroll: true });
});

/* ---------- weather (Open-Meteo) ---------- */
const WEATHER_TTL = 15 * 60_000;

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

async function getCached(url) {
  // One request covers every city. Open-Meteo returns an array when given several coordinates.
  const cached = store.get("wx:" + url);
  if (cached && Date.now() - cached.at < WEATHER_TTL) return cached.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = [].concat(await res.json());
    store.set("wx:" + url, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}

const deg = (t) => `${Math.round(t)}°`;
const compass = (d) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
// Open-Meteo gives times as the city's wall clock, "2026-11-17T06:52"
const clockOf = (iso) => {
  const h = Number(iso.slice(11, 13)), m = iso.slice(14, 16);
  return settings.hour12 ? `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}` : iso.slice(11, 16);
};

function renderCity(el, city, w, air) {
  const c = w.current, d = w.daily;
  const now = describe(c.weather_code, c.is_day);
  const weekLo = Math.min(...d.temperature_2m_min), weekHi = Math.max(...d.temperature_2m_max);
  const pos = (t) => ((t - weekLo) / (weekHi - weekLo || 1)) * 100;
  const sunsetPassed = c.time > d.sunset[0];

  const days = d.time.map((day, i) => {
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i], mm = d.precipitation_sum[i];
    const date = new Date(day + "T12:00");
    const label = i === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
    const cond = describe(d.weather_code[i]);
    const dot = i === 0 ? `<em style="left:${pos(c.temperature_2m)}%"></em>` : "";
    return `<li>
      <span class="day">${label}</span>
      <span class="ic">${icon(cond.icon, 20)}</span>
      <span class="mm">${mm >= 0.1 ? `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm` : ""}</span>
      <span class="lo">${deg(lo)}</span>
      <span class="bar"><i style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></i>${dot}</span>
      <span class="hi">${deg(hi)}</span>
    </li>`;
  }).join("");

  const sun = sunsetPassed
    ? `${icon("sunrise")}<div><p>Sunrise</p><h4>${clockOf(d.sunrise[1])}</h4></div>`
    : `${icon("sunset")}<div><p>Sunset</p><h4>${clockOf(d.sunset[0])}</h4></div>`;

  el.innerHTML = `
    <div class="panel">
      <div class="p-head"><h5>${esc(city.name)}</h5><h5 class="muted" data-clock="${esc(w.timezone)}">${fmtTime(new Date(), w.timezone)}</h5></div>
      <div class="hero">
        <span class="hero-ic">${icon(now.icon, 44)}</span>
        <h1>${deg(c.temperature_2m)}</h1>
        <div class="hero-meta">
          <h4>${now.text}</h4>
          <p>Feels like ${deg(c.apparent_temperature)}</p>
          <p>H ${deg(d.temperature_2m_max[0])} · L ${deg(d.temperature_2m_min[0])}</p>
        </div>
      </div>
      <div class="stats">
        <div class="card">${icon("wind")}<div><p>Wind</p><h4>${c.wind_speed_10m.toFixed(1)} m/s ${compass(c.wind_direction_10m)}</h4></div></div>
        <div class="card">${icon("umbrella")}<div><p>Rain today</p><h4>${d.precipitation_sum[0].toFixed(1)} mm · ${d.precipitation_probability_max[0] ?? 0}%</h4></div></div>
        <div class="card">${icon("droplet")}<div><p>Humidity</p><h4>${c.relative_humidity_2m}%</h4></div></div>
        ${airCards(air)}
        <div class="card">${sun}</div>
      </div>
      <h6 class="section">7-day forecast</h6>
      <ol class="week">${days}</ol>
      <div class="p-foot"><a href="https://open-meteo.com/">Weather data by Open-Meteo</a><p>Updated ${clockOf(c.time)}</p></div>
    </div>
    <button class="button pill" type="button" aria-expanded="${el.classList.contains("open")}">
      ${icon(now.icon)}<strong>${deg(c.temperature_2m)}</strong>${esc(city.name)}
    </button>`;
}

function airCards(air) {
  const aqi = air?.current?.european_aqi;
  if (aqi == null) return "";
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
    el.innerHTML = `<button class="button pill" type="button">${esc(city.name)}</button>`;
    bindPanel(el);
    return [{ city, el }];
  });
  $("weather").replaceChildren(...cards.map((c) => c.el));
}
document.addEventListener("click", (e) => { if (!e.target.closest(".wx")) closePanels(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

async function loadWeather() {
  const list = cards;
  if (!list.length) return;
  const cities = list.map((c) => c.city);
  try {
    // Air quality is a nice-to-have, so the forecast shows without it
    const [data, air] = await Promise.all([getCached(weatherUrl(cities)), getCached(airUrl(cities)).catch(() => [])]);
    // The cities may have changed in Settings while this was loading
    if (list !== cards) return;
    list.forEach(({ city, el }, i) => renderCity(el, city, data[i], air[i]));
  } catch (err) {
    if (list !== cards) return;
    list.forEach(({ city, el }) => {
      el.querySelector(".pill").textContent = `${city.name}: weather unavailable`;
    });
  }
}
buildWeather();
loadWeather();
setInterval(loadWeather, WEATHER_TTL);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });

/* ---------- uBlock Origin stats ---------- */
// background.js counts what uBlock Origin blocks. Opened as a plain file:// page there's
// no extension storage, and the pill stays hidden.
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
  const from = daysAgo(length - 1);

  // Sum the period, and each company's or domain's share of it
  const sum = { trackers: 0, ads: 0, other: 0 }, sources = {};
  for (const [day, d] of Object.entries(days)) {
    if (day < from) continue;
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
  const dayKeys = Array.from({ length: PERIODS.at(-1)[2] }, (_, i) => "day:" + daysAgo(i));
  chrome.storage.local.get(["start", ...dayKeys]).then((got) => {
    ublockData.start = got.start;
    for (const k of dayKeys) if (got[k]) ublockData.days[k.slice(4)] = got[k];
    showUblock();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
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

/* ---------- settings (⌥ , or the gear) ---------- */
const dialog = $("settings");
$("settings-open").innerHTML = icon("settings");
$("settings-close").innerHTML = icon("x");
// ⌘O and ⌘, belong to the browser, so the page uses Option/Alt + comma
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥ ," : "Alt + ,";
$("shortcut").textContent = shortcut;
$("settings-open").title = `Settings (${shortcut})`;

function openSettings() {
  closePanels();
  renderGeneral();
  renderSlots();
  dialog.showModal();
  shimmer.emphasize();
}
$("settings-open").addEventListener("click", openSettings);
$("settings-close").addEventListener("click", () => dialog.close());
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

function saveSettings(kind) {
  store.set("settings", settings);
  if (kind === "weather") { buildWeather(); loadWeather(); }
  else if (kind === "clocks") renderClocks(new Date());
  else if (kind === "hour12") { paintTime(new Date()); loadWeather(); }
  else if (kind === "fahrenheit") loadWeather();
}

// Search engine, time format and temperature unit
const engine = $("engine");
engine.innerHTML = Object.keys(CONFIG.search.engines).map((name) => `<option>${esc(name)}</option>`).join("");
$("engine-field").insertAdjacentHTML("beforeend", icon("chevron-down", 16));
engine.addEventListener("change", () => { settings.engine = engine.value; saveSettings("engine"); });
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
  engine.value = settings.engine;
  for (const seg of dialog.querySelectorAll(".seg[data-setting]")) {
    for (const b of seg.children) b.setAttribute("aria-pressed", b.dataset.value === String(settings[seg.dataset.setting]));
  }
}

// Open-Meteo's geocoder, which also gives each city's time zone
async function searchCities(name, signal) {
  const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" + encodeURIComponent(name), { signal });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return ((await res.json()).results || []).filter((r) => r.timezone).map((r) => ({
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
  let found = [], active = 0, timer, ctrl;

  const paint = (note) => {
    list.innerHTML = note ? `<li class="note">${note}</li>` : found.map((c, j) =>
      `<li role="option" data-j="${j}" class="${j === active ? "active" : ""}" aria-selected="${j === active}">
        ${esc(c.name)}<small>${esc([c.region, c.country].filter(Boolean).join(", "))}</small>
      </li>`).join("");
    input.setAttribute("aria-expanded", list.children.length > 0);
  };
  const show = (items, note) => { found = items; active = 0; paint(note); };
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
    const name = input.value.trim();
    if (name.length < 2) return show([]);
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const cities = await searchCities(name, ctrl.signal);
        show(cities, cities.length ? "" : "No cities found");
      } catch (err) {
        if (err.name !== "AbortError") show([], "City search is unavailable right now");
      }
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && found.length) {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length;
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (found[active]) set(found[active]);
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
