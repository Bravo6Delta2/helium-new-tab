// Open-Meteo's forecasts, and what they say about now. No DOM or settings here, so the
// tests can run it.
import { utcOffset, validTz } from "./time.js";

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
export const describe = (code, isDay = true) => {
  const [text, name] = WMO[code] || ["Unknown", "cloud"];
  return { text, icon: name === "sun" && !isDay ? "moon" : name };
};

export function weatherUrl(cities, fahrenheit) {
  const lat = cities.map((c) => c.lat).join(",");
  const lon = cities.map((c) => c.lon).join(",");
  return "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat}&longitude=${lon}`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset"
    + "&wind_speed_unit=ms&timezone=auto&forecast_days=7"
    + (fahrenheit ? "&temperature_unit=fahrenheit" : "");
}

// Air quality is a separate Open-Meteo API. Pollen is only modelled for Europe, and is 0 off-season.
const POLLEN = { alder: "Alder", birch: "Birch", grass: "Grass", mugwort: "Mugwort", olive: "Olive", ragweed: "Ragweed" };

export function airUrl(cities) {
  const lat = cities.map((c) => c.lat).join(",");
  const lon = cities.map((c) => c.lon).join(",");
  return "https://air-quality-api.open-meteo.com/v1/air-quality"
    + `?latitude=${lat}&longitude=${lon}`
    + "&current=european_aqi," + Object.keys(POLLEN).map((k) => k + "_pollen").join(",")
    + "&timezone=auto";
}

// European AQI bands
const AQI = [[20, "Good"], [40, "Fair"], [60, "Moderate"], [80, "Poor"], [100, "Very poor"], [Infinity, "Extremely poor"]];
export const aqiLabel = (v) => AQI.find(([max]) => v <= max)[1];
// Rough levels in grains/m³. The official thresholds differ a little per plant.
export const pollenLevel = (v) => v < 1 ? "None" : v < 10 ? "Low" : v < 50 ? "Moderate" : "High";

export function topPollen(current) {
  let top = null;
  for (const [key, name] of Object.entries(POLLEN)) {
    const v = current[key + "_pollen"];
    if (v != null && (!top || v > top.v)) top = { name, v };
  }
  return top;
}

// Open-Meteo sends null for a value a model doesn't have, shown as a dash
export const has = (v) => typeof v === "number" && Number.isFinite(v);
export const deg = (t) => has(t) ? `${Math.round(t)}°` : "–";
export const fixed = (v, unit) => has(v) ? `${v.toFixed(1)} ${unit}` : "–";
export const compass = (d) => has(d) ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8] : "";

// Both are the city's wall clock, "2026-11-17T06:52"
export const isStale = (now, time) => !(Date.parse(now + "Z") - Date.parse(time + "Z") <= WEATHER_STALE);

// What a forecast says depends on the city's date and time at, as a saved copy is shown
// offline: which day is today, whether the sun has set, and how old the conditions are.
// The key changes when any of them does, for the card to be drawn again.
export function weatherNow(w, at = new Date()) {
  // The zone, for summer time since the forecast was fetched, or else its offset then
  const min = validTz(w.timezone) ? utcOffset(w.timezone, at) : (w.utc_offset_seconds ?? 0) / 60;
  const now = new Date(at.getTime() + min * 60_000).toISOString().slice(0, 16), today = now.slice(0, 10);
  const first = w.daily.time.indexOf(today);
  const sunsetPassed = first !== -1 && typeof w.daily.sunset[first] === "string" && now > w.daily.sunset[first];
  // NaN, for conditions without a time, counts as stale
  const stale = isStale(now, w.current.time);
  return { now, today, first, sunsetPassed, stale, key: [today, first, sunsetPassed, stale].join() };
}
