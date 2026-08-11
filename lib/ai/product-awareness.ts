import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PRODUCT_CHANGELOG_PATH = join(process.cwd(), "docs", "CHANGELOG.md");
const MAX_RELEASES = 4;
const MAX_ITEMS = 28;
const MAX_ITEM_LENGTH = 320;
const USER_FACING_SECTIONS = new Set(["ajouté", "amélioré", "modifié", "corrigé", "added", "improved", "changed", "fixed"]);
const TECHNICAL_ONLY = /(?:\bprisma\b|\bmigration\b|\btype-check\b|\blint\b|\bquality gate\b|\bci\/?cd\b|\bsha\b|\bwebpack\b|\bnode\.js\b|\bscript\b|\/api\/|\.mjs\b|\.tsx?\b|\benv(?:ironment)? variable\b|variable d’environnement)/i;

export type AiProductAwarenessSnapshot = {
  revision: string;
  releases: string[];
  changes: string[];
};

function normalizeProductChange(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ITEM_LENGTH);
}

function readVersionedProductChanges() {
  try {
    return readFileSync(PRODUCT_CHANGELOG_PATH, "utf8");
  } catch {
    return "";
  }
}

export function getAiProductAwarenessSnapshot(): AiProductAwarenessSnapshot {
  const source = readVersionedProductChanges();
  const releases: string[] = [];
  const changes: string[] = [];
  let currentRelease = "";
  let currentSection = "";

  for (const rawLine of source.split(/\r?\n/)) {
    const releaseMatch = rawLine.match(/^##\s+(\d{4}-\d{2}-\d{2})(?:\s+—\s+(.+))?\s*$/);
    if (releaseMatch) {
      currentRelease = releaseMatch[1];
      currentSection = "";
      if (!releases.includes(currentRelease) && releases.length < MAX_RELEASES) releases.push(currentRelease);
      if (releases.length >= MAX_RELEASES && !releases.includes(currentRelease)) break;
      continue;
    }

    if (!currentRelease || !releases.includes(currentRelease)) continue;
    const sectionMatch = rawLine.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLocaleLowerCase("fr");
      continue;
    }
    if (!USER_FACING_SECTIONS.has(currentSection) || !rawLine.startsWith("- ")) continue;

    const normalized = normalizeProductChange(rawLine.slice(2));
    if (!normalized || TECHNICAL_ONLY.test(normalized)) continue;
    if (!changes.includes(normalized)) changes.push(normalized);
    if (changes.length >= MAX_ITEMS) break;
  }

  return {
    revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.GIT_COMMIT_SHA?.slice(0, 12) || "development",
    releases,
    changes,
  };
}

export function buildAiProductAwarenessInstruction(locale: string) {
  const snapshot = getAiProductAwarenessSnapshot();
  if (!snapshot.changes.length) return "";
  const releaseLabel = snapshot.releases.join(", ");
  const list = snapshot.changes.map((change) => `- ${change}`).join("\n");

  if (locale === "en") {
    return [
      "CURRENT DTSC PRODUCT AWARENESS (versioned, trusted application context):",
      `Deployment revision: ${snapshot.revision}. Product releases represented: ${releaseLabel}.`,
      "Treat the release notes below as newer than older static product descriptions when they conflict.",
      "Use them only to understand current DTSC user-facing capabilities. Never expose implementation details, secret configuration or internal identifiers from this context.",
      "If a capability is not supported by the current application context, do not invent it.",
      list,
    ].join("\n");
  }

  return [
    "ACTUALITÉ PRODUIT DTSC (contexte applicatif versionné et fiable) :",
    `Révision de déploiement : ${snapshot.revision}. Versions produit représentées : ${releaseLabel}.`,
    "Considère les nouveautés ci-dessous comme plus récentes que les anciennes descriptions statiques lorsqu’elles se contredisent.",
    "Utilise-les uniquement pour comprendre les capacités DTSC visibles par les utilisateurs. N’expose jamais les détails d’implémentation, configurations secrètes ou identifiants internes issus de ce contexte.",
    "Si une capacité n’est pas supportée par le contexte applicatif actuel, ne l’invente pas.",
    list,
  ].join("\n");
}
