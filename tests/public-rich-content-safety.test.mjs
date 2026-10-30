import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeRichHtml } from "../lib/rich-content.ts";

test("keeps editorial formatting", () => {
  assert.equal(sanitizeRichHtml("<h2>Titre</h2><p><strong>Texte</strong> <em>utile</em>.</p>"), "<h2>Titre</h2><p><strong>Texte</strong> <em>utile</em>.</p>");
});
test("discards script, svg, iframe and hostile subtrees", () => {
  const html = sanitizeRichHtml('<p>Avant</p><script>alert(1)</script><svg><a href="javascript:alert(1)">X</a></svg><iframe src="https://evil.test"></iframe><p>Après</p>');
  assert.equal(html, "<p>Avant</p><p>Après</p>");
});
test("removes handlers, javascript URLs and data SVG images", () => {
  const html = sanitizeRichHtml('<img src="/api/public/publication-images/c.webp" onerror=alert(1)><a href="java&#x73;cript:alert(1)" onclick="evil()">Lien</a><img src="data:image/svg+xml;base64,AAAA">');
  assert.ok(html.includes('src="/api/public/publication-images/c.webp"'));
  for (const unsafe of ["onerror","onclick","javascript:","data:image","<a"]) assert.ok(!html.includes(unsafe));
});
test("permits only safe inline styles", () => {
  const html = sanitizeRichHtml('<p style="line-height:1.5;margin-bottom:12px;background-image:url(javascript:evil);position:fixed;color:#0057b8">Texte</p>');
  for (const allowed of ["line-height:1.5","margin-bottom:12px","color:#0057b8"]) assert.ok(html.includes(allowed));
  for (const blocked of ["background-image","position:fixed","javascript:"]) assert.ok(!html.includes(blocked));
});
test("safe links ignore attacker-specified target and rel", () => {
  const html = sanitizeRichHtml('<a href="https://example.org/?a=1&amp;b=2" target="_self" rel="opener">Lire</a>');
  assert.ok(html.includes('href="https://example.org/?a=1&amp;b=2"'));
  assert.ok(html.includes('rel="noopener noreferrer nofollow"'));
  assert.ok(!html.includes('target="_self"'));
});
test("keeps tables, images and semantic structure", () => {
  const html = sanitizeRichHtml('<table class="dtsc-rich-table"><tbody><tr><td rowspan="2" onclick="evil()">1</td></tr></tbody></table><figure><img src="/img.webp" alt="Graphique"></figure>');
  assert.ok(html.includes("rowspan"));
  assert.ok(html.includes('src="/img.webp"'));
  assert.ok(!html.includes("onclick"));
});
test("malformed HTML remains inert", () => {
  const html = sanitizeRichHtml('<div><img src=x onerror=alert(1)><p>Texte<script>alert(1)');
  assert.ok(html.includes("Texte"));
  assert.ok(!html.includes("onerror"));
  assert.ok(!html.includes("<script"));
});
