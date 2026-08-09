export type AccountingFrameworkKind = "GENERIC" | "REGULATORY";
export type AccountingTemplateStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED";
export type AccountingSourceKind = "DTSC_INTERNAL" | "OFFICIAL" | "LICENSED";

export type AccountingTemplateSource = {
  kind: AccountingSourceKind;
  authority: string;
  reference: string;
  uri?: string;
  verifiedAt: string;
};

export type AccountingFrameworkDefinition = {
  code: string;
  nameFr: string;
  nameEn: string;
  kind: AccountingFrameworkKind;
  jurisdictions: readonly string[];
  entityTypes: readonly string[];
  source: AccountingTemplateSource;
};

export type AccountingTemplateGroup = {
  code: string;
  nameFr: string;
  nameEn: string;
  accountType: string;
  parentGroupCode?: string;
  sortOrder: number;
};

export type AccountingTemplateAccount = {
  code: string;
  nameFr: string;
  nameEn: string;
  accountType: string;
  accountSubtype?: string;
  parentCode?: string;
  groupCode?: string;
  currencyCode?: string;
  isControlAccount: boolean;
  isSystemAccount: boolean;
  allowDirectPosting: boolean;
};

export type AccountingTemplateSemanticMapping = {
  mappingKey: string;
  accountCode: string;
  sourceModule?: string;
  sourceEntityType?: string;
};

export type AccountingTemplateJournal = {
  code: string;
  nameFr: string;
  nameEn: string;
  journalType: string;
  sequencePrefix?: string;
  requiresApproval: boolean;
};

export type AccountingTemplateStatementMapping = {
  statementType: string;
  lineCode: string;
  nameFr: string;
  nameEn: string;
  accountCodes: readonly string[];
  normalBalance: "DEBIT" | "CREDIT";
  sortOrder: number;
};

export type AccountingChartTemplateDefinition = {
  code: string;
  frameworkCode: string;
  version: string;
  status: AccountingTemplateStatus;
  nameFr: string;
  nameEn: string;
  effectiveFrom: string;
  effectiveTo?: string;
  countryScope: readonly string[];
  entityTypes: readonly string[];
  languages: readonly string[];
  source: AccountingTemplateSource;
  groups: readonly AccountingTemplateGroup[];
  accounts: readonly AccountingTemplateAccount[];
  semanticMappings: readonly AccountingTemplateSemanticMapping[];
  journals: readonly AccountingTemplateJournal[];
  financialStatementMappings: readonly AccountingTemplateStatementMapping[];
};

export type AccountingTemplateValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type AccountingTemplateValidationResult = {
  valid: boolean;
  issues: readonly AccountingTemplateValidationIssue[];
};

export type AccountingChartTemplateCode = string;
