-- Store only non-sensitive provider status codes, not the HSL status payload.
ALTER TABLE "EnterpriseHealthInsuranceInvoiceSubmission"
 ADD COLUMN "remoteStatus" TEXT,
 ADD COLUMN "lastStatusCheckedAt" TIMESTAMP(3),
 ADD COLUMN "lastStatusErrorCode" TEXT;
