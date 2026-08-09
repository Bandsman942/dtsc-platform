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

if (!fs.existsSync(path.join(root, manifestPath))) fail(`Absent: ${manifestPath}`);
if (!fs.existsSync(path.join(root, registryPath))) fail(`Absent: ${registryPath}`);

if (failures.length === 0) {
  const manifest = parseJson(manifestPath);
  const registry = read(registryPath);

  if (manifest.frameworkCode !== "OHADA_AUDCIF") fail("SYSCOHADA source manifest: frameworkCode attendu OHADA_AUDCIF");
  if (manifest.plannedTemplateCode !== "OHADA_SYSCOHADA") fail("SYSCOHADA source manifest: plannedTemplateCode attendu OHADA_SYSCOHADA");
  if (!/^\d+\.\d+\.\d+$/.test(manifest.plannedTemplateVersion || "")) fail("SYSCOHADA source manifest: plannedTemplateVersion invalide");
  if (!manifest.regulatoryAuthority || manifest.regulatoryAuthority !== "OHADA") fail("SYSCOHADA source manifest: autorité OHADA requise");
  if (!/^https:\/\/www\.ohada\.org\//.test(manifest.officialAct?.url || "")) fail("SYSCOHADA source manifest: URL officielle OHADA requise");
  if (!/^https:\/\/biblio\.ohada\.org\//.test(manifest.officialDigitalLibrary?.url || "")) fail("SYSCOHADA source manifest: notice Biblio OHADA requise");
  if (manifest.officialDigitalLibrary?.catalogNoticeId !== 4847) fail("SYSCOHADA source manifest: notice Biblio OHADA 4847 attendue");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.lastRegulatoryVerificationAt || "")) fail("SYSCOHADA source manifest: lastRegulatoryVerificationAt invalide");

  for (const dateField of [
    manifest.officialAct?.adoptedAt,
    manifest.officialAct?.publishedAt,
    manifest.officialAct?.effectiveIndividualAccountsFrom,
    manifest.officialAct?.effectiveConsolidatedCombinedFrom,
  ]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateField || "")) fail(`SYSCOHADA source manifest: date réglementaire invalide ${dateField || "<absente>"}`);
  }

  if (!registry.includes('code: "OHADA_AUDCIF"')) fail("Accounting registry: framework OHADA_AUDCIF absent");
  if (!registry.includes('kind: "REGULATORY"')) fail("Accounting registry: OHADA_AUDCIF doit être réglementaire");
  if (!registry.includes('authority: "OHADA"')) fail("Accounting registry: autorité OHADA absente");
  if (!registry.includes('kind: "OFFICIAL"')) fail("Accounting registry: source OHADA doit être OFFICIAL");

  const allowedVerificationStatuses = new Set(["SOURCE_FILE_REQUIRED", "SOURCE_FILE_VERIFIED", "DATASET_VERIFIED"]);
  if (!allowedVerificationStatuses.has(manifest.verificationStatus)) fail(`SYSCOHADA source manifest: verificationStatus inconnu ${manifest.verificationStatus}`);
  const allowedLegalStatuses = new Set(["REVIEW_REQUIRED", "AUTHORIZED_FOR_DTSC_IMPLEMENTATION"]);
  if (!allowedLegalStatuses.has(manifest.legalUseStatus)) fail(`SYSCOHADA source manifest: legalUseStatus inconnu ${manifest.legalUseStatus}`);

  const bootstrap = manifest.bootstrapPolicy;
  if (bootstrap?.enabled) {
    if (bootstrap.templateVersion !== "0.1.0") fail("SYSCOHADA bootstrap: seule la version 0.1.0 peut déroger au gate de source fiable");
    if (bootstrap.status !== "NON_OFFICIAL_SYSCOHADA_2017_BOOTSTRAP") fail("SYSCOHADA bootstrap: statut 2017 non officiel explicite requis");
    if (!/^[a-f0-9]{64}$/i.test(bootstrap.sourceSha256 || "")) fail("SYSCOHADA bootstrap: fingerprint SHA-256 du bundle source requis");
    if (!bootstrap.sourceFileName) fail("SYSCOHADA bootstrap: identifiant du bundle source requis");
    if (!Array.isArray(bootstrap.sourceReferences) || bootstrap.sourceReferences.length < 2) fail("SYSCOHADA bootstrap: plusieurs références indépendantes doivent être recoupées");
    if (bootstrap.allowedPurpose !== "BOOTSTRAP_RUNTIME_ONLY") fail("SYSCOHADA bootstrap: usage limité au bootstrap runtime");
    if (bootstrap.regulatoryComplianceClaimAllowed !== false) fail("SYSCOHADA bootstrap: aucune déclaration de conformité réglementaire autorisée");
    if (bootstrap.accountingTemplateProductionReadyAllowed !== false) fail("SYSCOHADA bootstrap: ACCOUNTING_TEMPLATE_PRODUCTION_READY interdit");
    if (bootstrap.futureVersionsRequireTrustedSource !== true) fail("SYSCOHADA bootstrap: les versions futures doivent exiger une source fiable");
    if (bootstrap.futureVersionsRequireDatasetVerification !== true) fail("SYSCOHADA bootstrap: les versions futures doivent exiger un dataset vérifié");
  }

  if (manifest.datasetPipeline) {
    if (manifest.datasetPipeline.schemaVersion !== "1.0.0") fail("SYSCOHADA dataset pipeline: schemaVersion 1.0.0 attendu");
    for (const field of ["schemaPath", "builderPath"]) {
      const configuredPath = manifest.datasetPipeline[field];
      if (!configuredPath || !fs.existsSync(path.join(root, configuredPath))) fail(`SYSCOHADA dataset pipeline: ${field} absent ou introuvable`);
    }
    if (manifest.datasetPipeline.requiresSourceVerification !== true) fail("SYSCOHADA dataset pipeline: requiresSourceVerification doit rester true pour les versions futures");
    if (manifest.datasetPipeline.publicationRequiresDatasetVerification !== true) fail("SYSCOHADA dataset pipeline: publicationRequiresDatasetVerification doit rester true pour les versions futures");
  }

  const sourceVerified = ["SOURCE_FILE_VERIFIED", "DATASET_VERIFIED"].includes(manifest.verificationStatus);
  if (sourceVerified) {
    const sourceSha = manifest.verifiedSourceFile?.sha256 || "";
    if (!/^[a-f0-9]{64}$/i.test(sourceSha)) fail("SYSCOHADA source manifest: SHA-256 source obligatoire après vérification");
    if (!manifest.verifiedSourceFile?.fileName) fail("SYSCOHADA source manifest: fileName source obligatoire après vérification");
    if (!manifest.verifiedSourceFile?.verifiedAt) fail("SYSCOHADA source manifest: verifiedAt source obligatoire après vérification");
  }

  if (manifest.verificationStatus === "DATASET_VERIFIED") {
    const datasetSha = manifest.canonicalDataset?.sha256 || "";
    const datasetPath = manifest.canonicalDataset?.path || "";
    if (!/^[a-f0-9]{64}$/i.test(datasetSha)) fail("SYSCOHADA source manifest: SHA-256 dataset obligatoire au statut DATASET_VERIFIED");
    if (!datasetPath) fail("SYSCOHADA source manifest: path dataset obligatoire au statut DATASET_VERIFIED");
    if (!Number.isInteger(manifest.canonicalDataset?.accountCount) || manifest.canonicalDataset.accountCount <= 0) fail("SYSCOHADA source manifest: accountCount positif obligatoire au statut DATASET_VERIFIED");
    if (!Number.isInteger(manifest.canonicalDataset?.groupCount) || manifest.canonicalDataset.groupCount < 0) fail("SYSCOHADA source manifest: groupCount entier obligatoire au statut DATASET_VERIFIED");

    if (datasetPath) {
      const absoluteDatasetPath = path.join(root, datasetPath);
      if (!fs.existsSync(absoluteDatasetPath)) {
        fail(`SYSCOHADA source manifest: dataset canonique introuvable ${datasetPath}`);
      } else {
        const datasetBytes = fs.readFileSync(absoluteDatasetPath);
        const actualSha = crypto.createHash("sha256").update(datasetBytes).digest("hex");
        if (datasetSha && actualSha.toLowerCase() !== datasetSha.toLowerCase()) fail("SYSCOHADA source manifest: SHA-256 du dataset canonique ne correspond pas au fichier");
        try {
          const dataset = JSON.parse(datasetBytes.toString("utf8"));
          if (dataset.frameworkCode !== manifest.frameworkCode || dataset.templateCode !== manifest.plannedTemplateCode || dataset.templateVersion !== manifest.plannedTemplateVersion) {
            fail("SYSCOHADA source manifest: identité du dataset canonique incompatible avec le manifeste");
          }
          if (!Array.isArray(dataset.accounts) || dataset.accounts.length !== manifest.canonicalDataset.accountCount) fail("SYSCOHADA source manifest: accountCount ne correspond pas au dataset");
          if (!Array.isArray(dataset.groups) || dataset.groups.length !== manifest.canonicalDataset.groupCount) fail("SYSCOHADA source manifest: groupCount ne correspond pas au dataset");
          if ((dataset.source?.sha256 || "").toLowerCase() !== (manifest.verifiedSourceFile?.sha256 || "").toLowerCase()) fail("SYSCOHADA source manifest: dataset non lié au SHA-256 de la source vérifiée");
        } catch (error) {
          fail(`SYSCOHADA source manifest: dataset canonique JSON invalide (${error instanceof Error ? error.message : String(error)})`);
        }
      }
    }
  }

  const syscohadaDir = path.join(root, "lib/enterprise/accounting/templates/syscohada");
  if (fs.existsSync(syscohadaDir)) {
    for (const entry of fs.readdirSync(syscohadaDir)) {
      if (!entry.endsWith(".json") || entry === "source-manifest.json") continue;
      const candidate = parseJson(path.join("lib/enterprise/accounting/templates/syscohada", entry));
      if (candidate.status !== "PUBLISHED") continue;

      const isAuthorizedBootstrap = Boolean(
        bootstrap?.enabled &&
        bootstrap?.status === "NON_OFFICIAL_SYSCOHADA_2017_BOOTSTRAP" &&
        candidate.code === "OHADA_SYSCOHADA" &&
        candidate.frameworkCode === "OHADA_AUDCIF" &&
        candidate.version === bootstrap.templateVersion &&
        candidate.effectiveFrom === "2018-01-01" &&
        candidate.source?.reference?.includes(bootstrap.sourceSha256),
      );

      if (isAuthorizedBootstrap) {
        if (!Array.isArray(candidate.accounts) || candidate.accounts.length === 0) fail(`SYSCOHADA bootstrap ${entry}: au moins un compte est requis`);
        continue;
      }

      if (manifest.verificationStatus !== "DATASET_VERIFIED") fail(`SYSCOHADA template ${entry}: publication interdite hors bootstrap tant que le dataset n'est pas DATASET_VERIFIED`);
      if (manifest.legalUseStatus !== "AUTHORIZED_FOR_DTSC_IMPLEMENTATION") fail(`SYSCOHADA template ${entry}: publication interdite hors bootstrap tant que l'usage DTSC n'est pas autorisé`);
      if (candidate.frameworkCode !== "OHADA_AUDCIF") fail(`SYSCOHADA template ${entry}: frameworkCode doit être OHADA_AUDCIF`);
    }
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

console.log("QA SYSCOHADA Source Provenance: OK");
