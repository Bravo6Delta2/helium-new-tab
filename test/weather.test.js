import { test } from "node:test";
import assert from "node:assert/strict";
import { aqiLabel, compass, describe, isStale, topPollen, weatherNow, weatherUrl } from "../src/weather-logic.js";

// A forecast as Open-Meteo sends it, for a city in UTC+9 with no summer time
const forecast = (over = {}) => ({
  timezone: "Asia/Tokyo",
  utc_offset_seconds: 9 * 3600,
  current: { time: "2026-11-18T10:00" },
  daily: {
    time: ["2026-11-17", "2026-11-18", "2026-11-19"],
    sunset: ["2026-11-17T16:31", "2026-11-18T16:30", "2026-11-19T16:30"],
  },
  ...over,
});

test("weatherNow reads the city's own today and time", () => {
  const w = weatherNow(forecast(), new Date("2026-11-18T01:30:00Z")); // 10:30 in Tokyo
  assert.equal(w.now, "2026-11-18T10:30");
  assert.equal(w.today, "2026-11-18");
  assert.equal(w.first, 1);
  assert.equal(w.sunsetPassed, false);
  assert.equal(w.stale, false);
});

test("weatherNow notices sunset, and conditions going stale", () => {
  const w = weatherNow(forecast(), new Date("2026-11-18T08:00:00Z")); // 17:00 in Tokyo
  assert.equal(w.sunsetPassed, true);
  assert.equal(w.stale, true);
  assert.notEqual(w.key, weatherNow(forecast(), new Date("2026-11-18T01:30:00Z")).key);
});

test("weatherNow uses the saved offset for a zone it doesn't know", () => {
  const w = weatherNow(forecast({ timezone: "Not/AZone" }), new Date("2026-11-18T01:30:00Z"));
  assert.equal(w.now, "2026-11-18T10:30");
});

test("a saved forecast past its last day has no today", () => {
  const w = weatherNow(forecast(), new Date("2026-11-25T01:30:00Z"));
  assert.equal(w.first, -1);
  assert.equal(w.sunsetPassed, false);
  assert.equal(w.stale, true);
});

test("conditions without a time count as stale", () => {
  assert.ok(isStale("2026-11-18T10:30", undefined));
  assert.ok(!isStale("2026-11-18T10:30", "2026-11-18T09:31"));
});

test("describe, compass, aqiLabel and topPollen", () => {
  assert.deepEqual(describe(0, 0), { text: "Clear", icon: "moon" });
  assert.deepEqual(describe(1234), { text: "Unknown", icon: "cloud" });
  assert.equal(compass(350), "N");
  assert.equal(compass(null), "");
  assert.equal(aqiLabel(20), "Good");
  assert.equal(aqiLabel(500), "Extremely poor");
  assert.deepEqual(topPollen({ birch_pollen: 3, grass_pollen: 12, olive_pollen: null }), { name: "Grass", v: 12 });
  assert.equal(topPollen({}), null);
});

test("weatherUrl asks for Fahrenheit only when set", () => {
  const cities = [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }];
  assert.match(weatherUrl(cities, false), /latitude=1,3&longitude=2,4/);
  assert.doesNotMatch(weatherUrl(cities, false), /fahrenheit/);
  assert.match(weatherUrl(cities, true), /temperature_unit=fahrenheit/);
});
