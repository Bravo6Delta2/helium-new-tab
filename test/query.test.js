import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fill, findBang, FLAG, isSearchPage, looksLikeUrl, matchBangs, ownBangEntry, parseBangList, resolve, runBang,
} from "../src/query.js";
import { hostOf } from "../src/url.js";

test("findBang finds a bang anywhere and keeps the rest as terms", () => {
  assert.deepEqual(findBang("!yt lofi"), { key: "yt", terms: "lofi" });
  assert.deepEqual(findBang("lofi !YT"), { key: "yt", terms: "lofi" });
  assert.deepEqual(findBang("lofi !yt beats"), { key: "yt", terms: "lofi beats" });
  assert.equal(findBang("hello!yt"), null);
  assert.equal(findBang("no bang"), null);
});

test("fill encodes every %s and keeps $ patterns as typed", () => {
  assert.equal(fill("https://x.com/?q=%s&r=%s", "a b"), "https://x.com/?q=a%20b&r=a%20b");
  assert.equal(fill("https://x.com/?q=%s", "$&"), "https://x.com/?q=%24%26");
});

test("looksLikeUrl tells sites from searches and file names", () => {
  for (const url of ["example.com", "https://x.y/z", "localhost:3000", "localhost", "192.168.1.1/admin", "sub.example.co.uk/path?q=1", "chrome://settings", "readme.md"]) {
    assert.ok(looksLikeUrl(url), url);
  }
  for (const text of ["package.json", "app.js", "hello world", "what is a.b", "v1.2"]) {
    assert.ok(!looksLikeUrl(text), text);
  }
});

test("runBang follows Kagi's flags", () => {
  const bang = { u: "https://www.youtube.com/results?search_query={searchTerms}", f: FLAG.ENCODE | FLAG.SPACE_TO_PLUS | FLAG.OPEN_SNAP_DOMAIN };
  assert.equal(runBang(bang, "lofi beats"), "https://www.youtube.com/results?search_query=lofi+beats");
  assert.equal(runBang(bang, ""), "https://www.youtube.com");
  assert.equal(runBang({ u: "https://x.com/search/{searchTerms}", f: FLAG.OPEN_BASE_PATH }, ""), "https://x.com/search/");
  // No flags means all of them
  assert.equal(runBang({ u: "https://x.com/?q={searchTerms}" }, "a&b"), "https://x.com/?q=a%26b");
  assert.equal(runBang({ u: "chrome://settings/?search={searchTerms}" }, ""), "chrome://settings/?search=");
  assert.equal(runBang({ u: "not a url {searchTerms}" }, ""), null);
});

test("ownBangEntry encodes terms like an engine, and a page without %s opens as is", () => {
  const search = ownBangEntry(["Wiki", "https://en.wikipedia.org/wiki/%s"]);
  assert.equal(runBang(search, "New York"), "https://en.wikipedia.org/wiki/New%20York");
  assert.equal(runBang(search, ""), "https://en.wikipedia.org");
  const page = ownBangEntry(["Mail", "https://mail.example.com/inbox"]);
  assert.equal(runBang(page, ""), "https://mail.example.com/inbox");
});

test("resolve picks a bang, an address or a search", () => {
  const ctx = {
    lookup: (key) => key === "cl" ? ownBangEntry(["Claude", "https://claude.ai/new?q=%s"]) : null,
    search: "https://search.example/?q=%s",
    unknownBang: "https://duckduckgo.com/?q=%s",
  };
  assert.equal(resolve("  ", ctx), null);
  assert.equal(resolve("!cl hi there", ctx), "https://claude.ai/new?q=hi%20there");
  assert.equal(resolve("hi !zz", ctx), "https://duckduckgo.com/?q=hi%20!zz");
  assert.equal(resolve("example.com", ctx), "https://example.com");
  assert.equal(resolve("localhost:8080/x", ctx), "http://localhost:8080/x");
  assert.equal(resolve("ftp://files.example", ctx), "ftp://files.example");
  assert.equal(resolve("package.json", ctx), "https://search.example/?q=package.json");
  // A bang whose address won't open with no terms falls through to an address or a search
  const broken = { ...ctx, lookup: () => ({ u: "not a url {searchTerms}" }) };
  assert.equal(resolve("!bad", broken), "https://search.example/?q=!bad");
});

test("parseBangList reads Helium's commented JSON with trailing commas", () => {
  const list = parseBangList(`// License header
// more
[
  { "s": "YouTube", "ts": ["yt", "youtube",], "u": "https://youtube.com/{searchTerms}", },
]`);
  assert.deepEqual(list, [{ s: "YouTube", ts: ["yt", "youtube"], u: "https://youtube.com/{searchTerms}" }]);
});

test("matchBangs puts exact matches first and lets your own bangs win", () => {
  const helium = [
    { s: "YouTube", ts: ["yt", "youtube", "ytb"], u: "https://youtube.com/?q={searchTerms}" },
    { s: "Yahoo", ts: ["y", "yahoo"], u: "https://yahoo.com/?q={searchTerms}" },
    { s: "Yandex", ts: ["ya"], u: "https://yandex.com/?q={searchTerms}" },
  ];
  const own = [["ya", "Mine", "https://mine.example/?q=%s"], ["ya", "Shadowed", "https://other.example/%s"]];
  const rows = matchBangs("y", own, helium, 6);
  assert.deepEqual(rows.map((r) => r.bang), ["y", "ya", "yt"]);
  assert.equal(rows[1].title, "Mine");
  assert.equal(rows[1].url, "https://mine.example/?q=");
  assert.equal(matchBangs("y", [], helium, 2).length, 2);
});

test("isSearchPage only matches engines with the terms in the query", () => {
  const engines = ["https://www.google.com/search?q=%s", "https://en.wikipedia.org/wiki/%s", "https://x.com/s?q=%s&view=search"];
  assert.ok(isSearchPage("https://www.google.com/search?q=cats", engines));
  assert.ok(!isSearchPage("https://en.wikipedia.org/wiki/Cat", engines));
  assert.ok(isSearchPage("https://x.com/s?q=cats&view=search", engines));
  assert.ok(!isSearchPage("https://x.com/s?q=cats", engines));
});

test("hostOf drops www, and keeps the port when asked", () => {
  assert.equal(hostOf("https://www.example.com/a"), "example.com");
  assert.equal(hostOf("http://localhost:8080", true), "localhost:8080");
  assert.equal(hostOf("not a url"), "");
});
