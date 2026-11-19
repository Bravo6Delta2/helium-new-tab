import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtBytes, fmtDuration, periodDays, periodOr } from "../src/report.js";
import { dayOf, daysAgo, KEEP_DAYS, KINDS } from "../src/shared.js";
import { baseDomain, classify, indexTrackers } from "../src/trackers.js";

test("KINDS keeps the order saved days and tracker lists were written in", () => {
  // Reordering it would misread every stored count and tracker list
  assert.deepEqual(KINDS, ["trackers", "ads", "other"]);
  assert.equal(KEEP_DAYS, 90);
});

test("dayOf is the local day, from a Date or a timestamp", () => {
  const midnight = new Date(2026, 0, 1, 0, 0, 0);
  assert.equal(dayOf(midnight), "2026-01-01");
  assert.equal(dayOf(midnight.getTime()), "2026-01-01");
  assert.equal(dayOf(midnight.getTime() - 1), "2025-12-31");
  assert.equal(daysAgo(1, midnight), "2025-12-31");
  assert.equal(daysAgo(0, midnight), "2026-01-01");
});

const services = {
  categories: {
    Advertising: [{ AdCo: { "https://adco.example": ["adco.com", "both.com"] } }],
    Analytics: [{ TrackCo: { "https://trackco.example": ["trackco.com", "both.com"], dnt: "eff" } }],
    Content: [{ CdnCo: { "https://cdn.example": ["cdn.com"] } }],
  },
};

test("indexTrackers packs company and kind, and ads win over trackers", () => {
  const list = indexTrackers(services);
  assert.deepEqual(list.names, ["AdCo", "TrackCo", "CdnCo"]);
  assert.equal(list.index["adco.com"], 0 * 3 + KINDS.indexOf("ads"));
  assert.equal(list.index["both.com"], 0 * 3 + KINDS.indexOf("ads"));
  assert.equal(list.index["trackco.com"], 1 * 3 + KINDS.indexOf("trackers"));
  assert.equal(list.index["cdn.com"], 2 * 3 + KINDS.indexOf("other"));
});

test("classify matches a domain's subdomains, and names others by their domain", () => {
  const list = indexTrackers(services);
  assert.deepEqual(classify("pixel.trackco.com", list), ["trackers", "TrackCo"]);
  assert.deepEqual(classify("both.com", list), ["ads", "AdCo"]);
  assert.deepEqual(classify("a.b.unknown.co.uk", list), ["other", "unknown.co.uk"]);
  assert.deepEqual(classify("constructor", list), ["other", "constructor"]);
  assert.deepEqual(classify("x.trackco.com", null), ["other", "trackco.com"]);
});

test("baseDomain", () => {
  assert.equal(baseDomain("a.b.example.com"), "example.com");
  assert.equal(baseDomain("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(baseDomain("10.0.0.1"), "10.0.0.1");
  assert.equal(baseDomain("[::1]"), "[::1]");
});

test("report formats", () => {
  assert.equal(fmtBytes(45_000), "45.0 KB");
  assert.equal(fmtBytes(4_500_000), "4.50 MB");
  assert.equal(fmtBytes(5e15), "5000 TB");
  assert.equal(fmtDuration(30_000), "30 s");
  assert.equal(fmtDuration(90 * 60_000), "1.5 h");
  assert.equal(periodDays("30d"), 30);
  assert.equal(periodOr("90d", "7d"), "90d");
  assert.equal(periodOr("junk", "7d"), "7d");
});
