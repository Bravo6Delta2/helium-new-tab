// The weather cards in the bottom corners, from Open-Meteo.
import { html } from "./html.js";
import { icon } from "./icons.js";
import { bindPanel, closePanels } from "./panels.js";
import { $, fmtTime, settings, store } from "./page.js";
import {
  airUrl, aqiLabel, compass, deg, describe, fixed, has, isStale, pollenLevel, topPollen, weatherNow, weatherUrl,
} from "./forecast.js";
import { clockOf, validTz, whenOf } from "./time.js";

const WEATHER_TTL = 15 * 60_000;

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

function renderCity(el, city, w, air) {
  const c = w.current, d = w.daily, hour12 = settings.hour12;
  const now = describe(c.weather_code, c.is_day);
  const { now: cityNow, today, first, sunsetPassed, stale, key } = weatherNow(w);
  // From the city's today on. A saved week that's all past has no days left.
  const shown = first === -1 ? [] : d.time.slice(first).map((_, k) => first + k);
  const weekLo = Math.min(...shown.map((i) => d.temperature_2m_min[i]).filter(has));
  const weekHi = Math.max(...shown.map((i) => d.temperature_2m_max[i]).filter(has));
  const pos = (t) => ((t - weekLo) / (weekHi - weekLo || 1)) * 100;
  const todays = (values) => first === -1 ? null : values[first];
  const asOf = whenOf(c.time, today, hour12);
  // The clock redraws this one every second, so a zone it can't use would stop the clock
  const tz = validTz(w.timezone) ? w.timezone : "";

  const days = shown.map((i) => {
    const day = d.time[i], lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i], mm = d.precipitation_sum[i];
    const date = new Date(day + "T12:00");
    const label = i === first ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
    const cond = describe(d.weather_code[i]);
    // Stale conditions aren't today's temperature
    const dot = i === first && !stale && has(c.temperature_2m) ? html`<em style="left:${pos(c.temperature_2m)}%"></em>` : "";
    const range = has(lo) && has(hi) ? html`<i style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></i>` : "";
    return html`<li>
      <span class="day">${label}</span>
      <span class="ic">${icon(cond.icon, 20)}</span>
      <span class="mm">${mm >= 0.1 ? `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm` : ""}</span>
      <span class="lo">${deg(lo)}</span>
      <span class="bar">${range}${dot}</span>
      <span class="hi">${deg(hi)}</span>
    </li>`;
  });

  const sun = sunsetPassed
    ? html`${icon("sunrise")}<div><p>Sunrise</p><h4>${clockOf(d.sunrise[first + 1], hour12)}</h4></div>`
    : html`${icon("sunset")}<div><p>Sunset</p><h4>${clockOf(todays(d.sunset), hour12)}</h4></div>`;
  const rain = todays(d.precipitation_probability_max);

  el.innerHTML = html`
    <div class="panel">
      <div class="p-head"><h5>${city.name}</h5><h5 class="muted" data-clock="${tz}">${fmtTime(new Date(), tz || undefined)}</h5></div>
      <div class="hero">
        <span class="hero-ic">${icon(now.icon, 44)}</span>
        <h1>${deg(c.temperature_2m)}</h1>
        <div class="hero-meta">
          <h4>${now.text}</h4>
          <p>Feels like ${deg(c.apparent_temperature)}</p>
          <p>H ${deg(todays(d.temperature_2m_max))} · L ${deg(todays(d.temperature_2m_min))}</p>
          ${stale ? html`<p class="stale">As of ${asOf}</p>` : ""}
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
      <ol class="week">${days.length ? days : html`<li class="muted">The saved forecast has ended</li>`}</ol>
      <div class="p-foot"><a href="https://open-meteo.com/">Weather data by Open-Meteo</a><p>Updated ${asOf}</p></div>
    </div>
    <button class="button pill${stale ? " stale" : ""}" type="button" aria-expanded="${el.classList.contains("open")}"${stale ? html` title="As of ${asOf}"` : ""}>
      ${icon(now.icon)}<strong>${deg(c.temperature_2m)}</strong><span class="name" title="${city.name}">${city.name}</span>
    </button>`;
  return key;
}

// Left out when the saved copy is too old to say much about now
function airCards(air, now) {
  const aqi = air?.current?.european_aqi;
  if (aqi == null || isStale(now, air.current.time)) return "";
  const pollen = topPollen(air.current);
  return html`<div class="card">${icon("leaf")}<div><p>Air quality · ${Math.round(aqi)}</p><h4>${aqiLabel(aqi)}</h4></div></div>
        ${pollen ? html`<div class="card">${icon("flower")}<div><p>Pollen${pollen.v >= 1 ? ` · ${pollen.name}` : ""}</p><h4>${pollenLevel(pollen.v)}</h4></div></div>` : ""}`;
}

// One card per filled slot. An empty left slot still leaves the right card on the right.
let cards = [];
export function buildWeather() {
  closePanels();
  cards = settings.weather.flatMap((city, i) => {
    if (!city) return [];
    const el = document.createElement("div");
    el.className = "wx" + (i === 1 ? " end" : "");
    el.innerHTML = html`<button class="button pill" type="button"><span class="name" title="${city.name}">${city.name}</span></button>`;
    bindPanel(el);
    return [{ city, el }];
  });
  $("weather").replaceChildren(...cards.map((c) => c.el));
}

// Each load is numbered, and only the newest one renders. An older one may finish last,
// for one with the cities or the unit since changed in Settings.
let weatherSeq = 0, weatherUrls = null;
export async function loadWeather() {
  const list = cards, seq = ++weatherSeq;
  const cities = list.map((c) => c.city);
  const urls = list.length ? [weatherUrl(cities, settings.fahrenheit), airUrl(cities)] : [];
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
      card.el.querySelector(".pill").innerHTML = html`<span class="name" title="${card.city.name}">${card.city.name}: weather unavailable</span>`;
    });
  }
}

// Midnight, sunset and the conditions going stale change the card between loads
function refreshWeather() {
  for (const card of cards) if (card.w && weatherNow(card.w).key !== card.key) card.key = renderCity(card.el, card.city, card.w, card.air);
}

export function initWeather() {
  buildWeather();
  loadWeather();
  setInterval(loadWeather, WEATHER_TTL);
  setInterval(refreshWeather, 30_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });
}
