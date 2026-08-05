import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "lib/modules/standard-module-registry-data.json");
const allowedHosts = new Set(["PUBLIC", "APP", "ACCOUNT", "CONSOLE", "SUPPORT"]);
const allowedStatuses = new Set(["ACTIVE", "BETA", "PLANNED", "HIDDEN", "DEPRECATED", "RETIRED"]);
const allowedMaturities = new Set(["BACKEND_READY", "READ_ONLY_UI", "OPERATIONAL_UI", "PROFESSIONAL_READY", "COMMERCIAL_READY"]);
const allowedPolicies = new Set(["PUBLIC", "AUTHENTICATED", "GLOBAL_ROLE", "ORGANIZATION_MEMBERSHIP", "POSITION_PERMISSION", "ADMIN_BLOCK", "EXPLICIT_DENY"]);
const allowedFrenchAcronyms = new Set(["CEO", "COO", "CTO", "MPO", "SCO"]);
const allowedIcons = new Set([
  "layout-dashboard", "bot", "credit-card", "briefcase-business", "building-2", "calendar-days", "users-round", "bell", "megaphone", "headphones", "user", "settings", "user-plus", "calendar-check", "list-checks", "inbox", "badge-check", "presentation", "workflow", "files", "wallet-cards", "chart-no-axes-combined", "sparkles", "shield", "users", "network", "key-round", "layers-3", "settings-2", "history", "clock-3", "calendar-x-2", "timer", "badge-dollar-sign", "route", "crown", "code-2", "kanban-square", "truck", "scale", "gauge", "receipt-text", "life-buoy", "newspaper", "shield-check", "sliders-horizontal", "globe-2", "briefcase", "blocks", "folder-kanban", "library", "mail-plus", "clipboard-pen-line", "user-round-plus", "log-in", "smartphone", "bell-ring", "cloud-off"
]);
const allowedSharedRouteShells = new Map([
  ["CONSOLE:/admin", new Set(["DTSC_INTERNAL_ADMIN", "CONSOLE_OVERVIEW"])],
]);

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nativeGuideExists(uri) {
  const code = uri.slice("native://".length).trim();
  if (!/^[A-Z0-9_]+$/.test(code)) return false;
  const guidesRoot = path.join(root, "lib/user-guides");
  if (!fs.existsSync(guidesRoot)) return false;
  const escaped = escapeRegExp(code);
  const registryKey = new RegExp(String.raw`^\s*${escaped}\s*:\s*\{`, "m");
  const explicitCode = new RegExp(String.raw`code\s*:\s*["']${escaped}["']`);
  return fs.readdirSync(guidesRoot, { withFileTypes: true }).some((entry) => {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) return false;
    const source = fs.readFileSync(path.join(guidesRoot, entry.name), "utf8");
    return registryKey.test(source) || explicitCode.test(source);
  });
}

function exists(file) {
  if (file.startsWith("native://")) return nativeGuideExists(file);
  return fs.existsSync(path.join(root, file));
}

function loadRegistry() {
  if (!fs.existsSync(registryPath)) throw new Error("Registre standard absent.");
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(parsed.modules)) throw new Error("Le registre standard doit exposer modules[].");
  return parsed;
}

function routeCandidates(routePath) {
  const pathname = routePath.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/") return ["app/page.tsx", "app/page.jsx", "app/page.js"];
  return [
    `app${pathname}/page.tsx`, `app${pathname}/page.jsx`, `app${pathname}/page.js`,
    `app${pathname}/route.ts`, `app${pathname}/route.js`,
    pathname === "/offline" ? "public/offline.html" : "__none__",
  ];
}

function push(list, condition, message) {
  if (!condition) list.push(message);
}

function isAllowedSharedRoute(routeKey, moduleCodes) {
  const allowedCodes = allowedSharedRouteShells.get(routeKey);
  return Boolean(allowedCodes && moduleCodes.every((code) => allowedCodes.has(code)));
}

function baseAudit(registry) {
  const errors = [];
  const warnings = [];
  const codes = new Set();
  const aliases = new Map();
  const routes = new Map();

  for (const item of registry.modules) {
    push(errors, typeof item.code === "string" && /^[A-Z0-9_]+$/.test(item.code), `Code invalide: ${item.code}`);
    if (codes.has(item.code)) errors.push(`Code dupliqué: ${item.code}`);
    codes.add(item.code);
    push(errors, allowedHosts.has(item.host), `${item.code}: domaine web inconnu ${item.host}`);
    push(errors, allowedStatuses.has(item.implementationStatus), `${item.code}: statut technique inconnu`);
    push(errors, allowedMaturities.has(item.maturity), `${item.code}: maturité inconnue`);
    push(errors, allowedPolicies.has(item.accessPolicy), `${item.code}: politique d’accès inconnue`);
    push(errors, allowedIcons.has(item.iconKey), `${item.code}: icône inconnue ${item.iconKey}`);
    push(errors, typeof item.navigationOrder === "number", `${item.code}: ordre de navigation absent`);
    push(errors, Array.isArray(item.dependencies) && Array.isArray(item.erpDependencies), `${item.code}: dépendances invalides`);
    push(errors, Array.isArray(item.permissionPrefixes), `${item.code}: permissions invalides`);
    if (["ACTIVE", "BETA"].includes(item.implementationStatus) && !item.routePath) errors.push(`${item.code}: module visible sans route`);
    if (["PLANNED", "HIDDEN", "RETIRED"].includes(item.implementationStatus) && item.maturity === "COMMERCIAL_READY") errors.push(`${item.code}: maturité commerciale incompatible`);
    if (item.maturity === "COMMERCIAL_READY") {
      if (!item.commercialEvidencePath || !exists(item.commercialEvidencePath)) {
        errors.push(`${item.code}: promotion commerciale sans preuve propriétaire versionnée`);
      } else {
        const evidence = read(item.commercialEvidencePath);
        if (!evidence.includes(item.code) || !evidence.includes("Propriétaire") || !evidence.includes("Production")) {
          errors.push(`${item.code}: preuve propriétaire commerciale incomplète`);
        }
      }
    }
    if (["ACTIVE", "BETA"].includes(item.implementationStatus) && !item.qaContract) warnings.push(`${item.code}: contrat QA absent`);
    if (["PROFESSIONAL_READY", "COMMERCIAL_READY"].includes(item.maturity) && !item.userGuidePath) warnings.push(`${item.code}: guide utilisateur exact restant à produire`);

    for (const alias of item.aliases || []) {
      const normalized = alias.trim().toUpperCase();
      if (codes.has(normalized) || aliases.has(normalized)) errors.push(`Alias ambigu: ${normalized}`);
      aliases.set(normalized, item.code);
    }
    if (item.routePath) {
      const routeKey = `${item.host}:${item.routePath}`;
      const routeModules = routes.get(routeKey) || [];
      const candidateModules = [...routeModules, item.code];
      if (routeModules.length && !isAllowedSharedRoute(routeKey, candidateModules)) {
        errors.push(`Route canonique dupliquée: ${routeKey} (${candidateModules.join(", ")})`);
      }
      routes.set(routeKey, candidateModules);
    }
  }

  for (const [routeKey, moduleCodes] of routes) {
    if (moduleCodes.length > 1 && isAllowedSharedRoute(routeKey, moduleCodes)) {
      warnings.push(`Shell partagé documenté: ${routeKey} (${moduleCodes.join(", ")})`);
    }
  }

  for (const item of registry.modules) {
    for (const dependency of item.dependencies) {
      if (!codes.has(dependency)) errors.push(`${item.code}: dépendance standard inconnue ${dependency}`);
    }
    for (const alias of item.aliases || []) {
      const normalized = alias.trim().toUpperCase();
      if (codes.has(normalized)) errors.push(`${item.code}: alias en conflit avec le code canonique ${normalized}`);
    }
  }
  return { errors, warnings };
}

function routeAudit(registry) {
  const errors = [];
  const warnings = [];
  for (const item of registry.modules) {
    if (!item.routePath || !["ACTIVE", "BETA"].includes(item.implementationStatus)) continue;
    const found = routeCandidates(item.routePath).some((candidate) => candidate !== "__none__" && exists(candidate));
    if (!found) warnings.push(`${item.code}: route inventoriée à confirmer (${item.host} ${item.routePath})`);
  }
  return { errors, warnings };
}

function navigationAudit(registry) {
  const errors = [];
  const warnings = [];
  for (const item of registry.modules) {
    if (["HIDDEN", "RETIRED"].includes(item.implementationStatus) && item.navigationGroup === "GLOBAL") {
      errors.push(`${item.code}: module masqué/retraité présent dans la navigation globale`);
    }
    if (item.implementationStatus === "PLANNED" && item.routePath) warnings.push(`${item.code}: route planifiée documentée, vérifier qu’elle n’est pas cliquable`);
  }
  push(errors, exists("lib/modules/standard-module-navigation.ts"), "Résolveur de navigation standard absent");
  push(errors, exists("lib/domains.ts"), "Résolveur multidomaine absent");
  return { errors, warnings };
}

function permissionAudit(registry) {
  const errors = [];
  const warnings = [];
  push(errors, exists("lib/modules/standard-module-access.ts"), "Résolveur d’accès standard absent");
  for (const item of registry.modules) {
    if (["POSITION_PERMISSION", "ADMIN_BLOCK", "GLOBAL_ROLE"].includes(item.accessPolicy) && !item.permissionPrefixes.length) {
      errors.push(`${item.code}: politique sensible sans préfixe de permission`);
    }
    if (item.accessPolicy === "ORGANIZATION_MEMBERSHIP" && item.family !== "ENTERPRISE_STANDARD") warnings.push(`${item.code}: membership entreprise hors famille entreprise`);
  }
  return { errors, warnings };
}

function guideAudit(registry) {
  const errors = [];
  const warnings = [];
  for (const item of registry.modules) {
    if (!item.userGuidePath) {
      warnings.push(`${item.code}: guide absent dans l’inventaire initial`);
      continue;
    }
    if (!exists(item.userGuidePath)) errors.push(`${item.code}: guide déclaré mais introuvable ${item.userGuidePath}`);
  }
  return { errors, warnings };
}

function languageAudit(registry) {
  const errors = [];
  const warnings = [];
  for (const item of registry.modules) {
    if (!item.labelFr?.trim() || !item.descriptionFr?.trim()) errors.push(`${item.code}: français visible incomplet`);
    if (/^[A-Z0-9_]+$/.test(item.labelFr || "") && !allowedFrenchAcronyms.has(item.labelFr)) {
      errors.push(`${item.code}: enum brut exposé comme libellé français`);
    }
    if (/\b(error|failed|token|provider|room)\b/i.test(item.descriptionFr || "")) warnings.push(`${item.code}: terme technique à relire dans la description française`);
  }
  return { errors, warnings };
}

function mobileAudit() {
  const errors = [];
  const warnings = [];
  if (!exists("components/workspace/module-metrics.tsx")) return { errors: ["ModuleMetrics absent"], warnings };
  const metrics = read("components/workspace/module-metrics.tsx");
  for (const token of ["overflow-x-auto", "touch-pan-x", "flex-nowrap"]) {
    if (!metrics.includes(token)) errors.push(`Contrat mobile KPI absent: ${token}`);
  }
  return { errors, warnings };
}

function multiDomainAudit() {
  const errors = [];
  const warnings = [];
  const domains = read("lib/domains.ts");
  for (const token of ["buildUrlForHostType", "getSignInUrl", "getDashboardUrl", "getConsoleUrl", "getSupportUrl", "getPublicUrl"]) {
    if (!domains.includes(token)) errors.push(`Helper multidomaine absent: ${token}`);
  }
  if (!exists("lib/modules/standard-module-deep-links.ts")) errors.push("Contrat de liens profonds standard absent");
  return { errors, warnings };
}

function maturityAudit(registry) {
  const errors = [];
  const warnings = [];
  for (const item of registry.modules) {
    if (item.implementationStatus === "ACTIVE" && item.maturity === "BACKEND_READY") warnings.push(`${item.code}: actif avec maturité backend seulement`);
    if (item.maturity === "PROFESSIONAL_READY" && !item.qaContract) errors.push(`${item.code}: PROFESSIONAL_READY sans QA`);
  }
  return { errors, warnings };
}

const auditByScope = {
  registry: baseAudit,
  navigation: navigationAudit,
  routes: routeAudit,
  maturity: maturityAudit,
  permissions: permissionAudit,
  guides: guideAudit,
  language: languageAudit,
  mobile: () => mobileAudit(),
  "multi-domain": () => multiDomainAudit(),
  readiness: maturityAudit,
};

export function runStandardModuleAudit(scope = "all") {
  const registry = loadRegistry();
  const scopes = scope === "all" ? Object.keys(auditByScope) : [scope];
  const errors = [];
  const warnings = [];
  for (const selectedScope of scopes) {
    const audit = auditByScope[selectedScope];
    if (!audit) throw new Error(`Audit standard inconnu: ${selectedScope}`);
    const result = audit(registry);
    errors.push(...result.errors.map((message) => `[${selectedScope}] ${message}`));
    warnings.push(...result.warnings.map((message) => `[${selectedScope}] ${message}`));
  }

  for (const warning of [...new Set(warnings)]) console.warn(`WARN ${warning}`);
  if (errors.length) {
    console.error(`Standard module audit failed:\n- ${[...new Set(errors)].join("\n- ")}`);
    process.exitCode = 1;
    return { ok: false, errors, warnings, moduleCount: registry.modules.length };
  }
  console.log(`Standard module audit passed (${scope}): ${registry.modules.length} modules inventoried, ${warnings.length} documented warning(s).`);
  return { ok: true, errors, warnings, moduleCount: registry.modules.length };
}
