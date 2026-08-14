import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

export async function finalizeMobileMoneyAccounting(organizationId: string, actorUserId: string, transactionId: string) {
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_POSTED",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: transactionId,
  });
}

export async function finalizeMobileMoneyReversalAccounting(organizationId: string, actorUserId: string, transactionId: string) {
  await finalizeMobileMoneyAccounting(organizationId, actorUserId, transactionId);
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_REVERSED",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: transactionId,
  });
}

export async function finalizeMobileMoneyFxAccounting(organizationId: string, actorUserId: string, transferId: string) {
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED",
    sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
    sourceEntityId: transferId,
  });
}

export async function finalizeMobileMoneyFxReversalAccounting(organizationId: string, actorUserId: string, transferId: string) {
  await finalizeMobileMoneyFxAccounting(organizationId, actorUserId, transferId);
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_FX_REVERSED",
    sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
    sourceEntityId: transferId,
  });
}
