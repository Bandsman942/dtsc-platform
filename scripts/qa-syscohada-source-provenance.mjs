import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const parseJson = (file) => JSON.parse(read(file));

const manifestPath = "lib/enterprise/accounting/templates/syscohada/source-manifest.json";
const registryPath = "lib/enterprise/accounting/chart-template-registry.ts";
const sectorAdaptersPath = "lib/enterprise/accounting/sector-adapters";
const defaultTemplatePath = "lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json";

for (const file of [manifestPath, registryPath, defaultTemplatePath]) if (!fs.existsSync(path.join(root, file))) fail(`Absent: ${file}`);

if (failures.length === 0) {
  const manifest = parseJson(manifestPath);
  const registry = read(registryPath);
  const defaultTemplate = parseJson(defaultTemplatePath);

  if (manifest.frameworkCode !== "OHADA_AUDCIF") fail("SYSCOHADA source manifest: frameworkCode attendu OHADA_AUDCIF");
  if (manifest.plannedTemplateCode !== "OHADA_SYSCOHADA") fail("SYSCOHADA source manifest: plannedTemplateCode attendu OHADA_SYSCOHADA");
  if (!/^\d+\.\d+\.\d+$/.test(manifest.plannedTemplateVersion || "")) fail("SYSCOHADA source manifest: plannedTemplateVersion invalide");
  if (manifest.regulatoryAuthority !== "OHADA") fail("SYSCOHADA source manifest: autorité OHADA requise");
  if (!/^https:\/\/www\.ohada\.org\//.test(manifest.officialAct?.url || "")) fail("SYSCOHADA source manifest: URL officielle OHADA requise");
  if (!/^https:\/\/biblio\.ohada\.org\//.test(manifest.officialDigitalLibrary?.url || "")) fail("SYSCOHADA source manifest: notice Biblio OHADA requise");
  if (manifest.officialDigitalLibrary?.catalogNoticeId !== 4847) fail("SYSCOHADA source manifest: notice Biblio OHADA 4847 attendue");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.lastRegulatoryVerificationAt || "")) fail("SYSCOHADA source manifest: lastRegulatoryVerificationAt invalide");
  for (const dateField of [manifest.officialAct?.adoptedAt, manifest.officialAct?.publishedAt, manifest.officialAct?.effectiveIndividualAccountsFrom, manifest.officialAct?.effectiveConsolidatedCombinedFrom]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateField || "")) fail(`SYSCOHADA source manifest: date réglementaire invalide ${dateField || "<absente>"}`);
  }

  if (!registry.includes('code: "OHADA_AUDCIF"')) fail("Accounting registry: framework OHADA_AUDCIF absent");
  if (!registry.includes('kind: "REGULATORY"')) fail("Accounting registry: OHADA_AUDCIF doit être réglementaire");
  if (!registry.includes('authority: "OHADA"')) fail("Accounting registry: autorité OHADA absente");
  if (!registry.includes('DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE = "OHADA_SYSCOHADA@0.1.0"')) fail("Accounting registry: SYSCOHADA 0.1.0 doit être le défaut explicite");

  const policy = manifest.bootstrapPolicy;
  if (!policy?.enabled || policy.templateVersion !== "0.1.0" || policy.status !== "OFFICIAL_DTSC_DEFAULT") fail("SYSCOHADA 0.1.0: politique OFFICIAL_DTSC_DEFAULT requise");
  if (policy.allowedPurpose !== "PRODUCTION_DEFAULT") fail("SYSCOHADA 0.1.0: usage PRODUCTION_DEFAULT requis");
  if (policy.regulatoryComplianceClaimAllowed !== true || policy.accountingTemplateProductionReadyAllowed !== true) fail("SYSCOHADA 0.1.0: qualification officielle/Production Ready attendue");
  if (policy.futureVersionsRequireTrustedSource !== true || policy.futureVersionsRequireDatasetVerification !== true) fail("SYSCOHADA: les versions futures doivent conserver les gates de source et dataset");
  if (!/^[a-f0-9]{64}$/i.test(policy.sourceSha256 || "")) fail("SYSCOHADA 0.1.0: empreinte historique SHA-256 requise");
  if (!Array.isArray(policy.sourceReferences) || policy.sourceReferences.length < 2) fail("SYSCOHADA 0.1.0: provenance historique plurielle requise");

  if (defaultTemplate.code !== "OHADA_SYSCOHADA" || defaultTemplate.version !== "0.1.0" || defaultTemplate.status !== "PUBLISHED") fail("SYSCOHADA 0.1.0: template publié attendu");
  if (defaultTemplate.frameworkCode !== "OHADA_AUDCIF" || defaultTemplate.effectiveFrom !== "2018-01-01") fail("SYSCOHADA 0.1.0: identité framework/date incorrecte");
  if (defaultTemplate.source?.kind !== "OFFICIAL") fail("SYSCOHADA 0.1.0: source OFFICIAL attendue dans le registre runtime");
  if (!Array.isArray(defaultTemplate.accounts) || defaultTemplate.accounts.length === 0) fail("SYSCOHADA 0.1.0: comptes requis");
  if (!Array.isArray(defaultTemplate.semanticMappings) || defaultTemplate.semanticMappings.length < 40) fail("SYSCOHADA 0.1.0: couverture sémantique quotidienne insuffisante");
  if (!Array.isArray(defaultTemplate.financialStatementMappings) || defaultTemplate.financialStatementMappings.length === 0) fail("SYSCOHADA 0.1.0: mappings d'états financiers requis");

  const allowedVerificationStatuses = new Set(["SOURCE_FILE_REQUIRED", "SOURCE_FILE_VERIFIED", "DATASET_VERIFIED"]);
  if (!allowedVerificationStatuses.has(manifest.verificationStatus)) fail(`SYSCOHADA source manifest: verificationStatus inconnu ${manifest.verificationStatus}`);
  const allowedLegalStatuses = new Set(["REVIEW_REQUIRED", "AUTHORIZED_FOR_DTSC_IMPLEMENTATION"]);
  if (!allowedLegalStatuses.has(manifest.legalUseStatus)) fail(`SYSCOHADA source manifest: legalUseStatus inconnu ${manifest.legalUseStatus}`);

  if (manifest.datasetPipeline?.requiresSourceVerification !== true || manifest.datasetPipeline?.publicationRequiresDatasetVerification !== true) fail("SYSCOHADA versions futures: pipeline de vérification doit rester obligatoire");
  for (const field of ["schemaPath", "builderPath"]) {
    const configuredPath = manifest.datasetPipeline?.[field];
    if (!configuredPath || !fs.existsSync(path.join(root, configuredPath))) fail(`SYSCOHADA dataset pipeline: ${field} absent ou introuvable`);
  }

  const sourceVerified = ["SOURCE_FILE_VERIFIED", "DATASET_VERIFIED"].includes(manifest.verificationStatus);
  if (sourceVerified) {
    const sourceSha = manifest.verifiedSourceFile?.sha256 || "";
    if (!/^[a-f0-9]{64}$/i.test(sourceSha)) fail("SYSCOHADA future source: SHA-256 obligatoire après vérification");
    if (!manifest.verifiedSourceFile?.fileName || !manifest.verifiedSourceFile?.verifiedAt) fail("SYSCOHADA future source: fileName et verifiedAt obligatoires après vérification");
  }

  if (manifest.verificationStatus === "DATASET_VERIFIED") {
    const datasetSha = manifest.canonicalDataset?.sha256 || "";
    const datasetPath = manifest.canonicalDataset?.path || "";
    if (!/^[a-f0-9]{64}$/i.test(datasetSha) || !datasetPath) fail("SYSCOHADA future dataset: fingerprint et path obligatoires");
    if (datasetPath && fs.existsSync(path.join(root, datasetPath))) {
      const bytes = fs.readFileSync(path.join(root, datasetPath));
      const actualSha = crypto.createHash("sha256").update(bytes).digest("hex");
      if (actualSha.toLowerCase() !== datasetSha.toLowerCase()) fail("SYSCOHADA future dataset: SHA-256 incohérent");
    }
  }

  const syscohadaDir = path.join(root, "lib/enterprise/accounting/templates/syscohada");
  for (const entry of fs.readdirSync(syscohadaDir)) {
    if (!entry.endsWith(".json") || ["source-manifest.json", "dataset-schema.v1.json", "syscohada.bootstrap.v0.1.0.json"].includes(entry)) continue;
    const candidate = parseJson(path.join("lib/enterprise/accounting/templates/syscohada", entry));
    if (candidate.status !== "PUBLISHED") continue;
    if (manifest.verificationStatus !== "DATASET_VERIFIED") fail(`SYSCOHADA future template ${entry}: publication interdite tant que le dataset n'est pas DATASET_VERIFIED`);
    if (manifest.legalUseStatus !== "AUTHORIZED_FOR_DTSC_IMPLEMENTATION") fail(`SYSCOHADA future template ${entry}: publication interdite tant que l'usage DTSC n'est pas autorisé`);
    if (candidate.frameworkCode !== "OHADA_AUDCIF") fail(`SYSCOHADA future template ${entry}: frameworkCode doit être OHADA_AUDCIF`);
  }

  if (fs.existsSync(path.join(root, sectorAdaptersPath))) {
    for (const entry of fs.readdirSync(path.join(root, sectorAdaptersPath))) {
      if (!entry.endsWith(".ts")) continue;
      const content = read(path.join(sectorAdaptersPath, entry));
      if (/OHADA_AUDCIF|OHADA_SYSCOHADA|SYSCOHADA/i.test(content)) fail(`Sector adapter ${entry}: dépendance directe à un référentiel SYSCOHADA interdite`);
    }
  }
}

if (failures.length) {
  console.error(`QA SYSCOHADA Source Provenance: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("QA SYSCOHADA Source Provenance: OK — 0.1.0 official default, future versions gated");
