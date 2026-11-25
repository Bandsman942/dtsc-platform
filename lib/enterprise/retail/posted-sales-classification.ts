import { Prisma } from "@prisma/client";

/** Canonical read-only classification for the ledger alias a. Semantic sales
 * mappings or the explicit SYSCOHADA 70 account family qualify; cash variance
 * and FX mappings take precedence. Unmapped/custom income is not presumed sales.
 * The residual is labelled other/unclassified products, not certified income. */
export function retailPostedSalesPredicate(organizationId:string){
  return Prisma.sql`(
    a."accountType" IN ('REVENUE','OTHER_INCOME')
    AND NOT EXISTS (
      SELECT 1 FROM "EnterpriseAccountMapping" m
      WHERE m."organizationId"=${organizationId} AND m."ledgerAccountId"=a.id
        AND m."mappingKey" IN ('CASH_VARIANCE_INCOME','FX_GAIN')
    )
    AND (
      EXISTS (SELECT 1 FROM "EnterpriseAccountMapping" m
        WHERE m."organizationId"=${organizationId} AND m."ledgerAccountId"=a.id
          AND m."mappingKey" IN ('SALES_REVENUE','SERVICE_REVENUE','WORK_REVENUE','ACCESSORY_REVENUE'))
      OR (a.code LIKE '70%' AND EXISTS (
        SELECT 1 FROM "EnterpriseChartOfAccounts" chart
        WHERE chart."organizationId"=${organizationId} AND chart.id=a."chartId"
        AND (chart."templateCode"='OHADA_SYSCOHADA' OR chart."templateCode" LIKE 'OHADA_SYSCOHADA@%')
      ))
    )
  )`;
}
