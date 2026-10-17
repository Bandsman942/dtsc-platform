-- Hotfix #872: keep PostgreSQL identity relation CHECK constraints aligned with the
-- canonical application contract. No consent, identity or business row is changed.
-- The initial migration of 2026-08-01 only allowed nine relation types.
-- PostgreSQL 23514 refused VIP and other later types in Production.
-- Replacing CHECK validation with the superset is data preserving.
ALTER TABLE "EnterpriseIdentityLink"
  DROP CONSTRAINT IF EXISTS "EnterpriseIdentityLink_relationType_check";
ALTER TABLE "EnterpriseIdentityLink"
  ADD CONSTRAINT "EnterpriseIdentityLink_relationType_check"
  CHECK ("requestedRelationType" IN ('PROSPECT', 'CUSTOMER', 'CUSTOMER_CONTACT', 'SUPPLIER', 'SUPPLIER_REPRESENTATIVE', 'EMPLOYEE', 'COLLABORATOR', 'CONTRACTOR', 'PARTNER', 'PATIENT', 'STUDENT', 'PARENT_GUARDIAN', 'POLICYHOLDER', 'BENEFICIARY', 'DONOR', 'VOLUNTEER', 'TENANT', 'OWNER_CLIENT', 'DISTRIBUTOR', 'RESELLER', 'ALUMNI', 'VIP', 'OTHER')) NOT VALID;
ALTER TABLE "EnterpriseIdentityLink"
  VALIDATE CONSTRAINT "EnterpriseIdentityLink_relationType_check";

ALTER TABLE "EnterprisePersonBusinessReference"
  DROP CONSTRAINT IF EXISTS "EnterprisePersonBusinessReference_relationType_check";
ALTER TABLE "EnterprisePersonBusinessReference"
  ADD CONSTRAINT "EnterprisePersonBusinessReference_relationType_check"
  CHECK ("relationType" IN ('PROSPECT', 'CUSTOMER', 'CUSTOMER_CONTACT', 'SUPPLIER', 'SUPPLIER_REPRESENTATIVE', 'EMPLOYEE', 'COLLABORATOR', 'CONTRACTOR', 'PARTNER', 'PATIENT', 'STUDENT', 'PARENT_GUARDIAN', 'POLICYHOLDER', 'BENEFICIARY', 'DONOR', 'VOLUNTEER', 'TENANT', 'OWNER_CLIENT', 'DISTRIBUTOR', 'RESELLER', 'ALUMNI', 'VIP', 'OTHER')) NOT VALID;
ALTER TABLE "EnterprisePersonBusinessReference"
  VALIDATE CONSTRAINT "EnterprisePersonBusinessReference_relationType_check";
