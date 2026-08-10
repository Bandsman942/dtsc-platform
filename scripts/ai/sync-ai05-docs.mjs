import fs from "node:fs";

const changelogPath = "docs/CHANGELOG.md";
const technicalPath = "docs/TECHNICAL_DOCUMENTATION.md";

let changelog = fs.readFileSync(changelogPath, "utf8");
const changelogMarker = "## 2026-08-10 — DTSC AI 05/08 : RAG V2";
if (!changelog.includes(changelogMarker)) {
  const entry = `\n${changelogMarker}\n\n### Ajouté\n\n- Abstraction provider indépendante pour les embeddings avec modèle, dimension, batch et version d’index explicites.\n- Indexation différée et retryable des documents personnels et Enterprise, avec état \`PROCESSING\` puis \`READY\` uniquement après index complet.\n- Retrieval hybride pgvector + recherche lexicale PostgreSQL, reranking optionnel et citations enrichies avec langue, page, section, classification et versions.\n- Réindexation contrôlée, planificateur dry-run et métadonnées Prisma additives pour le cutover legacy.\n\n### Sécurisé\n\n- Les sources Enterprise sont classifiées côté serveur et les classifications réellement sélectionnées par le RAG sont transmises au Policy Router avant l’appel modèle.\n- Les sources archivées, cross-tenant, non autorisées ou d’index incompatible restent exclues avant ranking.\n- Les vecteurs historiques restent \`legacy-openai-1536-v1\` / \`LEGACY_UNKNOWN\` jusqu’à réindexation explicite.\n\n### Qualité\n\n- Quatre gates AI05 couvrent provider embedding, versioning d’index, retrieval hybride et idempotence/réindexation, intégrées à l’agrégateur Standard AI.\n`;
  const firstSection = changelog.indexOf("\n## ");
  if (firstSection < 0) throw new Error("CHANGELOG_SECTION_ANCHOR_NOT_FOUND");
  changelog = `${changelog.slice(0, firstSection)}${entry}${changelog.slice(firstSection)}`;
  fs.writeFileSync(changelogPath, changelog);
}

let technical = fs.readFileSync(technicalPath, "utf8");
const technicalMarker = "## DTSC AI — RAG V2 / Knowledge Engine (AI05)";
if (!technical.includes(technicalMarker)) {
  technical = `${technical.trimEnd()}\n\n${technicalMarker}\n\nAI05 conserve PostgreSQL/pgvector et les modèles documentaires existants comme sources de vérité, sans index parallèle. Les embeddings passent désormais par \`lib/ai/embeddings.ts\`, avec identité provider/modèle/dimension/version et batch borné. Les index historiques restent explicitement \`legacy-openai-1536-v1\` jusqu’à réindexation contrôlée.\n\nLes uploads personnels et Enterprise persistent stockage + texte extrait, retournent \`202 PROCESSING\`, puis terminent l’indexation avec \`after()\`. Les insertions de chunks sont idempotentes via SHA-256 + \`indexVersion\`. Le retrieval Enterprise filtre tenant, statut, archive, confidentialité, secteur/module et compatibilité d’index avant un ranking hybride pgvector + PostgreSQL lexical, puis un reranking optionnel avec fallback déterministe.\n\nLes classifications RAG sélectionnées (dont \`HEALTH_SENSITIVE\`, \`HR_SENSITIVE\`, \`FINANCIAL_SENSITIVE\`, \`LEGAL_SENSITIVE\`) sont fusionnées avec celles du Context Engine avant passage au Policy Router. Aucun reindex global automatique n’est autorisé en Production ; le planificateur \`scripts/ai/plan-rag-reindex.mjs\` est dry-run et borné.\n\nDocumentation canonique : \`docs/STANDARD_AI_KNOWLEDGE_RAG_ARCHITECTURE.md\`, \`docs/STANDARD_AI_EMBEDDING_INDEXING.md\` et \`docs/STANDARD_AI_DATA_CLASSIFICATION.md\`.\n`;
  fs.writeFileSync(technicalPath, technical);
}

console.log("AI05 documentation synchronized");
