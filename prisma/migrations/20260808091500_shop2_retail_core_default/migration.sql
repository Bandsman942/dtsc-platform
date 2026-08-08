-- Shop 2.0 iteration 1: new Retail configurations default to the neutral Retail Core.
-- Existing tenant profile values are intentionally preserved for backward compatibility.
ALTER TABLE "EnterpriseRetailConfiguration"
  ALTER COLUMN "profileCode" SET DEFAULT 'RETAIL_CORE';
