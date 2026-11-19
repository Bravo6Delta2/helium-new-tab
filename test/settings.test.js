import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { allEngines, engineNames, normalizeSettings, templateError } from "../src/settings.js";

test("normalizeSettings fills in CONFIG's defaults", () => {
  const s = normalizeSettings(null, CONFIG);
  assert.deepEqual(s, {
    weather: [null, null], clocks: [null, null],
    hour12: CONFIG.hour12, fahrenheit: CONFIG.fahrenheit, engine: CONFIG.search.engine,
    engines: [], bangs: [],
  });
});

test("normalizeSettings drops what's malformed", () => {
  const s = normalizeSettings({
    clocks: [{ name: "Nowhere", tz: "Not/AZone" }, { name: "Tokyo", tz: "Asia/Tokyo" }, { name: "Extra", tz: "UTC" }],
    engines: [{ name: "Ok", url: "https://ok/?q=%s" }, { name: "" , url: "x" }, null, "junk"],
    bangs: [{ t: "cl", name: "Claude", url: "https://claude.ai/new?q=%s" }, { t: "no-name", url: "x" }, { t: "", name: "", url: "x" }],
  }, CONFIG);
  assert.deepEqual(s.clocks, [null, { name: "Tokyo", tz: "Asia/Tokyo" }]);
  assert.deepEqual(s.engines, [{ name: "Ok", url: "https://ok/?q=%s" }]);
  assert.deepEqual(s.bangs.map((b) => b.t), ["cl"]);
  assert.deepEqual(normalizeSettings({ engines: "nope", bangs: {} }, CONFIG).engines, []);
});

test("an engine since removed falls back to the default", () => {
  assert.equal(normalizeSettings({ engine: "Gone" }, CONFIG).engine, CONFIG.search.engine);
  assert.equal(normalizeSettings({ engine: "Mine", engines: [{ name: "Mine", url: "https://m/?q=%s" }] }, CONFIG).engine, "Mine");
});

test("filling a slot never changes CONFIG's", () => {
  const config = { ...CONFIG, cities: [null, null] };
  const s = normalizeSettings(null, config);
  s.weather[0] = { name: "Tokyo" };
  assert.deepEqual(config.cities, [null, null]);
});

test("engines keep their order, CONFIG's first", () => {
  const s = { engines: [{ name: "1", url: "https://one/?q=%s" }] };
  assert.deepEqual(engineNames(s, CONFIG), [...Object.keys(CONFIG.search.engines), "1"]);
  assert.equal(allEngines(s, CONFIG)["1"], "https://one/?q=%s");
});

test("templateError wants a web address, with %s when the terms are needed", () => {
  assert.equal(templateError("https://x.com/?q=%s", true), "");
  assert.equal(templateError("https://x.com/", false), "");
  assert.equal(templateError("chrome://settings", false), "");
  assert.match(templateError("https://x.com/", true), /%s/);
  assert.match(templateError("javascript:alert(%s)", true), /web address/);
  assert.match(templateError("nonsense %s", true), /web address/);
});
