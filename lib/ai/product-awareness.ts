import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../../package.json";

const PRODUCT_CHANGELOG_PATH = join(process.cwd(), "docs", "CHANGELOG.md");
const PRODUCT_CHANGELOG_FRAGMENTS_DIR = join(process.cwd(), "docs", "changelog");
export const AI_PRODUCT_CONTEXT_VERSION = `release-${packageJson.version}`;
const MAX_RELEASES = 6;
const MAX_ITEMS = 28;
const MAX_ITEM_LENGTH = 320;
const USER_FACING_SECTIONS = new Set(["ajouté", "amélioré", "modifié", "corrigé", "added", "improved", "changed", "fixed"]);
const TECHNICAL_ONLY = /(?:\bprisma\b|\bmigration\b|\btype-check\b|\blint\b|\bquality gate\b|\bci\/?cd\b|\bsha\b|\bwebpack\b|\bnode\.js\b|\bscript\b|\/api\/|\.mjs\b|\.tsx?\b|\benv(?:ironment)? variable\b|variable d’environnement)/i;

export type AiProductAwarenessSnapshot = {
  contextVersion: string;
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
  const sources: string[] = [];
  try {
    // The root changelog is updated at each deployment; it must take precedence
    // over dated historical fragments that may otherwise exhaust MAX_RELEASES.
    sources.push(readFileSync(PRODUCT_CHANGELOG_PATH, "utf8"));
    if (existsSync(PRODUCT_CHANGELOG_FRAGMENTS_DIR)) {
      const fragments = readdirSync(PRODUCT_CHANGELOG_FRAGMENTS_DIR)
        .filter((name) => /^\d{4}-\d{2}-\d{2}.*\.md$/i.test(name))
        .sort((left, right) => right.localeCompare(left));
      for (const fragment of fragments) {
        sources.push(readFileSync(join(PRODUCT_CHANGELOG_FRAGMENTS_DIR, fragment), "utf8"));
      }
    }
  } catch {
    // A missing optional changelog source must not make an assistant route unavailable.
  }
  return sources.join("\n\n");
}

export function getAiProductAwarenessSnapshot(): AiProductAwarenessSnapshot {
  const source = readVersionedProductChanges();
  const releases: string[] = [];
  const changes: string[] = [];
  let currentRelease = "";
  let currentSection = "";
  let currentCandidate = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const releaseMatch = rawLine.match(/^##\s+(\d{4}-\d{2}-\d{2})(?:\s+—\s+(.+))?\s*$/);
    if (releaseMatch) {
      currentRelease = releaseMatch[1];
      currentSection = "";
      currentCandidate = /\bcandidat\b|\bcandidate\b/i.test(releaseMatch[2] || "");
      if (!releases.includes(currentRelease) && releases.length < MAX_RELEASES) releases.push(currentRelease);
      continue;
    }

    if (!currentRelease || !releases.includes(currentRelease)) continue;
    const sectionMatch = rawLine.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLocaleLowerCase("fr");
      continue;
    }
    // Modern hotfix entries use root-level bullets instead of ### Ajouté.
    // These lines are still versioned release notes, not live feature state.
    if (currentSection && !USER_FACING_SECTIONS.has(currentSection)) continue;
    if (!rawLine.startsWith("- ")) continue;

    const normalized = normalizeProductChange(rawLine.slice(2));
    if (!normalized || TECHNICAL_ONLY.test(normalized)) continue;
    // A candidate in repository sources is not evidence of a live release.
    const annotated = currentCandidate ? `[RELEASE CANDIDATE — NOT VERIFIED IN PRODUCTION] ${normalized}` : normalized;
    if (!changes.includes(annotated)) changes.push(annotated);
    if (changes.length >= MAX_ITEMS) break;
  }

  return {
    contextVersion: AI_PRODUCT_CONTEXT_VERSION,
    revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.GIT_COMMIT_SHA?.slice(0, 12) || "development",
    releases,
    changes,
  };
}

export function buildAiProductAwarenessInstruction(locale: string) {
  const snapshot = getAiProductAwarenessSnapshot();
  // Always include build provenance, even if the packaged release text is absent.
  // Do not quietly fall back to a hard-coded historical product revision.
  const releaseLabel = snapshot.releases.length ? snapshot.releases.join(", ") : "not available";
  const runtimeVersion = packageJson.version;
  const list = snapshot.changes.length ? snapshot.changes.map((change) => `- ${change}`).join("\n") : "(no verified release details available)";

  if (locale === "en") {
    return [
      "CURRENT DTSC PRODUCT AWARENESS (versioned, trusted application context):",
      `Current application build: v${runtimeVersion}. Context version: ${snapshot.contextVersion}. Deployment revision: ${snapshot.revision}. Product releases represented: ${releaseLabel}.`,
      "The release date is the date of the deployed build, NOT the age of old embedded documents. Do not claim the build is stale because an archived article is older.",
      "Treat the release notes below as newer than older static product descriptions when they conflict.",
      "Release notes may contain candidates still awaiting approval. A RELEASE CANDIDATE is NOT proof of a shipped feature; verify actual runtime access before claiming availability.",
      "Even shipped notes do not establish live connector readiness, plan ownership or tool execution. Check authorized current state before making such claims.",
      "Use them only to understand current DTSC user-facing capabilities. Never expose implementation details, secret configuration or internal identifiers from this context.",
      "If a capability is not supported by the current application context, do not invent it.",
      list,
    ].join("\n");
  }

  return [
    "ACTUALITÉ PRODUIT DTSC (contexte applicatif versionné et fiable) :",
    `Version applicative courante : v${runtimeVersion}. Version du contexte : ${snapshot.contextVersion}. Révision de déploiement : ${snapshot.revision}. Notes de version représentées : ${releaseLabel}.`,
    "La version applicative déployée fait autorité sur la date de vieux articles embarqués : une ancienne documentation ne prouve pas que les déploiements récents sont absents.",
    "Considère les nouveautés ci-dessous comme plus récentes que les anciennes descriptions statiques lorsqu’elles se contredisent.",
    "Les notes peuvent comporter des CANDIDATS non approuvés. Un CANDIDAT DE VERSION ne prouve PAS une fonctionnalité déjà disponible en production : vérifie l’accès réel avant de l’affirmer.",
    "Même une note publiée ne prouve pas la disponibilité opérationnelle d’un connecteur, l’abonnement effectif ni une exécution d’outil. Vérifie l’état courant autorisé avant toute affirmation.",
    "Utilise-les uniquement pour comprendre les capacités DTSC visibles par les utilisateurs. N’expose jamais les détails d’implémentation, configurations secrètes ou identifiants internes issus de ce contexte.",
    "Si une capacité n’est pas supportée par le contexte applicatif actuel, ne l’invente pas.",
    list,
  ].join("\n");
}
