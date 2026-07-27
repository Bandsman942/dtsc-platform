import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Fichier introuvable: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function check(label, condition, hint = "") {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${hint ? `\n  ${hint}` : ""}`);
  console.error(`FAIL ${label}`);
}

function containsAll(source, values) {
  return values.every((value) => source.includes(value));
}

const layout = read("app/layout.tsx");
const mobileCss = read("app/mobile-stability.css");
const dialog = read("components/ui/dialog.tsx");
const select = read("components/ui/select.tsx");
const serviceWorker = read("public/sw.js");
const pwaRegister = read("components/pwa/pwa-register.tsx");
const manifest = read("app/manifest.ts");

check(
  "viewport Next.js active les safe areas iOS",
  containsAll(layout, ['viewportFit: "cover"', 'import "./mobile-stability.css"'])
);

check(
  "formulaires mobiles évitent le zoom Safari et conservent le geste tactile",
  containsAll(mobileCss, ["font-size: 16px !important", "touch-action: manipulation", "safe-area-inset-top"])
);

check(
  "dialog partagé est porté au body et borné par VisualViewport",
  containsAll(dialog, ["createPortal", "window.visualViewport", "data-dtsc-dialog-scroll", 'z-[1000]', "onPointerDown"])
);

check(
  "dialog partagé ne bloque pas artificiellement le scroll du body",
  !dialog.includes('document.body.style.overflow = "hidden"') && !dialog.includes("preventDefault()")
);

check(
  "select partagé reste au-dessus des overlays et scrollable au toucher",
  containsAll(select, ["z-[1100]", "70dvh", "touch-pan-y", "overscroll-contain", "-webkit-overflow-scrolling:touch", "min-h-11"])
);

check(
  "service worker n'intercepte pas les API ni les pages privées",
  containsAll(serviceWorker, ['"/api/"', '"/auth/"', '"/admin"', '"/support"', 'url.pathname.startsWith("/api/")'])
);

check(
  "service worker rafraîchit les assets stables en arrière-plan",
  containsAll(serviceWorker, ["cachedResponse || networkResponse", "cache.put(request, responseClone)", "dtsc-static-v7-20260728"])
);

check(
  "PWA recherche les mises à jour sur online, focus et visibilité",
  containsAll(pwaRegister, ["registration.update()", 'window.addEventListener("online"', 'window.addEventListener("focus"', 'document.addEventListener("visibilitychange"'])
);

check(
  "manifest PWA conserve standalone et les icônes essentielles",
  containsAll(manifest, ['display: "standalone"', 'src: "/icons/icon-192x192.png"', 'src: "/icons/icon-512x512.png"'])
);

if (failures.length > 0) {
  console.error("\nQA mobile/iOS/PWA en échec:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nQA mobile/iOS/PWA: tous les contrôles source-level passent.");
