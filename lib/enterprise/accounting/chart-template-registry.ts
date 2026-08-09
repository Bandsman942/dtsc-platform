import { ACCOUNT_SUBTYPES, ACCOUNT_TYPES, JOURNAL_TYPES } from "@/lib/enterprise/accounting/constants";
import type {
  AccountingChartTemplateDefinition,
  AccountingFrameworkDefinition,
  AccountingTemplateValidationIssue,
  AccountingTemplateValidationResult,
} from "@/lib/enterprise/accounting/chart-template-types";
import genericSmallBusinessV1 from "@/lib/enterprise/accounting/templates/generic-small-business.v1.json";
import syscohadaBootstrapV010 from "@/lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const ACCOUNT_TYPE_SET = new Set<string>(ACCOUNT_TYPES);
const ACCOUNT_SUBTYPE_SET = new Set<string>(ACCOUNT_SUBTYPES);
const JOURNAL_TYPE_SET = new Set<string>(JOURNAL_TYPES);
const STATEMENT_NORMAL_BALANCES = new Set(["DEBIT", "CREDIT"]);

export const DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE = "OHADA_SYSCOHADA@0.1.0" as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as unknown as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export const ACCOUNTING_FRAMEWORKS = deepFreeze([
  {
    code: "DTSC_GENERIC",
    nameFr: "Référentiel comptable générique DTSC",
    nameEn: "DTSC generic accounting framework",
    kind: "GENERIC",
    jurisdictions: [],
    entityTypes: ["FOR_PROFIT"],
    source: {
      kind: "DTSC_INTERNAL",
      authority: "DTSC",
      reference: "DTSC generic accounting compatibility framework",
      verifiedAt: "2026-08-09",
    },
  },
  {
    code: "OHADA_AUDCIF",
    nameFr: "Droit comptable OHADA — AUDCIF",
    nameEn: "OHADA accounting law — AUDCIF",
    kind: "REGULATORY",
    jurisdictions: ["OHADA"],
    entityTypes: [],
    source: {
      kind: "OFFICIAL",
      authority: "OHADA",
      reference: "Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF), adopté le 26 janvier 2017 et publié au J.O. le 15 février 2017",
      uri: "https://www.ohada.org/en/uniform-act-relating-to-accounting-law-and-financial-information-audcif/",
      verifiedAt: "2026-08-09",
    },
  },
] satisfies AccountingFrameworkDefinition[]);

export const CHART_TEMPLATES = deepFreeze([
  genericSmallBusinessV1 as AccountingChartTemplateDefinition,
  syscohadaBootstrapV010 as AccountingChartTemplateDefinition,
]);

export function chartTemplateReference(template: Pick<AccountingChartTemplateDefinition, "code" | "version">) {
  return `${template.code}@${template.version}`;
}

export function listAccountingFrameworks(): readonly AccountingFrameworkDefinition[] {
  return ACCOUNTING_FRAMEWORKS;
}

export function getAccountingFramework(code: string): AccountingFrameworkDefinition | undefined {
  return ACCOUNTING_FRAMEWORKS.find((framework) => framework.code === code);
}

export function listChartTemplates(input?: {
  frameworkCode?: string;
  status?: AccountingChartTemplateDefinition["status"];
}): readonly AccountingChartTemplateDefinition[] {
  return CHART_TEMPLATES.filter((template) => {
    if (input?.frameworkCode && template.frameworkCode !== input.frameworkCode) return false;
    if (input?.status && template.status !== input.status) return false;
    return true;
  });
}

function versionParts(version: string) {
  return version.split(".").map((part) => Number(part));
}

function compareVersions(left: string, right: string) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function getChartTemplate(codeOrReference: string, version?: string): AccountingChartTemplateDefinition | undefined {
  const [codeFromReference, referenceVersion] = codeOrReference.split("@", 2);
  const code = codeFromReference;
  const requestedVersion = version || referenceVersion;
  const matches = CHART_TEMPLATES.filter((template) => template.code === code && (!requestedVersion || template.version === requestedVersion));
  if (requestedVersion) return matches[0];
  return matches
    .filter((template) => template.status === "PUBLISHED")
    .slice()
    .sort((left, right) => compareVersions(right.version, left.version))[0];
}

export function getDefaultChartTemplate(): AccountingChartTemplateDefinition {
  const template = getChartTemplate(DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE);
  if (!template) throw new Error(`Default accounting chart template is missing: ${DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE}`);
  return template;
}

export function getChartTemplateOrThrow(codeOrReference: string, version?: string): AccountingChartTemplateDefinition {
  const template = getChartTemplate(codeOrReference, version);
  if (!template) throw new Error(`Unknown accounting chart template: ${codeOrReference}${version ? `@${version}` : ""}`);
  const validation = validateChartTemplate(template);
  if (!validation.valid) {
    throw new Error(`Invalid accounting chart template ${chartTemplateReference(template)}: ${validation.issues.map((issue) => issue.code).join(", ")}`);
  }
  return template;
}

function validateHierarchyCycles(
  values: readonly { code: string; parentCode?: string }[],
  issue: (code: string, path: string, message: string) => void,
  code: string,
  pathPrefix: string,
) {
  const byCode = new Map(values.map((value) => [value.code, value]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (valueCode: string) => {
    if (visited.has(valueCode)) return;
    if (visiting.has(valueCode)) {
      issue(code, `${pathPrefix}.${valueCode}`, `Cycle detected at ${valueCode}`);
      return;
    }
    visiting.add(valueCode);
    const parentCode = byCode.get(valueCode)?.parentCode;
    if (parentCode && byCode.has(parentCode)) visit(parentCode);
    visiting.delete(valueCode);
    visited.add(valueCode);
  };
  for (const valueCode of byCode.keys()) visit(valueCode);
}

export function validateChartTemplate(template: AccountingChartTemplateDefinition): AccountingTemplateValidationResult {
  const issues: AccountingTemplateValidationIssue[] = [];
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message });

  if (!template.code.trim()) issue("TEMPLATE_CODE_REQUIRED", "code", "Template code is required");
  if (!VERSION.test(template.version)) issue("TEMPLATE_VERSION_INVALID", "version", "Template version must use x.y.z");
  if (!ISO_DATE.test(template.effectiveFrom)) issue("TEMPLATE_EFFECTIVE_FROM_INVALID", "effectiveFrom", "effectiveFrom must use YYYY-MM-DD");
  if (template.effectiveTo && !ISO_DATE.test(template.effectiveTo)) issue("TEMPLATE_EFFECTIVE_TO_INVALID", "effectiveTo", "effectiveTo must use YYYY-MM-DD");
  if (template.effectiveTo && template.effectiveTo < template.effectiveFrom) issue("TEMPLATE_EFFECTIVE_RANGE_INVALID", "effectiveTo", "effectiveTo cannot precede effectiveFrom");
  if (!getAccountingFramework(template.frameworkCode)) issue("TEMPLATE_FRAMEWORK_UNKNOWN", "frameworkCode", `Unknown framework ${template.frameworkCode}`);
  if (!template.source.authority || !template.source.reference || !ISO_DATE.test(template.source.verifiedAt)) issue("TEMPLATE_SOURCE_INVALID", "source", "Template source requires authority, reference and verifiedAt");
  if (template.status === "PUBLISHED" && template.accounts.length === 0) issue("PUBLISHED_TEMPLATE_EMPTY", "accounts", "Published templates require at least one account");

  const groupCodes = new Set<string>();
  for (const [index, group] of template.groups.entries()) {
    if (groupCodes.has(group.code)) issue("GROUP_CODE_DUPLICATE", `groups.${index}.code`, `Duplicate group ${group.code}`);
    groupCodes.add(group.code);
    if (!ACCOUNT_TYPE_SET.has(group.accountType)) issue("GROUP_ACCOUNT_TYPE_INVALID", `groups.${index}.accountType`, `Invalid account type ${group.accountType}`);
  }
  for (const [index, group] of template.groups.entries()) if (group.parentGroupCode && !groupCodes.has(group.parentGroupCode)) issue("GROUP_PARENT_MISSING", `groups.${index}.parentGroupCode`, `Missing parent group ${group.parentGroupCode}`);
  validateHierarchyCycles(template.groups.map((group) => ({ code: group.code, parentCode: group.parentGroupCode })), issue, "GROUP_HIERARCHY_CYCLE", "groups");

  const accountCodes = new Set<string>();
  for (const [index, account] of template.accounts.entries()) {
    if (accountCodes.has(account.code)) issue("ACCOUNT_CODE_DUPLICATE", `accounts.${index}.code`, `Duplicate account ${account.code}`);
    accountCodes.add(account.code);
    if (!account.nameFr.trim() || !account.nameEn.trim()) issue("ACCOUNT_I18N_REQUIRED", `accounts.${index}`, `Both FR and EN labels are required for account ${account.code}`);
    if (!ACCOUNT_TYPE_SET.has(account.accountType)) issue("ACCOUNT_TYPE_INVALID", `accounts.${index}.accountType`, `Invalid account type ${account.accountType}`);
    if (account.accountSubtype && !ACCOUNT_SUBTYPE_SET.has(account.accountSubtype)) issue("ACCOUNT_SUBTYPE_INVALID", `accounts.${index}.accountSubtype`, `Invalid account subtype ${account.accountSubtype}`);
    if (account.groupCode && !groupCodes.has(account.groupCode)) issue("ACCOUNT_GROUP_MISSING", `accounts.${index}.groupCode`, `Missing group ${account.groupCode}`);
  }
  const accountByCode = new Map(template.accounts.map((account) => [account.code, account]));
  for (const [index, account] of template.accounts.entries()) {
    if (!account.parentCode) continue;
    const parent = accountByCode.get(account.parentCode);
    if (!parent) issue("ACCOUNT_PARENT_MISSING", `accounts.${index}.parentCode`, `Missing parent account ${account.parentCode}`);
    else if (parent.accountType !== account.accountType) issue("ACCOUNT_PARENT_TYPE_MISMATCH", `accounts.${index}.parentCode`, `Parent account ${account.parentCode} has another type`);
  }
  validateHierarchyCycles(template.accounts.map((account) => ({ code: account.code, parentCode: account.parentCode })), issue, "ACCOUNT_HIERARCHY_CYCLE", "accounts");

  const mappingKeys = new Set<string>();
  for (const [index, mapping] of template.semanticMappings.entries()) {
    const identity = `${mapping.mappingKey}|${mapping.sourceModule || ""}|${mapping.sourceEntityType || ""}`;
    if (mappingKeys.has(identity)) issue("SEMANTIC_MAPPING_DUPLICATE", `semanticMappings.${index}`, `Duplicate semantic mapping ${identity}`);
    mappingKeys.add(identity);
    if (!accountCodes.has(mapping.accountCode)) issue("SEMANTIC_MAPPING_ACCOUNT_MISSING", `semanticMappings.${index}.accountCode`, `Missing account ${mapping.accountCode}`);
  }

  const journalCodes = new Set<string>();
  for (const [index, journal] of template.journals.entries()) {
    if (journalCodes.has(journal.code)) issue("JOURNAL_CODE_DUPLICATE", `journals.${index}.code`, `Duplicate journal ${journal.code}`);
    journalCodes.add(journal.code);
    if (!JOURNAL_TYPE_SET.has(journal.journalType)) issue("JOURNAL_TYPE_INVALID", `journals.${index}.journalType`, `Invalid journal type ${journal.journalType}`);
  }

  const statementKeys = new Set<string>();
  for (const [index, mapping] of template.financialStatementMappings.entries()) {
    const identity = `${mapping.statementType}:${mapping.lineCode}`;
    if (statementKeys.has(identity)) issue("STATEMENT_MAPPING_DUPLICATE", `financialStatementMappings.${index}`, `Duplicate statement mapping ${identity}`);
    statementKeys.add(identity);
    if (!mapping.nameFr.trim() || !mapping.nameEn.trim()) issue("STATEMENT_MAPPING_I18N_REQUIRED", `financialStatementMappings.${index}`, `Both FR and EN labels are required for ${identity}`);
    if (!STATEMENT_NORMAL_BALANCES.has(mapping.normalBalance)) issue("STATEMENT_NORMAL_BALANCE_INVALID", `financialStatementMappings.${index}.normalBalance`, `Invalid normal balance for ${identity}`);
    if (!mapping.accountCodes.length) issue("STATEMENT_MAPPING_EMPTY", `financialStatementMappings.${index}.accountCodes`, `At least one account is required for ${identity}`);
    for (const accountCode of mapping.accountCodes) if (!accountCodes.has(accountCode)) issue("STATEMENT_MAPPING_ACCOUNT_MISSING", `financialStatementMappings.${index}.accountCodes`, `Missing account ${accountCode}`);
  }

  return { valid: issues.length === 0, issues };
}

export function validateRegisteredChartTemplates(): AccountingTemplateValidationResult {
  const issues: AccountingTemplateValidationIssue[] = [];
  const frameworkCodes = new Set<string>();
  for (const framework of ACCOUNTING_FRAMEWORKS) {
    if (frameworkCodes.has(framework.code)) issues.push({ code: "FRAMEWORK_CODE_DUPLICATE", path: framework.code, message: `Duplicate framework ${framework.code}` });
    frameworkCodes.add(framework.code);
    if (!framework.code || !framework.nameFr || !framework.nameEn) issues.push({ code: "FRAMEWORK_METADATA_INVALID", path: framework.code || "framework", message: "Framework code and names are required" });
    if (!framework.source.authority || !framework.source.reference || !ISO_DATE.test(framework.source.verifiedAt)) issues.push({ code: "FRAMEWORK_SOURCE_INVALID", path: framework.code, message: "Framework source requires authority, reference and verifiedAt" });
  }

  const references = new Set<string>();
  for (const template of CHART_TEMPLATES) {
    const reference = chartTemplateReference(template);
    if (references.has(reference)) issues.push({ code: "TEMPLATE_REFERENCE_DUPLICATE", path: reference, message: `Duplicate template reference ${reference}` });
    references.add(reference);
    issues.push(...validateChartTemplate(template).issues.map((entry) => ({ ...entry, path: `${reference}.${entry.path}` })));
  }
  const defaultTemplate = getChartTemplate(DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE);
  if (!defaultTemplate || defaultTemplate.status !== "PUBLISHED") issues.push({ code: "DEFAULT_TEMPLATE_INVALID", path: DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE, message: "Default accounting template must exist and be published" });
  if (defaultTemplate && defaultTemplate.source.kind !== "OFFICIAL") issues.push({ code: "DEFAULT_TEMPLATE_SOURCE_NOT_OFFICIAL", path: DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE, message: "Default accounting template must use an official source classification" });
  return { valid: issues.length === 0, issues };
}

const registeredTemplateValidation = validateRegisteredChartTemplates();
if (!registeredTemplateValidation.valid) throw new Error(`Accounting template registry is invalid: ${registeredTemplateValidation.issues.map((issue) => `${issue.path}:${issue.code}`).join("; ")}`);
