import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

export async function finalizeTelcoTopupAccounting(organizationId: string, actorUserId: string, topupId: string) {
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_TELCO_TOPUP_POSTED",
    sourceEntityType: "EnterpriseTelcoTopup",
    sourceEntityId: topupId,
  });
}

export async function finalizeTelcoTopupReversalAccounting(organizationId: string, actorUserId: string, topupId: string) {
  await finalizeTelcoTopupAccounting(organizationId, actorUserId, topupId);
  return postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_TELCO_TOPUP_REVERSED",
    sourceEntityType: "EnterpriseTelcoTopup",
    sourceEntityId: topupId,
  });
}
