import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const catalogSource = read("lib/public-documentation.ts");
const domains = read("lib/domains.ts");
const middleware = read("middleware.ts");
const page = read("app/documentation/page.tsx");
const program = read("docs/PUBLIC_DOCUMENTATION_PROGRAM.md");

const match = catalogSource.match(/export const PUBLIC_DOCUMENTATION: DocumentationEntry\[\] = (\[[\s\S]*?\]);\n\nexport function/);
assert.ok(match, "Documentation catalog must be a parsable static JSON array.");
const catalog = JSON.parse(match[1]);
assert.equal(catalog.length, 12, "T1 must publish 12 curated documentation records.");
const slugs = new Set();
const audiences = new Set();
for (const entry of catalog) {
  assert.ok(/^[a-z0-9-]+$/.test(entry.slug), "Every slug must be URL-safe.");
  assert.ok(!slugs.has(entry.slug), "Duplicate documentation slug: " + entry.slug);
  slugs.add(entry.slug);
  audiences.add(entry.audience);
  assert.ok(["users", "developers"].includes(entry.audience), "Unknown audience");
  assert.ok(entry.source.startsWith("docs/"), "Source reference must point inside docs/");
  assert.ok(existsSync(new URL("../" + entry.source, import.meta.url)), "Missing source document: " + entry.source);
  for (const language of ["fr", "en"]) {
    assert.ok(entry[language].title.length >= 8);
    assert.ok(entry[language].summary.length >= 15);
    assert.ok(Array.isArray(entry[language].steps) && entry[language].steps.length >= 3);
    assert.ok(entry[language].notice.length >= 25);
  }
}
assert.deepEqual([...audiences].sort(), ["developers", "users"]);
assert.ok(domains.includes('docs: "https://docs.dtsc-platform.com"'));
assert.ok(domains.includes('return "docs";'), "Domain resolver must identify docs host.");
assert.ok(domains.includes('export function getDocsUrl('));
assert.ok(middleware.includes('if (hostType === "docs")'), "Docs host must have an isolated routing branch.");
assert.ok(middleware.includes('NextResponse.rewrite(target)'), "Docs root must map to documentation route.");
assert.ok(middleware.includes('return NextResponse.json({ error: "Not found" }, { status: 404 });'), "Documentation host must block internal API calls.");
assert.ok(page.includes('PUBLIC_DOCUMENTATION') && page.includes('getPublicDocumentation'));
assert.ok(page.includes('docs.dtsc-platform.com'));
assert.ok(page.includes('getDocsUrl'));
assert.ok(program.includes("FUTURE_API_ONLY"));
assert.ok(catalog.find((entry) => entry.slug === "api-feuille-de-route")?.fr.notice.includes("En préparation"));
console.log("PASS docs #1099: 12 curated FR/EN entries, host routing, API guard, publication matrix.");
