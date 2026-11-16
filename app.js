const CONFIG = {
  hour12: false,

  cities: [
    { name: "Nikšić",    lat: 42.7731, lon: 18.9445 },
    { name: "Podgorica", lat: 42.4411, lon: 19.2636 },
  ],
};

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const fmtTime = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: CONFIG.hour12 });

// Tabler icons (MIT), the set Prism uses. Only the path data, wrapped by icon().
const ICONS = {
  "sun": '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
  "moon": '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"/>',
  "cloud": '<path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878"/>',
  "cloud-fog": '<path d="M7 16a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-12"/><path d="M5 20l14 0"/>',
  "cloud-rain": '<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7"/><path d="M11 13v2m0 3v2m4 -5v2m0 3v2"/>',
  "snowflake": '<path d="M10 4l2 1l2 -1"/><path d="M12 2v6.5l3 1.72"/><path d="M17.928 6.268l.134 2.232l1.866 1.232"/><path d="M20.66 7l-5.629 3.25l.01 3.458"/><path d="M19.928 14.268l-1.866 1.232l-.134 2.232"/><path d="M20.66 17l-5.629 -3.25l-2.99 1.738"/><path d="M14 20l-2 -1l-2 1"/><path d="M12 22v-6.5l-3 -1.72"/><path d="M6.072 17.732l-.134 -2.232l-1.866 -1.232"/><path d="M3.34 17l5.629 -3.25l-.01 -3.458"/><path d="M4.072 9.732l1.866 -1.232l.134 -2.232"/><path d="M3.34 7l5.629 3.25l2.99 -1.738"/>',
  "cloud-storm": '<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1"/><path d="M13 14l-2 4l3 0l-2 4"/>',
  "wind": '<path d="M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24"/><path d="M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24"/><path d="M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24"/>',
  "umbrella": '<path d="M4 12a8 8 0 0 1 16 0l-16 0"/><path d="M12 12v6a2 2 0 0 0 4 0"/>',
  "droplet": '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546"/>',
  "sunrise": '<path d="M3 17h1m16 0h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7m-9.7 5.7a4 4 0 0 1 8 0"/><path d="M3 21l18 0"/><path d="M12 9v-6l3 3m-6 0l3 -3"/>',
  "sunset": '<path d="M3 13h1"/><path d="M20 13h1"/><path d="M5.6 6.6l.7 .7"/><path d="M18.4 6.6l-.7 .7"/><path d="M8 13a4 4 0 1 1 8 0"/><path d="M3 17h18"/><path d="M7 20h5"/><path d="M16 20h1"/><path d="M12 5v-1"/>',
};
const icon = (name, size = 18) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/* ---------- background ---------- */
const shimmer = window.startShimmer ? startShimmer($("shimmer")) : { emphasize() {} };

/* ---------- clock ---------- */
function tick() {
  const now = new Date();
  $("time").textContent = fmtTime(now);
  $("date").textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  for (const el of document.querySelectorAll("[data-clock]")) el.textContent = fmtTime(now);
  setTimeout(tick, 1000 - now.getMilliseconds());
}
tick();

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

function weatherUrl() {
  const lat = CONFIG.cities.map((c) => c.lat).join(",");
  const lon = CONFIG.cities.map((c) => c.lon).join(",");
  return "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat}&longitude=${lon}`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset"
    + "&wind_speed_unit=ms&timezone=auto&forecast_days=7";
}

async function getWeather() {
  // One request covers every city. Open-Meteo returns an array when given several coordinates.
  const url = weatherUrl();
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
const clockOf = (iso) => iso.slice(11, 16);

function renderCity(el, city, w) {
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
      <div class="p-head"><h5>${city.name}</h5><h5 class="muted" data-clock>${fmtTime(new Date())}</h5></div>
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
        <div class="card">${sun}</div>
      </div>
      <h6 class="section">7-day forecast</h6>
      <ol class="week">${days}</ol>
      <div class="p-foot"><a href="https://open-meteo.com/">Weather data by Open-Meteo</a><p>Updated ${clockOf(c.time)}</p></div>
    </div>
    <button class="button pill" type="button" aria-expanded="${el.classList.contains("open")}">
      ${icon(now.icon)}<strong>${deg(c.temperature_2m)}</strong>${city.name}
    </button>`;
}

function closePanels(except) {
  for (const el of document.querySelectorAll(".wx.open")) {
    if (el === except) continue;
    el.classList.remove("open");
    el.querySelector(".pill").setAttribute("aria-expanded", "false");
  }
}

const cards = CONFIG.cities.map((city, i) => {
  const el = document.createElement("div");
  el.className = "wx" + (i === CONFIG.cities.length - 1 && i > 0 ? " end" : "");
  el.innerHTML = `<button class="button pill" type="button">${city.name}</button>`;
  el.addEventListener("click", (e) => {
    if (!e.target.closest(".pill")) return;
    closePanels(el);
    el.classList.toggle("open");
    el.querySelector(".pill").setAttribute("aria-expanded", el.classList.contains("open"));
    if (el.classList.contains("open")) shimmer.emphasize();
  });
  $("weather").appendChild(el);
  return el;
});
document.addEventListener("click", (e) => { if (!e.target.closest(".wx")) closePanels(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

async function loadWeather() {
  try {
    const data = await getWeather();
    CONFIG.cities.forEach((city, i) => renderCity(cards[i], city, data[i]));
  } catch (err) {
    cards.forEach((el, i) => {
      el.querySelector(".pill").textContent = `${CONFIG.cities[i].name}: weather unavailable`;
    });
  }
}
loadWeather();
setInterval(loadWeather, WEATHER_TTL);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });
