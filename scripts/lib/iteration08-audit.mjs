import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => { const target = path.join(root, file); if (!fs.existsSync(target)) { failures.push(`${file}: fichier absent`); return ""; } return fs.readFileSync(target, "utf8"); };
const requireText = (file, needles) => { const content = read(file); for (const needle of needles) if (!content.includes(needle)) failures.push(`${file}: contrat absent: ${needle}`); };
const forbidText = (file, needles) => { const content = read(file); for (const needle of needles) if (content.includes(needle)) failures.push(`${file}: motif interdit: ${needle}`); };

export function runIteration08Audit(scope = "all") {
  const enabled = (name) => scope === "all" || scope === name;
  if (enabled("design-system")) { requireText("app/design-system.css", ["--dtsc-brand-primary", "--dtsc-background", "--dtsc-focus", "prefers-reduced-motion", ".dtsc-display"]); requireText("docs/DTSC_FRONTEND_DESIGN_SYSTEM.md", ["Tokens sémantiques", "Typographie", "Motion"]); }
  if (enabled("brand-tokens")) forbidText("lib/dtsc.ts", ["DtscAdmin2026!", 'password: process.env.DEFAULT_ADMIN_PASSWORD ||']);
  if (enabled("public-layout")) { requireText("components/public/public-shell.tsx", ["PublicHeader", "PublicNav"]); requireText("components/public/public-search-dialog.tsx", ["role=\"dialog\"", "PublicSiteSearch"]); forbidText("components/public/public-shell.tsx", ["<PublicSiteSearch />"]); }
  if (enabled("public-i18n")) requireText("components/layout/product-preferences-controls.tsx", ["dtsc_locale", '"fr"', '"en"']);
  if (enabled("public-seo")) { requireText("app/layout.tsx", ["generateMetadata", "index: false", "getProductBaseUrl"]); requireText("app/sitemap.ts", ["getPublicBaseUrl"]); forbidText("app/sitemap.ts", ["process.env.APP_URL"]); }
  if (enabled("public-content")) requireText("app/page.tsx", ["Sept leviers numériques", "Demander une consultation", "Aucun cas client"]);
  if (enabled("public-images")) { forbidText("app/page.tsx", ["images.unsplash.com", "images.pexels.com", "<img"]); forbidText("app/auth/sign-in/page.tsx", ["images.unsplash.com", "images.pexels.com"]); }
  if (enabled("account")) { requireText("components/auth/account-product-shell.tsx", ["AccountProductShell", "ProductPreferencesControls"]); requireText("components/auth/auth-form.tsx", ["Mot de passe oublié", "confirmPassword", "legalConsent"]); forbidText("app/auth/sign-in/page.tsx", ["AppShell", "ProfessionalToolbox"]); }
  if (enabled("account-recovery")) { requireText("prisma/account-recovery.prisma", ["PasswordResetToken", "tokenHash", "usedAt", "expiresAt"]); requireText("app/api/auth/reset-password/route.ts", ["hashPasswordResetToken", "RESET_TOKEN_ALREADY_USED", "clearSessionCookie"]); forbidText("app/api/auth/forgot-password/route.ts", ["console.log(token", "metadata: { token"]); }
  if (enabled("support")) { requireText("components/support/support-product-shell.tsx", ["SupportProductShell", "ProductNavigation"]); requireText("app/support/page.tsx", ["PAGE_SIZE", "SupportPagination", "SupportGuestEntry"]); forbidText("app/support/page.tsx", ["<AppShell", "take: canManageTickets ? 200 : 100"]); }
  if (enabled("product-navigation")) requireText("lib/product-registry.ts", ["DTSC_PRODUCT_REGISTRY", "PLANNED_DTSC_PRODUCTS", "getVisibleProductDefinitions"]);
  if (enabled("multi-domain")) { requireText("components/floating-actions/floating-action-hub.tsx", ["const registry = useMemo", 'hostType === "app"', 'hostType === "support"']); forbidText("components/floating-actions/floating-action-hub.tsx", ["value={{ register }}"]); }
  if (enabled("pwa")) { requireText("app/manifest.webmanifest/route.ts", ["Vary", 'product.code === "APP" ? "/dashboard"', 'product.code === "SUPPORT" ? "/support"']); forbidText("app/manifest.webmanifest/route.ts", ['product.code === "PUBLIC" ? "/dashboard"']); }
  if (enabled("accessibility")) requireText("components/public/public-nav.tsx", ["aria-modal=\"true\"", "Escape", "aria-current"]);
  if (enabled("performance")) { requireText("components/public/lazy-public-agent.tsx", ["dynamic", "ssr: false"]); forbidText("app/page.tsx", ["autoPlay", "setInterval("]); }
  if (enabled("security")) { requireText("lib/default-admin.ts", ["DEFAULT_ADMIN_PASSWORD must contain at least 16 characters"]); requireText("app/api/auth/organizations/route.ts", ["verifyPassword", "password"]); requireText("app/api/auth/sign-up/route.ts", ["PASSWORD_POLICY_FAILED", "legalConsent", "REGISTRATION_UNAVAILABLE"]); forbidText("lib/dtsc.ts", ["DtscAdmin2026!", "admin@dtsc-platform.com"]); }
  if (enabled("guides")) requireText("lib/user-guides/iteration08-guides.ts", ["ACCOUNT_PASSWORD_RECOVERY", "PUBLIC_AI_ASSISTANT", "PRIVACY_AND_COOKIES", "en:"]);
  if (enabled("commercial-maturity")) requireText("lib/modules/standard-module-registry.ts", ["STANDARD-08", "ACCOUNT_RECOVERY", "COMMERCIAL_READY interdit"]);
  if (failures.length) { console.error(`Iteration 08 QA failed (${scope})\n- ${failures.join("\n- ")}`); process.exitCode = 1; return; }
  console.log(`Iteration 08 QA passed (${scope})`);
}
