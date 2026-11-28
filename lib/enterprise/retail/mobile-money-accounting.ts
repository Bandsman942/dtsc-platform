import type { Prisma } from "@prisma/client";
import {
  ensureMobileMoneyFxLedgerMappingsTx,
  ensureMobileMoneyTransactionLedgerMapping,
  ensureMobileMoneyTransactionLedgerMappingTx,
} from "@/lib/enterprise/accounting/mobile-money-ledger-provisioning";
import { postBusinessEvent, postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";

export async function finalizeMobileMoneyAccounting(organizationId: string, actorUserId: string, transactionId: string) {
  await ensureMobileMoneyTransactionLedgerMapping(organizationId, actorUserId, transactionId);
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_POSTED",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: transactionId,
  });
}

export async function finalizeMobileMoneyReversalAccountingTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, transactionId: string) {
  await ensureMobileMoneyTransactionLedgerMappingTx(tx, organizationId, actorUserId, transactionId);
  await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_POSTED",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: transactionId,
  });
  return postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_REVERSED",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: transactionId,
  });
}

export async function finalizeMobileMoneyFxAccountingTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, transferId: string) {
  await ensureMobileMoneyFxLedgerMappingsTx(tx, organizationId, actorUserId, transferId);
  return postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED",
    sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
    sourceEntityId: transferId,
  });
}

export async function finalizeMobileMoneyFxReversalAccountingTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, transferId: string) {
  await finalizeMobileMoneyFxAccountingTx(tx, organizationId, actorUserId, transferId);
  return postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_FX_REVERSED",
    sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
    sourceEntityId: transferId,
  });
}
