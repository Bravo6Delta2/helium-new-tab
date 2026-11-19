// What Settings saves, checked against CONFIG. No DOM or storage here, so the tests can run
// it: page.js reads the saved copy and keeps the live one.
import { validTz } from "./time.js";

// Two slots each, left and right. Once saved, these win over CONFIG.
export const SLOTS = ["Left", "Right"];

// The engines in CONFIG, then yours from Settings. Names in that order, as an object puts
// keys like "1" first.
export const engineNames = (s, config) => [...Object.keys(config.search.engines), ...s.engines.map((e) => e.name)];
export const allEngines = (s, config) =>
  ({ ...config.search.engines, ...Object.fromEntries(s.engines.map((e) => [e.name, e.url])) });
// CONFIG's, or the first engine if that one's gone
export const defaultEngine = (config) =>
  Object.hasOwn(config.search.engines, config.search.engine) ? config.search.engine : Object.keys(config.search.engines)[0];

// Saved settings over CONFIG's, with anything malformed dropped
export function normalizeSettings(saved, config) {
  const s = {
    weather: config.cities, clocks: config.clocks,
    hour12: config.hour12, fahrenheit: config.fahrenheit, engine: config.search.engine,
    engines: [], bangs: [],
    ...(saved && typeof saved === "object" ? saved : {}),
  };
  // New arrays, so filling a slot never changes CONFIG's
  for (const k of ["weather", "clocks"]) s[k] = SLOTS.map((_, i) => s[k]?.[i] || null);
  s.clocks = s.clocks.map((c) => c && validTz(c.tz) ? c : null);
  // Your own engines ({ name, url }) and bangs ({ t, name, url })
  const str = (v) => typeof v === "string" && v !== "";
  s.engines = (Array.isArray(s.engines) ? s.engines : []).filter((e) => str(e?.name) && str(e.url));
  s.bangs = (Array.isArray(s.bangs) ? s.bangs : []).filter((b) => str(b?.t) && str(b.url) && typeof b.name === "string");
  // An engine since removed falls back to the first one
  if (!Object.hasOwn(allEngines(s, config), s.engine)) s.engine = defaultEngine(config);
  return s;
}

// A web address with %s where the search terms go. A bang may leave it out, to always open
// the same page. "" when it's fine.
export function templateError(url, needTerms) {
  if (needTerms && !url.includes("%s")) return "Put %s where the search terms go";
  try {
    if (!/^(https?|chrome|file):$/.test(new URL(url.replaceAll("%s", "x")).protocol)) throw 0;
  } catch {
    return "Enter a web address, like https://example.com/search?q=%s";
  }
  return "";
}
