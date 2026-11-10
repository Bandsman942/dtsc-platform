import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const catalogSource = read("lib/public-documentation.ts");
const domains = read("lib/domains.ts");
const middleware = read("middleware.ts");
const page = read("app/documentation/page.tsx");
const publicHome = read("app/page.tsx");
const nav = read("components/public/public-nav.tsx");
const navLinks = read("components/public/public-links.ts");
const navI18n = read("lib/public-navigation-i18n.ts");
const publicFooter = read("components/public/public-shell.tsx");
const sitemap = read("app/sitemap.ts");
const robots = read("app/robots.ts");
const products = read("lib/product-registry.ts");
const version = JSON.parse(read("package.json")).version;
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
assert.ok(page.includes('generateMetadata') && page.includes('getCurrentHostType'), "Metadata must be host-aware.");
assert.ok(page.includes('"/documentation"') && page.includes('basePath ='), "Public site must render the same portal directly.");
assert.ok(page.includes('notFound()'), "Unknown guide slugs must return a real 404.");
assert.ok(page.includes('<form action={basePath}'), "Search must not leave the public documentation page.");
assert.ok(page.includes("const link = (filters: Filters = {}) => buildLink(filters, basePath)"), "Links must preserve their current host.");
assert.ok(publicHome.includes('href="/documentation"'), "Public home must link to docs.");
assert.ok(publicHome.includes('href="/documentation?audience=users"'), "User path must be promoted on home.");
assert.ok(publicHome.includes('href="/documentation?audience=developers"'), "Developer path must be promoted on home.");
assert.ok(nav.includes('href: "/documentation"'), "Desktop navigation must include Docs.");
assert.ok(navLinks.includes('href: "/documentation"'), "Mobile navigation must include Docs.");
assert.ok(navI18n.includes('documentation: "Documentation DTSC"') && navI18n.includes('documentation: "DTSC documentation"'), "Navigation must be bilingual.");
assert.ok(publicFooter.includes('["Documentation DTSC", "/documentation"]'), "Public footer must include Docs.");
assert.ok(sitemap.includes('path: "/documentation"') && sitemap.includes('PUBLIC_DOCUMENTATION.flatMap'), "Both public and Docs sitemaps must include the portal.");
assert.ok(robots.includes('"/documentation"'), "Public crawlers must be allowed to index docs.");
assert.ok(products.includes('code: "DOCS"') && products.includes('status: "ACTIVE"'), "Docs must be in canonical product registry.");
assert.equal(version, "1.8.0", "This PR is the 1.8.0 feature candidate.");
assert.ok(program.includes("FUTURE_API_ONLY"));
assert.ok(catalog.find((entry) => entry.slug === "api-feuille-de-route")?.fr.notice.includes("En préparation"));
console.log("PASS docs #1099: 12 curated FR/EN entries, direct public site, dual-host routing, API guard, navigation, SEO and publication matrix.");
