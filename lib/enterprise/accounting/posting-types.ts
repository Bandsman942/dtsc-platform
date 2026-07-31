import type { Prisma } from "@prisma/client";

export type PostingDimensionInput = {
  businessPartyId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  siteId?: string | null;
  assetId?: string | null;
  inventoryItemId?: string | null;
};

export type PostingLineDraft = PostingDimensionInput & {
  accountMappingKey: string;
  description: string;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  transactionCurrencyCode: string;
  transactionAmount: Prisma.Decimal.Value;
};

export type PostingDocument = {
  organizationId: string;
  journalType: string;
  accountingDate: Date;
  documentDate?: Date | null;
  reference?: string | null;
  description: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  currencyCode: string;
  lines: PostingLineDraft[];
};

export type PostingBuilder = (
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityType: string; sourceEntityId: string },
) => Promise<PostingDocument>;
