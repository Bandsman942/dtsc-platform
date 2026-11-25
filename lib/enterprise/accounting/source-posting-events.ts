import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

// Shared by source confirmation and evidence review; builders stay in the
// canonical posting registry. Never infer an event from a display label.
export function fundingPostingEvent(fundingType: string): PostingEvent {
  if (fundingType === "CAPITAL_CONTRIBUTION") return "CAPITAL_CONTRIBUTION_CONFIRMED";
  if (fundingType === "SHAREHOLDER_ADVANCE") return "SHAREHOLDER_ADVANCE_CONFIRMED";
  if (fundingType === "LOAN_DRAW") return "LOAN_DRAW_CONFIRMED";
  throw new EnterpriseAccountingError("FUNDING_TYPE_INVALID", 400);
}

export function paymentPostingEvent(paymentType: string) {
  if (paymentType === "CUSTOMER_PAYMENT") return "CUSTOMER_PAYMENT_CONFIRMED" as const;
  if (paymentType === "SUPPLIER_PAYMENT") return "SUPPLIER_PAYMENT_CONFIRMED" as const;
  if (paymentType === "PAYROLL_PAYMENT") return "PAYROLL_PAYMENT_CONFIRMED" as const;
  if (paymentType === "EXPENSE_SETTLEMENT") return "EXPENSE_SETTLEMENT_CONFIRMED" as const;
  return null;
}
