import crypto from "node:crypto";

const ACCOUNT_TYPES = new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"]);
const ACCOUNT_SUBTYPES = new Set([
  "CASH",
  "BANK",
  "MOBILE_MONEY",
  "ACCOUNTS_RECEIVABLE",
  "ACCOUNTS_PAYABLE",
  "INVENTORY",
  "FIXED_ASSET",
  "ACCUMULATED_DEPRECIATION",
  "TAX_RECEIVABLE",
  "TAX_PAYABLE",
  "PAYROLL_PAYABLE",
  "REVENUE",
  "COST_OF_SALES",
  "OPERATING_EXPENSE",
  "RETAINED_EARNINGS",
  "CLEARING",
]);
const TRANSLATION_STATUSES = new Set(["PENDING", "REVIEWED"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/i;

export class SyscohadaDatasetError extends Error {
  constructor(code, message, path = "") {
    super(message);
    this.name = "SyscohadaDatasetError";
    this.code = code;
    this.path = path;
  }
}

function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function requireString(value, issues, code, path) {
  if (typeof value !== "string" || value.trim().length === 0) issue(issues, code, path, "Expected a non-empty string");
}

function validateCycles(items, parentField, issues, code, pathPrefix) {
  const byCode = new Map(items.map((item) => [item.code, item]));
  const visiting = new Set();
  const visited = new Set();

  const visit = (itemCode) => {
    if (visited.has(itemCode)) return;
    if (visiting.has(itemCode)) {
      issue(issues, code, `${pathPrefix}.${itemCode}`, `Cycle detected at ${itemCode}`);
      return;
    }
    visiting.add(itemCode);
    const parentCode = byCode.get(itemCode)?.[parentField];
    if (parentCode && byCode.has(parentCode)) visit(parentCode);
    visiting.delete(itemCode);
    visited.add(itemCode);
  };

  for (const itemCode of byCode.keys()) visit(itemCode);
}

export function validateReviewedDataset(dataset, manifest) {
  const issues = [];
  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
    return { valid: false, issues: [{ code: "DATASET_INVALID", path: "", message: "Dataset must be an object" }] };
  }

  if (dataset.schemaVersion !== "1.0.0") issue(issues, "SCHEMA_VERSION_INVALID", "schemaVersion", "Expected schemaVersion 1.0.0");
  if (dataset.frameworkCode !== "OHADA_AUDCIF") issue(issues, "FRAMEWORK_CODE_INVALID", "frameworkCode", "Expected OHADA_AUDCIF");
  if (dataset.templateCode !== "OHADA_SYSCOHADA") issue(issues, "TEMPLATE_CODE_INVALID", "templateCode", "Expected OHADA_SYSCOHADA");
  if (!SEMVER.test(dataset.templateVersion || "")) issue(issues, "TEMPLATE_VERSION_INVALID", "templateVersion", "Expected semantic version x.y.z");

  if (!dataset.source || typeof dataset.source !== "object") {
    issue(issues, "SOURCE_REQUIRED", "source", "Reviewed source metadata is required");
  } else {
    requireString(dataset.source.fileName, issues, "SOURCE_FILE_NAME_REQUIRED", "source.fileName");
    if (!SHA256.test(dataset.source.sha256 || "")) issue(issues, "SOURCE_SHA256_INVALID", "source.sha256", "Expected SHA-256");
    requireString(dataset.source.reviewedAt, issues, "SOURCE_REVIEWED_AT_REQUIRED", "source.reviewedAt");
    requireString(dataset.source.reviewedBy, issues, "SOURCE_REVIEWED_BY_REQUIRED", "source.reviewedBy");
  }

  if (!dataset.scope || typeof dataset.scope !== "object") {
    issue(issues, "SCOPE_REQUIRED", "scope", "Dataset scope is required");
  } else {
    if (!ISO_DATE.test(dataset.scope.effectiveFrom || "")) issue(issues, "EFFECTIVE_FROM_INVALID", "scope.effectiveFrom", "Expected YYYY-MM-DD");
    if (dataset.scope.effectiveTo && !ISO_DATE.test(dataset.scope.effectiveTo)) issue(issues, "EFFECTIVE_TO_INVALID", "scope.effectiveTo", "Expected YYYY-MM-DD");
    if (dataset.scope.effectiveTo && dataset.scope.effectiveTo < dataset.scope.effectiveFrom) issue(issues, "EFFECTIVE_RANGE_INVALID", "scope.effectiveTo", "effectiveTo cannot precede effectiveFrom");
    for (const key of ["countryScope", "entityTypes", "languages"]) {
      if (!Array.isArray(dataset.scope[key])) issue(issues, "SCOPE_ARRAY_REQUIRED", `scope.${key}`, `${key} must be an array`);
      else if (new Set(dataset.scope[key]).size !== dataset.scope[key].length) issue(issues, "SCOPE_DUPLICATE_VALUE", `scope.${key}`, `${key} contains duplicates`);
    }
  }

  if (!Array.isArray(dataset.groups)) issue(issues, "GROUPS_REQUIRED", "groups", "groups must be an array");
  if (!Array.isArray(dataset.accounts) || dataset.accounts.length === 0) issue(issues, "ACCOUNTS_REQUIRED", "accounts", "accounts must be a non-empty array");
  if (issues.length) return { valid: false, issues };

  const groupCodes = new Set();
  for (const [index, group] of dataset.groups.entries()) {
    const path = `groups.${index}`;
    requireString(group.code, issues, "GROUP_CODE_REQUIRED", `${path}.code`);
    requireString(group.nameFrOfficial, issues, "GROUP_NAME_FR_REQUIRED", `${path}.nameFrOfficial`);
    if (typeof group.nameEnDtsc !== "string") issue(issues, "GROUP_NAME_EN_INVALID", `${path}.nameEnDtsc`, "nameEnDtsc must be a string");
    if (!TRANSLATION_STATUSES.has(group.translationStatus)) issue(issues, "GROUP_TRANSLATION_STATUS_INVALID", `${path}.translationStatus`, "Unknown translation status");
    if (group.translationStatus === "REVIEWED" && !group.nameEnDtsc.trim()) issue(issues, "GROUP_TRANSLATION_REVIEWED_EMPTY", `${path}.nameEnDtsc`, "Reviewed translation cannot be empty");
    if (!ACCOUNT_TYPES.has(group.accountType)) issue(issues, "GROUP_ACCOUNT_TYPE_INVALID", `${path}.accountType`, `Invalid account type ${group.accountType}`);
    if (!Number.isInteger(group.sortOrder) || group.sortOrder < 0) issue(issues, "GROUP_SORT_ORDER_INVALID", `${path}.sortOrder`, "sortOrder must be a non-negative integer");
    requireString(group.sourceLocator, issues, "GROUP_SOURCE_LOCATOR_REQUIRED", `${path}.sourceLocator`);
    if (groupCodes.has(group.code)) issue(issues, "GROUP_CODE_DUPLICATE", `${path}.code`, `Duplicate group ${group.code}`);
    groupCodes.add(group.code);
  }
  for (const [index, group] of dataset.groups.entries()) {
    if (group.parentGroupCode && !groupCodes.has(group.parentGroupCode)) issue(issues, "GROUP_PARENT_MISSING", `groups.${index}.parentGroupCode`, `Missing group ${group.parentGroupCode}`);
  }
  validateCycles(dataset.groups, "parentGroupCode", issues, "GROUP_HIERARCHY_CYCLE", "groups");

  const accountCodes = new Set();
  const accountByCode = new Map(dataset.accounts.map((account) => [account.code, account]));
  for (const [index, account] of dataset.accounts.entries()) {
    const path = `accounts.${index}`;
    requireString(account.code, issues, "ACCOUNT_CODE_REQUIRED", `${path}.code`);
    requireString(account.nameFrOfficial, issues, "ACCOUNT_NAME_FR_REQUIRED", `${path}.nameFrOfficial`);
    if (typeof account.nameEnDtsc !== "string") issue(issues, "ACCOUNT_NAME_EN_INVALID", `${path}.nameEnDtsc`, "nameEnDtsc must be a string");
    if (!TRANSLATION_STATUSES.has(account.translationStatus)) issue(issues, "ACCOUNT_TRANSLATION_STATUS_INVALID", `${path}.translationStatus`, "Unknown translation status");
    if (account.translationStatus === "REVIEWED" && !account.nameEnDtsc.trim()) issue(issues, "ACCOUNT_TRANSLATION_REVIEWED_EMPTY", `${path}.nameEnDtsc`, "Reviewed translation cannot be empty");
    if (!ACCOUNT_TYPES.has(account.accountType)) issue(issues, "ACCOUNT_TYPE_INVALID", `${path}.accountType`, `Invalid account type ${account.accountType}`);
    if (account.accountSubtype && !ACCOUNT_SUBTYPES.has(account.accountSubtype)) issue(issues, "ACCOUNT_SUBTYPE_INVALID", `${path}.accountSubtype`, `Invalid account subtype ${account.accountSubtype}`);
    if (!Number.isInteger(account.level) || account.level < 1) issue(issues, "ACCOUNT_LEVEL_INVALID", `${path}.level`, "level must be a positive integer");
    if (account.groupCode && !groupCodes.has(account.groupCode)) issue(issues, "ACCOUNT_GROUP_MISSING", `${path}.groupCode`, `Missing group ${account.groupCode}`);
    if (typeof account.isControlAccount !== "boolean" || typeof account.isSystemAccount !== "boolean" || typeof account.allowDirectPosting !== "boolean") {
      issue(issues, "ACCOUNT_FLAGS_INVALID", path, "Account flags must be boolean");
    }
    if (account.isControlAccount && account.allowDirectPosting) issue(issues, "CONTROL_ACCOUNT_DIRECT_POSTING", path, "Control accounts cannot allow direct posting");
    requireString(account.sourceLocator, issues, "ACCOUNT_SOURCE_LOCATOR_REQUIRED", `${path}.sourceLocator`);
    if (accountCodes.has(account.code)) issue(issues, "ACCOUNT_CODE_DUPLICATE", `${path}.code`, `Duplicate account ${account.code}`);
    accountCodes.add(account.code);
  }

  for (const [index, account] of dataset.accounts.entries()) {
    if (!account.parentCode) {
      if (account.level !== 1) issue(issues, "ROOT_ACCOUNT_LEVEL_INVALID", `accounts.${index}.level`, `Root account ${account.code} must be level 1`);
      continue;
    }
    const parent = accountByCode.get(account.parentCode);
    if (!parent) {
      issue(issues, "ACCOUNT_PARENT_MISSING", `accounts.${index}.parentCode`, `Missing parent ${account.parentCode}`);
      continue;
    }
    if (parent.accountType !== account.accountType) issue(issues, "ACCOUNT_PARENT_TYPE_MISMATCH", `accounts.${index}.parentCode`, `Parent ${account.parentCode} has another account type`);
    if (account.level !== parent.level + 1) issue(issues, "ACCOUNT_LEVEL_PARENT_MISMATCH", `accounts.${index}.level`, `Expected level ${parent.level + 1}`);
  }
  validateCycles(dataset.accounts, "parentCode", issues, "ACCOUNT_HIERARCHY_CYCLE", "accounts");

  if (manifest) {
    if (!["SOURCE_FILE_VERIFIED", "DATASET_VERIFIED"].includes(manifest.verificationStatus)) {
      issue(issues, "SOURCE_FILE_NOT_VERIFIED", "manifest.verificationStatus", "Source file must be verified before dataset generation");
    }
    const manifestSha = manifest.verifiedSourceFile?.sha256 || "";
    if (!SHA256.test(manifestSha)) issue(issues, "MANIFEST_SOURCE_SHA256_MISSING", "manifest.verifiedSourceFile.sha256", "Manifest source SHA-256 is required");
    if (dataset.source?.sha256 && manifestSha && dataset.source.sha256.toLowerCase() !== manifestSha.toLowerCase()) {
      issue(issues, "SOURCE_SHA256_MISMATCH", "source.sha256", "Dataset source SHA-256 does not match the verified manifest source");
    }
    if (manifest.frameworkCode !== dataset.frameworkCode) issue(issues, "MANIFEST_FRAMEWORK_MISMATCH", "frameworkCode", "Dataset framework does not match manifest");
    if (manifest.plannedTemplateCode !== dataset.templateCode) issue(issues, "MANIFEST_TEMPLATE_MISMATCH", "templateCode", "Dataset template code does not match manifest");
    if (manifest.plannedTemplateVersion !== dataset.templateVersion) issue(issues, "MANIFEST_VERSION_MISMATCH", "templateVersion", "Dataset template version does not match manifest");
  }

  return { valid: issues.length === 0, issues };
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

export function normalizeReviewedDataset(dataset) {
  const groups = [...dataset.groups]
    .map((group) => ({ ...group, code: group.code.trim(), nameFrOfficial: group.nameFrOfficial.trim(), nameEnDtsc: group.nameEnDtsc.trim(), sourceLocator: group.sourceLocator.trim() }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "en"));
  const accounts = [...dataset.accounts]
    .map((account) => ({
      ...account,
      code: account.code.trim(),
      nameFrOfficial: account.nameFrOfficial.trim(),
      nameEnDtsc: account.nameEnDtsc.trim(),
      sourceLocator: account.sourceLocator.trim(),
      ...(typeof account.reviewNotes === "string" ? { reviewNotes: account.reviewNotes.trim() } : {}),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));

  return sortObject({
    ...dataset,
    source: sortObject({ ...dataset.source, fileName: dataset.source.fileName.trim(), reviewedBy: dataset.source.reviewedBy.trim() }),
    scope: sortObject({
      ...dataset.scope,
      countryScope: [...dataset.scope.countryScope].sort(),
      entityTypes: [...dataset.scope.entityTypes].sort(),
      languages: [...dataset.scope.languages].sort(),
    }),
    groups,
    accounts,
  });
}

export function canonicalDatasetJson(dataset) {
  return `${JSON.stringify(sortObject(dataset), null, 2)}\n`;
}

export function fingerprintReviewedDataset(dataset) {
  return crypto.createHash("sha256").update(canonicalDatasetJson(dataset)).digest("hex");
}

export function buildDraftTemplate(dataset, manifest) {
  const validation = validateReviewedDataset(dataset, manifest);
  if (!validation.valid) throw new SyscohadaDatasetError("DATASET_VALIDATION_FAILED", `Dataset has ${validation.issues.length} validation issue(s)`);
  const normalized = normalizeReviewedDataset(dataset);
  const translationPending = [...normalized.groups, ...normalized.accounts].some((item) => item.translationStatus !== "REVIEWED");

  return sortObject({
    code: normalized.templateCode,
    frameworkCode: normalized.frameworkCode,
    version: normalized.templateVersion,
    status: "DRAFT",
    nameFr: "SYSCOHADA — candidat révisé",
    nameEn: translationPending ? "SYSCOHADA — reviewed English labels pending" : "SYSCOHADA — revised candidate",
    effectiveFrom: normalized.scope.effectiveFrom,
    ...(normalized.scope.effectiveTo ? { effectiveTo: normalized.scope.effectiveTo } : {}),
    countryScope: normalized.scope.countryScope,
    entityTypes: normalized.scope.entityTypes,
    languages: normalized.scope.languages,
    source: {
      kind: "OFFICIAL",
      authority: manifest.regulatoryAuthority,
      reference: manifest.officialAct.title,
      uri: manifest.officialAct.url,
      verifiedAt: manifest.verifiedSourceFile.verifiedAt.slice(0, 10),
    },
    groups: normalized.groups.map((group) => ({
      code: group.code,
      nameFr: group.nameFrOfficial,
      nameEn: group.nameEnDtsc,
      accountType: group.accountType,
      ...(group.parentGroupCode ? { parentGroupCode: group.parentGroupCode } : {}),
      sortOrder: group.sortOrder,
    })),
    accounts: normalized.accounts.map((account) => ({
      code: account.code,
      nameFr: account.nameFrOfficial,
      nameEn: account.nameEnDtsc,
      accountType: account.accountType,
      ...(account.accountSubtype ? { accountSubtype: account.accountSubtype } : {}),
      ...(account.parentCode ? { parentCode: account.parentCode } : {}),
      ...(account.groupCode ? { groupCode: account.groupCode } : {}),
      ...(account.currencyCode ? { currencyCode: account.currencyCode } : {}),
      isControlAccount: account.isControlAccount,
      isSystemAccount: account.isSystemAccount,
      allowDirectPosting: account.allowDirectPosting,
    })),
    semanticMappings: [],
    journals: [],
    financialStatementMappings: [],
  });
}

export function datasetIntegrityReport(dataset, manifest) {
  const validation = validateReviewedDataset(dataset, manifest);
  if (!validation.valid) {
    return { valid: false, issues: validation.issues, datasetSha256: null, accountCount: Array.isArray(dataset?.accounts) ? dataset.accounts.length : 0, groupCount: Array.isArray(dataset?.groups) ? dataset.groups.length : 0 };
  }
  const normalized = normalizeReviewedDataset(dataset);
  return {
    valid: true,
    issues: [],
    datasetSha256: fingerprintReviewedDataset(normalized),
    accountCount: normalized.accounts.length,
    groupCount: normalized.groups.length,
    pendingTranslations: [...normalized.groups, ...normalized.accounts].filter((item) => item.translationStatus !== "REVIEWED").length,
    sourceLocators: new Set([...normalized.groups, ...normalized.accounts].map((item) => item.sourceLocator)).size,
  };
}
