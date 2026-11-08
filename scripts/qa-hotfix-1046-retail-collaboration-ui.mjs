import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(path, "utf8");
const navigation = source("components/enterprise/professional/retail-pos-section-navigation.tsx");
const retailPage = source("app/enterprise-modules/retail-page.tsx");
const retailEntry = source("app/enterprise-modules/RETAIL_POS/page.tsx");
const customer = source("components/enterprise/professional/retail-active-customer-bar.tsx");
const immersive = source("components/collaborators/collaborators-immersive-conversation-shell.tsx");
const collaborators = source("components/collaborators/collaborators-conversation-workspace.tsx");
const collaboratorsPage = source("app/collaborators/page.tsx");
const back = source("components/workspace/contextual-back-button.tsx");
const activation = source("components/enterprise/professional/retail-feature-activation-panel.tsx");
const deepLinks = source("lib/enterprise/retail/readiness-deep-links.ts");
const commercialEntry = source("app/enterprise-modules/RETAIL_POS/commercial/page.tsx");
const commercial = source("components/enterprise/professional/retail-commercial-workspace.tsx");
const commercialStyles = source("components/enterprise/professional/retail-commercial-workspace.module.css");
const fr = JSON.parse(source("locales/retail-workspace.fr.json"));
const en = JSON.parse(source("locales/retail-workspace.en.json"));

const sections = ["checkout", "customers", "sites", "staff", "invoices", "offline", "omnichannel", "payments", "equipment", "readiness", "activation", "inventory", "alerts"];
for (const section of sections) {
  assert.match(navigation, new RegExp(`id: "${section}"`), `POS is missing the ${section} section`);
  assert.match(retailPage, new RegExp(`posSection.id === "${section}"`), `${section} does not mount a dedicated workspace`);
}
assert.match(navigation, /href=\{item.href \?\? `\$\{POS_URL\}\?section=\$\{item.id\}`\}/, "POS cards must navigate to an individual URL");
assert.match(navigation, /id: "commercial"/, "POS directory must expose commercial pricing, offers and returns");
assert.match(navigation, /href: `\$\{POS_URL\}\/commercial`/, "Commercial card must use the existing dedicated route");
assert.match(commercialEntry, /<AppShell user=\{user\} hideContextualBack>/, "Commercial route must use the authenticated DTSC app shell without duplicate back controls");
assert.match(commercial, /data-retail-commercial-workspace/, "Commercial interface must have a dedicated DTSC design scope");
assert.match(commercial, /dtsc-card-alt/, "Commercial pricing header must use the brand card treatment");
assert.match(commercial, /aria-current=\{tab === item/, "Commercial tab selection must remain screen-reader accessible");
assert.match(commercialStyles, /var\(--dtsc-surface\)/, "Commercial controls must respect the DTSC theme");
assert.match(commercialStyles, /:focus-visible/, "Commercial controls must show a keyboard focus indicator");
assert.match(navigation, /getRetailPosSection\([\s\S]*?canManage/, "Server-side section selection must remain role-gated");
assert.match(retailPage, /options\?\.section && !posSection\) notFound\(\)/, "Unknown or forbidden sections must not mount");
assert.match(retailPage, /posSection \? \(/, "POS index should not mount the operational panels eagerly");
assert.match(retailPage, /RetailPosSectionDirectory/, "POS landing must show the section directory");
assert.match(retailEntry, /searchParams/, "POS deep links must survive page navigation/reload");
assert.match(customer, /data-retail-customer-workspace/, "Checkout customer surface must use the DTSC workspace style");
assert.match(customer, /grid-cols-\[minmax\(0,1fr\)\]/, "Customer search/form must stack at 320 px");
assert.match(customer, /border-dtsc-border/, "Customer form must respect light/dark DTSC tokens");
assert.match(collaboratorsPage, /hideContextualBack/, "Fullscreen collaboration must suppress the extra page-level back row");
assert.match(collaborators, /ContextualBackButton compact/, "The list must retain a discreet module back control");
assert.match(collaborators, /onBack=\{\(\) => setMobileListOpen\(true\)\}/, "Conversation back-to-list must be preserved");
assert.match(back, /compact = false/, "The common back action needs a compact accessible variant");
assert.match(immersive, /data-floating-action-hub/, "The mobile hub must not obscure the composer");
assert.match(collaborators, /\/collaborators\/contacts\/new/, "The add-contact action must remain accessible without the hub");
assert.match(collaborators, /VoiceConversationComposer/, "The audio, AI and attachment composer must stay mounted");
assert.match(collaborators, /startGroupCall\("VIDEO"\)/, "Video calls must stay available");
assert.match(activation, /\?section=activation#retail-feature-activation/, "Activation prerequisites must link to the dedicated screen");
assert.match(activation, /\?section=staff#retail-site-staff-access/, "Site staff prerequisites must link to the dedicated screen");
assert.match(deepLinks, /\?section=readiness#shop-point-of-sale-configuration/, "Readiness deep link must reach the dedicated screen");
assert.doesNotMatch(deepLinks, /RETAIL_POS#/, "Old POS anchor-only links would strand users at the directory");

const translationKeys = [...navigation.matchAll(/(?:title|description): "([A-Za-z][A-Za-z0-9]+)"/g)].map((match) => match[1]);
for (const key of [...translationKeys, "posNavTitle", "posNavDescription", "posNavBack"]) {
  assert.equal(typeof fr[key], "string", `${key} is missing in French`);
  assert.equal(typeof en[key], "string", `${key} is missing in English`);
}
console.log(`hotfix #1046 UI contracts: ${sections.length} POS detail sections and dedicated commercial workspace, role gates, FR/EN, customer responsive, collaboration back/composer and deep links OK`);
