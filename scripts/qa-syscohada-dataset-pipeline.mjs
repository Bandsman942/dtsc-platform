import fs from "node:fs";
import path from "node:path";
import {
  buildDraftTemplate,
  datasetIntegrityReport,
  fingerprintReviewedDataset,
  normalizeReviewedDataset,
  validateReviewedDataset,
} from "./accounting/syscohada-dataset-lib.mjs";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const parseJson = (file) => JSON.parse(read(file));

const requiredFiles = [
  "lib/enterprise/accounting/templates/syscohada/dataset-schema.v1.json",
  "lib/enterprise/accounting/templates/syscohada/source-manifest.json",
  "scripts/accounting/syscohada-dataset-lib.mjs",
  "scripts/accounting/build-syscohada-dataset.mjs",
  "docs/SYSCOHADA_DATASET_PIPELINE_159.md",
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) fail(`Absent: ${file}`);

const sourceSha = "a".repeat(64);
const verifiedManifest = {
  ...parseJson("lib/enterprise/accounting/templates/syscohada/source-manifest.json"),
  verificationStatus: "SOURCE_FILE_VERIFIED",
  verifiedSourceFile: {
    fileName: "synthetic-official-source.pdf",
    sha256: sourceSha,
    sizeBytes: 1234,
    verifiedAt: "2026-08-09T10:00:00.000Z",
    verifiedBy: "QA_SYNTHETIC_FIXTURE",
  },
};

const syntheticDataset = {
  schemaVersion: "1.0.0",
  frameworkCode: "OHADA_AUDCIF",
  templateCode: "OHADA_SYSCOHADA",
  templateVersion: "1.0.0",
  source: {
    fileName: "synthetic-official-source.pdf",
    sha256: sourceSha,
    reviewedAt: "2026-08-09T10:05:00.000Z",
    reviewedBy: "QA_SYNTHETIC_FIXTURE",
  },
  scope: {
    effectiveFrom: "2026-01-01",
    countryScope: ["ZZ-SYNTHETIC"],
    entityTypes: ["SYNTHETIC_ENTITY"],
    languages: ["fr", "en"],
  },
  groups: [
    {
      code: "TEST-G",
      nameFrOfficial: "Groupe synthétique",
      nameEnDtsc: "Synthetic group",
      translationStatus: "REVIEWED",
      accountType: "ASSET",
      sortOrder: 1,
      sourceLocator: "synthetic:group:1",
    },
  ],
  accounts: [
    {
      code: "TEST-A",
      nameFrOfficial: "Compte racine synthétique",
      nameEnDtsc: "Synthetic root account",
      translationStatus: "REVIEWED",
      accountType: "ASSET",
      groupCode: "TEST-G",
      level: 1,
      isControlAccount: false,
      isSystemAccount: true,
      allowDirectPosting: true,
      sourceLocator: "synthetic:account:1",
    },
    {
      code: "TEST-A-CHILD",
      nameFrOfficial: "Sous-compte synthétique",
      nameEnDtsc: "Synthetic child account",
      translationStatus: "REVIEWED",
      accountType: "ASSET",
      parentCode: "TEST-A",
      groupCode: "TEST-G",
      level: 2,
      isControlAccount: true,
      isSystemAccount: true,
      allowDirectPosting: false,
      sourceLocator: "synthetic:account:2",
    },
  ],
};

const valid = validateReviewedDataset(syntheticDataset, verifiedManifest);
if (!valid.valid) fail(`Fixture synthétique valide refusée: ${valid.issues.map((entry) => entry.code).join(", ")}`);

const normalized = normalizeReviewedDataset(syntheticDataset);
const normalizedReordered = normalizeReviewedDataset({
  ...syntheticDataset,
  scope: { ...syntheticDataset.scope, languages: [...syntheticDataset.scope.languages].reverse() },
  accounts: [...syntheticDataset.accounts].reverse(),
});
if (fingerprintReviewedDataset(normalized) !== fingerprintReviewedDataset(normalizedReordered)) fail("Pipeline non déterministe: le hash dépend de l'ordre d'entrée");

const report = datasetIntegrityReport(syntheticDataset, verifiedManifest);
if (!report.valid || report.accountCount !== 2 || report.groupCount !== 1 || !/^[a-f0-9]{64}$/.test(report.datasetSha256 || "")) {
  fail("Rapport d'intégrité synthétique invalide");
}

const draft = buildDraftTemplate(syntheticDataset, verifiedManifest);
if (draft.status !== "DRAFT") fail("Le générateur ne doit produire qu'un template DRAFT");
if (draft.code !== "OHADA_SYSCOHADA" || draft.frameworkCode !== "OHADA_AUDCIF") fail("Identité du template candidat invalide");
if (draft.accounts.length !== syntheticDataset.accounts.length) fail("Le générateur a perdu des comptes synthétiques");
if (draft.semanticMappings.length !== 0 || draft.journals.length !== 0 || draft.financialStatementMappings.length !== 0) fail("Le pipeline ne doit pas inventer mappings, journaux ou états");

const blockedByManifest = validateReviewedDataset(syntheticDataset, parseJson("lib/enterprise/accounting/templates/syscohada/source-manifest.json"));
if (blockedByManifest.valid || !blockedByManifest.issues.some((entry) => entry.code === "SOURCE_FILE_NOT_VERIFIED")) {
  fail("Le pipeline doit refuser la génération tant que la source officielle n'est pas vérifiée");
}

const duplicate = structuredClone(syntheticDataset);
duplicate.accounts.push({ ...duplicate.accounts[0] });
const duplicateValidation = validateReviewedDataset(duplicate, verifiedManifest);
if (duplicateValidation.valid || !duplicateValidation.issues.some((entry) => entry.code === "ACCOUNT_CODE_DUPLICATE")) fail("Le pipeline doit détecter les comptes dupliqués");

const badParent = structuredClone(syntheticDataset);
badParent.accounts[1].parentCode = "MISSING";
const parentValidation = validateReviewedDataset(badParent, verifiedManifest);
if (parentValidation.valid || !parentValidation.issues.some((entry) => entry.code === "ACCOUNT_PARENT_MISSING")) fail("Le pipeline doit détecter un parent absent");

const badLevel = structuredClone(syntheticDataset);
badLevel.accounts[1].level = 4;
const levelValidation = validateReviewedDataset(badLevel, verifiedManifest);
if (levelValidation.valid || !levelValidation.issues.some((entry) => entry.code === "ACCOUNT_LEVEL_PARENT_MISMATCH")) fail("Le pipeline doit détecter un niveau incohérent");

const badSha = structuredClone(syntheticDataset);
badSha.source.sha256 = "b".repeat(64);
const shaValidation = validateReviewedDataset(badSha, verifiedManifest);
if (shaValidation.valid || !shaValidation.issues.some((entry) => entry.code === "SOURCE_SHA256_MISMATCH")) fail("Le pipeline doit relier le dataset au fingerprint de la source");

const pendingTranslation = structuredClone(syntheticDataset);
pendingTranslation.accounts[0].translationStatus = "PENDING";
pendingTranslation.accounts[0].nameEnDtsc = "";
const pendingValidation = validateReviewedDataset(pendingTranslation, verifiedManifest);
if (!pendingValidation.valid) fail("Une traduction EN en attente doit être représentable explicitement");
const pendingDraft = buildDraftTemplate(pendingTranslation, verifiedManifest);
if (!pendingDraft.nameEn.includes("pending")) fail("Le candidat doit signaler une traduction EN en attente");

const schema = parseJson("lib/enterprise/accounting/templates/syscohada/dataset-schema.v1.json");
if (schema.properties?.frameworkCode?.const !== "OHADA_AUDCIF" || schema.properties?.templateCode?.const !== "OHADA_SYSCOHADA") fail("Schéma canonique: identité SYSCOHADA incorrecte");
if (!schema.description?.includes("no regulatory account data")) fail("Schéma canonique: doit déclarer explicitement l'absence de données réglementaires embarquées");

const cli = read("scripts/accounting/build-syscohada-dataset.mjs");
for (const marker of ["--dry-run", "--input", "--out", "--template-out", "datasetIntegrityReport", "buildDraftTemplate"]) {
  if (!cli.includes(marker)) fail(`CLI dataset: marqueur manquant ${marker}`);
}

if (failures.length) {
  console.error(`QA SYSCOHADA Dataset Pipeline: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("QA SYSCOHADA Dataset Pipeline: OK — fixtures exclusivement synthétiques");
