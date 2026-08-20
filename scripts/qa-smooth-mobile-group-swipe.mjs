import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    failures.push(`Fichier introuvable: ${file}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
}

function ok(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(source, snippets, label) {
  for (const snippet of snippets) {
    ok(source.includes(snippet), `${label}: missing ${snippet}`);
  }
}

const swipe = read("components/dtsc/mobile-group-swipe-navigation.tsx");
includesAll(swipe, [
  "touchmove",
  "DRAG_ACTIVATION_PX",
  "VELOCITY_COMMIT_PX_PER_MS",
  "router.prefetch",
  "sessionStorage",
  "TRANSITION_STORAGE_KEY",
  "main.animate",
  "animateBackToRest",
  "settleGestureWithoutMotion",
  "prefers-reduced-motion: reduce",
  "cubic-bezier(0.22, 1, 0.36, 1)",
  "data-mobile-group-swipe-motion=\"fluid\"",
  "[data-horizontal-rail]",
  "[data-professional-tabs]",
  "[role='dialog']",
  "[data-no-group-swipe]",
], "smooth mobile group swipe");

ok(!swipe.includes("preventDefault()"), "Fluid group swipe must not globally prevent the browser's native vertical/system gestures.");
ok(/const DRAG_ACTIVATION_PX = 12;/.test(swipe), "Neutral taps need a deliberate activation dead-zone before horizontal motion can start.");
ok(/stored\.direction === "left" \? offset : -offset/.test(swipe), "The incoming group must enter from the opposite side of the outgoing group.");
ok(/direction === "left" \? -exitDistance : exitDistance/.test(swipe), "The outgoing group must leave in the same direction as the user's committed swipe.");
ok(/displayedDx = target \? clamp\(dx/.test(swipe), "The current group must visually follow the finger while a valid adjacent group exists.");
ok(/dx \* 0\.18/.test(swipe), "Boundary gestures must use resistance instead of navigating beyond available groups.");
ok(/duration: 145/.test(swipe) && /duration: 265/.test(swipe), "Exit and entry phases must remain short enough to feel direct while still visibly animated.");
ok(/window\.innerWidth >= 1024/.test(swipe), "Animated group swipe must remain mobile-only.");

ok(
  /if \(activeGesture\.axis !== "horizontal"\) \{\s*settleGestureWithoutMotion\(activeGesture\);\s*return;\s*\}/s.test(swipe),
  "A neutral tap must settle synchronously and must never trigger the workspace snap-back animation.",
);
ok(
  /if \(Math\.abs\(dy\) > Math\.abs\(dx\) \* HORIZONTAL_DOMINANCE\) \{\s*const activeGesture = gesture;\s*gesture = null;\s*settleGestureWithoutMotion\(activeGesture\);/s.test(swipe),
  "A vertical gesture detected before horizontal activation must not animate the global workspace.",
);
ok(
  /if \(activeGesture\.axis === "horizontal"\) animateBackToRest\(activeGesture\.main\);\s*else settleGestureWithoutMotion\(activeGesture\);/s.test(swipe),
  "Timed-out pending touches must not animate; only an activated horizontal drag may snap back.",
);
ok(
  /if \(gesture\.axis === "horizontal"\) animateBackToRest\(gesture\.main\);\s*else settleGestureWithoutMotion\(gesture\);/s.test(swipe),
  "touchcancel must distinguish an activated swipe from a neutral pending touch.",
);

const responsiveQa = read("scripts/qa-responsive-ui-contract-checks.mjs");
ok(responsiveQa.includes('import "./qa-smooth-mobile-group-swipe.mjs";'), "Fluid swipe QA must be part of the responsive regression contract.");

const responsiveContract = read("docs/RESPONSIVE_UI_CONTRACT.md");
includesAll(responsiveContract, [
  "Swipe de groupe fluide",
  "suit le doigt",
  "prefers-reduced-motion",
], "responsive UI contract");

if (failures.length) {
  console.error(`Smooth mobile group swipe QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Smooth mobile group swipe QA passed: neutral taps stay still, vertical gestures remain native, and intentional horizontal drag/snap/navigation stay protected.");
