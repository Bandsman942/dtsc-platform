ALTER TABLE "EnterpriseGamingSessionTransition"
DROP CONSTRAINT IF EXISTS "EnterpriseGamingSessionTransition_action_check";

ALTER TABLE "EnterpriseGamingSessionTransition"
ADD CONSTRAINT "EnterpriseGamingSessionTransition_action_check"
CHECK ("action" IN (
  'START',
  'PAUSE',
  'RESUME',
  'EXTEND',
  'TRANSFER',
  'END',
  'READY_TO_CHECKOUT',
  'CHECKOUT_OPEN',
  'CHECKOUT_PAID',
  'CHECKOUT_CANCELLED',
  'CHECKOUT_REFUNDED'
));
