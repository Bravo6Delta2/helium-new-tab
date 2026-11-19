import { test } from "node:test";
import assert from "node:assert/strict";
import { clockOf, hourLabel, offsetLabel, utcOffset, validTz, whenOf } from "../src/time.js";

test("validTz only takes zones the browser knows", () => {
  assert.ok(validTz("Europe/Belgrade"));
  assert.ok(!validTz("Not/AZone"));
  assert.ok(!validTz(""));
  assert.ok(!validTz(null));
});

test("utcOffset follows summer time", () => {
  assert.equal(utcOffset("America/New_York", new Date("2026-01-15T12:00:00Z")), -300);
  assert.equal(utcOffset("America/New_York", new Date("2026-07-15T12:00:00Z")), -240);
  assert.equal(utcOffset("Asia/Kolkata", new Date("2026-07-15T12:00:00Z")), 330);
  assert.equal(utcOffset("UTC", new Date("2026-07-15T12:00:59.900Z")), 0);
});

test("offsetLabel", () => {
  assert.equal(offsetLabel(0), "Same time");
  assert.equal(offsetLabel(330), "+5h 30m");
  assert.equal(offsetLabel(-360), "−6h");
});

test("clockOf and whenOf read a city's wall clock", () => {
  assert.equal(clockOf("2026-11-17T06:52", false), "06:52");
  assert.equal(clockOf("2026-11-17T00:05", true), "12:05 AM");
  assert.equal(clockOf("2026-11-17T13:05", true), "1:05 PM");
  assert.equal(clockOf(null, false), "–");
  assert.equal(whenOf("2026-11-17T06:52", "2026-11-17", false), "06:52");
  assert.equal(whenOf("2026-11-16T22:00", "2026-11-17", false), "Mon, Nov 16, 22:00");
});

test("hourLabel", () => {
  assert.equal(hourLabel(0, true), "12 AM");
  assert.equal(hourLabel(15, true), "3 PM");
  assert.equal(hourLabel(9, false), "09:00");
});
