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

  const sourceVerified = ["SOURCE_FILE_VERIFIED", "DATASET_VERIFIED"].includes(manifest.verificationStatus);
  if (sourceVerified) {
    const sourceSha = manifest.verifiedSourceFile?.sha256 || "";
    if (!/^[a-f0-9]{64}$/i.test(sourceSha)) fail("SYSCOHADA source manifest: SHA-256 source obligatoire après vérification");
    if (!manifest.verifiedSourceFile?.fileName) fail("SYSCOHADA source manifest: fileName source obligatoire après vérification");
    if (!manifest.verifiedSourceFile?.verifiedAt) fail("SYSCOHADA source manifest: verifiedAt source obligatoire après vérification");
  }

  if (manifest.verificationStatus === "DATASET_VERIFIED") {
    const datasetSha = manifest.canonicalDataset?.sha256 || "";
    if (!/^[a-f0-9]{64}$/i.test(datasetSha)) fail("SYSCOHADA source manifest: SHA-256 dataset obligatoire au statut DATASET_VERIFIED");
    if (!manifest.canonicalDataset?.path) fail("SYSCOHADA source manifest: path dataset obligatoire au statut DATASET_VERIFIED");
    if (!Number.isInteger(manifest.canonicalDataset?.accountCount) || manifest.canonicalDataset.accountCount <= 0) fail("SYSCOHADA source manifest: accountCount positif obligatoire au statut DATASET_VERIFIED");
  }

  const syscohadaDir = path.join(root, "lib/enterprise/accounting/templates/syscohada");
  if (fs.existsSync(syscohadaDir)) {
    for (const entry of fs.readdirSync(syscohadaDir)) {
      if (!entry.endsWith(".json") || entry === "source-manifest.json") continue;
      const candidate = parseJson(path.join("lib/enterprise/accounting/templates/syscohada", entry));
      if (candidate.status === "PUBLISHED") {
        if (manifest.verificationStatus !== "DATASET_VERIFIED") fail(`SYSCOHADA template ${entry}: publication interdite tant que le dataset n'est pas DATASET_VERIFIED`);
        if (manifest.legalUseStatus !== "AUTHORIZED_FOR_DTSC_IMPLEMENTATION") fail(`SYSCOHADA template ${entry}: publication interdite tant que l'usage DTSC n'est pas autorisé`);
        if (candidate.frameworkCode !== "OHADA_AUDCIF") fail(`SYSCOHADA template ${entry}: frameworkCode doit être OHADA_AUDCIF`);
      }
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
