import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const landing = read("app/page.tsx");
const publicCard = read("components/pwa/public-pwa-install-card.tsx");
const navigation = read("components/public/public-nav.tsx");
const installPage = read("app/install/page.tsx");
const guide = read("components/pwa/app-install-onboarding.tsx");
const productRegistry = read("lib/product-registry.ts");
const middleware = read("middleware.ts");
const manifest = read("app/manifest.webmanifest/route.ts");
const serviceWorker = read("public/sw.js");
const layout = read("app/layout.tsx");

// The marketing host must never install the PUBLIC manifest instead of the
// APP manifest; install is initiated only after navigating to the APP origin.
assert.match(landing, /<PublicPWAInstallCard locale=\{lang\}/);
assert.match(landing, /getAppBaseUrl\(\).*\/install/);
assert.match(publicCard, /getAppBaseUrl\(\)/);
assert.match(publicCard, /\/install/);
assert.doesNotMatch(publicCard, /beforeinstallprompt|\.prompt\(\)/,
  "The marketing domain must not invoke a PWA install prompt");
assert.match(navigation, /getAppBaseUrl\(\)/);
assert.match(navigation, /\/install/);

assert.match(installPage, /host !== "app" && host !== "local"/);
assert.match(installPage, /redirect\(\x60\$\{getAppBaseUrl\(\)\}\/install\x60\)/);
assert.match(installPage, /<AppInstallOnboarding locale=\{locale\}/);
assert.doesNotMatch(middleware.split("const privateRoutes = ")[1].split(";")[0], /"\/install"/);
assert.match(productRegistry, /code: "APP"[\s\S]*?pwa: "enabled"/);
assert.match(manifest, /product\.code === "APP" \? "\/dashboard"/);
assert.match(manifest, /scope: "\/"/);
assert.match(manifest, /display: product\.pwa === "disabled" \? "browser" : "standalone"/);
assert.match(layout, /<PWARegister enabled=\{product\.pwa !== "disabled"\}/);

// Native install is a browser capability: no fake download binaries or
// success claims based only on userChoice; standalone/appinstalled are real.
assert.match(guide, /window\.addEventListener\("beforeinstallprompt"/);
assert.match(guide, /window\.addEventListener\("appinstalled"/);
assert.match(guide, /installPrompt\.prompt\(\)/);
assert.match(guide, /installPrompt\.userChoice/);
assert.match(guide, /display-mode: standalone/);
assert.match(guide, /navigatorWithStandalone\.standalone/);
assert.match(guide, /if \(!installPrompt \|\| busy \|\| installed\)/);
assert.match(guide, /setNotice\(result\.outcome === "accepted" \? "accepted" : "dismissed"\)/);
assert.doesNotMatch(guide, /setInstalled\(true\)[\s\S]{0,250}outcome === "accepted"/,
  "Accepting the browser prompt must not be mistaken for installed");
assert.match(guide, /scrollIntoView/);
assert.match(guide, /aria-live="polite"/);
assert.match(guide, /aria-pressed=\{platform === value\}/);
assert.match(guide, /role="group"/);

for (const name of ["android","ios","windows","mac","linux"]) {
  assert.match(guide, new RegExp(name + ":"), "Missing instructions: " + name);
}
assert.match(guide, /Samsung Internet/);
assert.match(guide, /Sur l'écran d'accueil/);
assert.match(guide, /Ajouter au Dock/);
assert.match(guide, /Windows/);
assert.match(guide, /Linux/);
assert.match(guide, /t\.firstRunSteps/);
assert.match(guide, /getSignInUrl\("\/dashboard"\)/);
assert.match(guide, /t\.internet/);
assert.match(guide, /fr: \{/);
assert.match(guide, /en: \{/);
assert.match(publicCard, /locale === "en"/);
assert.match(guide, /min-h-11|min-h-12/, "Tappable controls should have adequate size");

// Installation must not change the existing PWA's private-data guardrails.
assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
assert.match(serviceWorker, /PRIVATE_PATH_PREFIXES/);
assert.match(serviceWorker, /event\.respondWith\(fetch\(request\)\.catch\(\(\) => offlineFallback\(\)\)\)/);
assert.doesNotMatch(installPage + guide + publicCard, /\/api\/.*(create|mutation)/i);
// Login design 2.0 is visual-only: never change credentials, organization
// selection, MFA enforcement, redirect target validation or session semantics.
const signIn = read("app/auth/sign-in/page.tsx");
const shell = read("components/auth/account-product-shell.tsx");
const authForm = read("components/auth/auth-form.tsx");
const signUp = read("app/auth/sign-up/page.tsx");
const imageCatalog = read("lib/public-site.ts");
assert.match(signIn, /variant="erp-sign-in"/);
assert.match(signIn, /locale=\{uiLocale\}/);
assert.match(signIn, /<AuthForm mode="sign-in" uiLocale=\{uiLocale\}/);
assert.match(signIn, /resolveValidatedAccountLandingRedirect/);
assert.match(shell, /variant === "erp-sign-in"/);
assert.match(shell, /<Image[\s\S]*src=\{ERP_PHOTO\}[\s\S]*alt=\{t\.photo\}/);
assert.match(shell, /photo-1551288049-bebda4e38f71/);
assert.match(imageCatalog, /photo-1551288049-bebda4e38f71/,
  "Photographic ERP analytics visual must reuse the project's existing approved source");
assert.match(shell, /lg:grid-cols-\[/);
assert.match(shell, /order-2[\s\S]*lg:order-1/);
assert.match(shell, /premiumText\[locale\]/);
assert.match(shell, /<ProductNavigation/);
assert.match(signUp, /<AccountProductShell/);
assert.doesNotMatch(signUp, /variant="erp-sign-in"/,
  "The sign-up and recovery views must remain isolated from this login redesign");
assert.match(authForm, /loadOrganizations\(\)/);
assert.match(authForm, /\/api\/auth\/organizations/);
assert.match(authForm, /UNSELECTED_WORKSPACE/);
assert.match(authForm, /isPending \|\| \(!isSignUp && !pendingRegistration && !signInReady\)/);
assert.match(authForm, /\/api\/auth\/mfa\/challenge/);
assert.match(authForm, /MandatoryMfaEnrollment/);
assert.match(authForm, /resolveTrustedInternalRedirect/);
assert.match(authForm, /autoComplete="email"/);
assert.match(authForm, /autoComplete=\{isSignUp \? "new-password" : "current-password"\}/);
assert.match(authForm, /min-h-12/);
assert.match(authForm, /uiLocale === "en"/);

console.log("PASS #1178 public PWA onboarding and premium ERP sign-in UI: platforms, locale, accessibility, privacy, no fake downloads.");
