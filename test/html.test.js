import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, html, raw } from "../src/html.js";

test("esc escapes markup and both quotes", () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), "&#60;a href=&#34;x&#34; title=&#39;y&#39;&#62;&#38;&#60;/a&#62;");
});

test("html escapes values and keeps its own fragments", () => {
  const name = `"><script>alert(1)</script>`;
  const out = String(html`<li title="${name}">${html`<b>${name}</b>`}</li>`);
  assert.ok(!out.includes("<script>"));
  assert.equal(out, `<li title="&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62;"><b>&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62;</b></li>`);
});

test("html joins arrays, drops null and undefined, and writes booleans and numbers", () => {
  assert.equal(String(html`<ul>${["a<", html`<li>b</li>`, null, undefined]}</ul>`), "<ul>a&#60;<li>b</li></ul>");
  assert.equal(String(html`<i aria-selected="${false}" data-n="${0}"></i>`), `<i aria-selected="false" data-n="0"></i>`);
});

test("raw goes in as is, and nothing is escaped twice", () => {
  assert.equal(String(html`${raw("<svg></svg>")}`), "<svg></svg>");
  assert.equal(String(html`${html`${"&"}`}`), "&#38;");
});
