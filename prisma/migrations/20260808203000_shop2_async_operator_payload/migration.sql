-- Shop 2.0 iteration 3: preserve the safe provider request needed to finalize
-- asynchronous Mobile Money / Telco operations only after provider confirmation.
ALTER TABLE "EnterpriseRetailProviderOperation"
ADD COLUMN "requestPayloadJson" JSONB;
