/** Central, intentionally narrow policy for payment state transitions. */
export const PAYMENT_STEP_UP_ACTIONS = ["APPROVE", "CONFIRM", "RECONCILE", "REVERSE"] as const;
export function requiresPaymentStepUp(action: string): boolean {
  return PAYMENT_STEP_UP_ACTIONS.some(candidate => candidate === action);
}
