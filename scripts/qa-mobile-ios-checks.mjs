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
const actionMenu = read("components/ui/action-menu.tsx");
const mobileChrome = read("components/layout/private-mobile-chrome-controller.tsx");
const mobileShell = read("components/dtsc/mobile-shell.tsx");
const serviceWorker = read("public/sw.js");
const pwaRegister = read("components/pwa/pwa-register.tsx");
const manifest = read("app/manifest.ts");

check(
  "viewport Next.js active les safe areas iOS",
  containsAll(layout, ['viewportFit: "cover"', 'import "./mobile-stability.css"'])
);

check(
  "formulaires mobiles évitent le zoom Safari et laissent le geste de saisie natif à WebKit",
  containsAll(mobileCss, ["font-size: 16px !important", "touch-action: manipulation", "touch-action: auto", "safe-area-inset-top"])
);

check(
  "dialog partagé utilise VisualViewport sans rerendre le champ focalisé",
  containsAll(dialog, ["createPortal", "window.visualViewport", "data-dtsc-dialog-scroll", 'z-[1000]', "useRef", "--dtsc-dialog-visual-height", "ensureFocusedControlVisible", "onClick"])
    && !dialog.includes("useState<VisualViewportBounds")
    && !dialog.includes("onPointerDown")
);

check(
  "dialog partagé ne se repositionne plus avec visualViewport.offsetTop",
  !dialog.includes("visualViewportBounds.offsetTop") && !dialog.includes("viewport.offsetTop")
);

check(
  "dialog partagé ne bloque ni le body ni le focus natif",
  !dialog.includes('document.body.style.overflow = "hidden"') && !dialog.includes("preventDefault()") && !dialog.includes(".focus()")
);

check(
  "chrome mobile ignore scroll et resize clavier pendant la saisie",
  containsAll(mobileChrome, ["MOBILE_FORM_CONTROL_SELECTOR", 'document.addEventListener("focusin"', 'document.addEventListener("focusout"', 'root.dataset.dtscMobileInput = "active"', "formControlActive", "isMobileFormControl(document.activeElement)"])
);

check(
  "navigation basse évite le chemin transform/backdrop pendant les transitions clavier",
  containsAll(mobileCss, ['[data-mobile-bottom-nav]', "backdrop-filter: none !important", "transform: none !important", 'html[data-dtsc-mobile-input="active"]', 'html[data-private-mobile-nav="hidden"]'])
);

check(
  "navigation basse reste opaque lorsque le backdrop iOS est désactivé",
  containsAll(mobileCss, ["background: var(--dtsc-surface) !important", "background-color: var(--dtsc-surface) !important", "isolation: isolate"])
    && containsAll(mobileShell, ["<nav", "data-mobile-bottom-nav", "bg-dtsc-surface", "border-dtsc-border"])
    && !mobileShell.includes("bg-dtsc-surface/86")
    && !mobileShell.includes("<motion.nav")
);

check(
  "select partagé reste au-dessus des overlays et scrollable au toucher",
  containsAll(select, ["z-[1100]", "70dvh", "touch-pan-y", "overscroll-contain", "-webkit-overflow-scrolling:touch", "min-h-11"])
);

check(
  "menus d'action suivent le viewport mobile sans casser la convention z-index existante",
  containsAll(actionMenu, ["window.visualViewport", 'className="fixed z-[1000]', "zIndex: 1200", "touch-pan-y", "max-w-[calc(100vw-1.5rem)]"])
);

check(
  "service worker n'intercepte pas les API ni les pages privées",
  containsAll(serviceWorker, ['"/api/"', '"/auth/"', '"/admin"', '"/support"', 'url.pathname.startsWith("/api/")'])
);

check(
  "service worker rafraîchit les assets stables en arrière-plan",
  containsAll(serviceWorker, ["event.waitUntil(networkResponse", "cache.put(request, responseClone)", "return cachedResponse", "dtsc-static-v8-20260728"])
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
