-- Shop 2.0 iteration 3: additive customer retail, loyalty, stored value, payment/provider operations, webhooks and POS devices.

CREATE TABLE "EnterpriseRetailCustomerProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "customerNumber" TEXT NOT NULL,
  "segmentCode" TEXT,
  "priceListCode" TEXT,
  "preferredLocale" TEXT,
  "preferredCurrencyCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailCustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailLoyaltyProgram" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameFr" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "earnPointsPerCurrencyUnit" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "redeemValuePerPoint" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "minimumRedeemPoints" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "settingsJson" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailLoyaltyProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailLoyaltyAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "customerBusinessPartyId" TEXT NOT NULL,
  "pointsBalance" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "lifetimeEarned" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "lifetimeRedeemed" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "tierCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailLoyaltyAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailLoyaltyEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "points" DECIMAL(20,6) NOT NULL,
  "monetaryAmount" DECIMAL(20,6),
  "currencyCode" TEXT,
  "saleId" TEXT,
  "returnId" TEXT,
  "reason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseRetailLoyaltyEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailStoredValueAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "lookupHash" TEXT NOT NULL,
  "displayCode" TEXT NOT NULL,
  "customerBusinessPartyId" TEXT,
  "currencyCode" TEXT NOT NULL,
  "initialValue" DECIMAL(20,6) NOT NULL,
  "balance" DECIMAL(20,6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailStoredValueAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailStoredValueEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "amount" DECIMAL(20,6) NOT NULL,
  "saleId" TEXT,
  "returnId" TEXT,
  "reason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseRetailStoredValueEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailProviderIntegration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "integrationMode" TEXT NOT NULL DEFAULT 'MANUAL',
  "adapterCode" TEXT,
  "credentialReference" TEXT,
  "webhookSecretReference" TEXT,
  "connectionStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "settingsJson" JSONB,
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailProviderIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailProviderOperation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "currencyCode" TEXT,
  "amount" DECIMAL(20,6),
  "status" TEXT NOT NULL DEFAULT 'INITIATED',
  "externalReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "timeoutAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailProviderOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailPaymentTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT,
  "saleId" TEXT,
  "returnId" TEXT,
  "methodType" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "amount" DECIMAL(20,6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INITIATED',
  "providerReference" TEXT,
  "clientReference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailPaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailWebhookEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "payloadHash" TEXT NOT NULL,
  "safePayloadJson" JSONB,
  "providerOperationId" TEXT,
  "paymentTransactionId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  CONSTRAINT "EnterpriseRetailWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailDeviceProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "connectionMode" TEXT NOT NULL,
  "capabilitiesJson" JSONB,
  "settingsJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailDeviceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailCustomerProfile_org_id_key" ON "EnterpriseRetailCustomerProfile"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailCustomerProfile_party_key" ON "EnterpriseRetailCustomerProfile"("organizationId", "businessPartyId");
CREATE UNIQUE INDEX "EnterpriseRetailCustomerProfile_number_key" ON "EnterpriseRetailCustomerProfile"("organizationId", "customerNumber");
CREATE INDEX "EnterpriseRetailCustomerProfile_segment_idx" ON "EnterpriseRetailCustomerProfile"("organizationId", "segmentCode", "status");
CREATE INDEX "EnterpriseRetailCustomerProfile_pricelist_idx" ON "EnterpriseRetailCustomerProfile"("organizationId", "priceListCode", "status");
CREATE INDEX "EnterpriseRetailCustomerProfile_archived_idx" ON "EnterpriseRetailCustomerProfile"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseRetailLoyaltyProgram_org_id_key" ON "EnterpriseRetailLoyaltyProgram"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailLoyaltyProgram_code_key" ON "EnterpriseRetailLoyaltyProgram"("organizationId", "code");
CREATE INDEX "EnterpriseRetailLoyaltyProgram_status_window_idx" ON "EnterpriseRetailLoyaltyProgram"("organizationId", "status", "startsAt", "endsAt");
CREATE INDEX "EnterpriseRetailLoyaltyProgram_archived_idx" ON "EnterpriseRetailLoyaltyProgram"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseRetailLoyaltyAccount_org_id_key" ON "EnterpriseRetailLoyaltyAccount"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailLoyaltyAccount_program_customer_key" ON "EnterpriseRetailLoyaltyAccount"("organizationId", "programId", "customerBusinessPartyId");
CREATE INDEX "EnterpriseRetailLoyaltyAccount_customer_idx" ON "EnterpriseRetailLoyaltyAccount"("organizationId", "customerBusinessPartyId", "status");
CREATE INDEX "EnterpriseRetailLoyaltyAccount_tier_idx" ON "EnterpriseRetailLoyaltyAccount"("organizationId", "tierCode", "status");

CREATE UNIQUE INDEX "EnterpriseRetailLoyaltyEntry_org_id_key" ON "EnterpriseRetailLoyaltyEntry"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailLoyaltyEntry_idempotency_key" ON "EnterpriseRetailLoyaltyEntry"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailLoyaltyEntry_account_idx" ON "EnterpriseRetailLoyaltyEntry"("organizationId", "accountId", "createdAt");
CREATE INDEX "EnterpriseRetailLoyaltyEntry_sale_idx" ON "EnterpriseRetailLoyaltyEntry"("organizationId", "saleId");
CREATE INDEX "EnterpriseRetailLoyaltyEntry_return_idx" ON "EnterpriseRetailLoyaltyEntry"("organizationId", "returnId");
CREATE INDEX "EnterpriseRetailLoyaltyEntry_expiry_idx" ON "EnterpriseRetailLoyaltyEntry"("organizationId", "expiresAt");

CREATE UNIQUE INDEX "EnterpriseRetailStoredValueAccount_org_id_key" ON "EnterpriseRetailStoredValueAccount"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailStoredValueAccount_hash_key" ON "EnterpriseRetailStoredValueAccount"("organizationId", "lookupHash");
CREATE INDEX "EnterpriseRetailStoredValueAccount_customer_idx" ON "EnterpriseRetailStoredValueAccount"("organizationId", "customerBusinessPartyId", "status");
CREATE INDEX "EnterpriseRetailStoredValueAccount_type_idx" ON "EnterpriseRetailStoredValueAccount"("organizationId", "accountType", "status");
CREATE INDEX "EnterpriseRetailStoredValueAccount_expiry_idx" ON "EnterpriseRetailStoredValueAccount"("organizationId", "expiresAt", "status");
CREATE INDEX "EnterpriseRetailStoredValueAccount_archived_idx" ON "EnterpriseRetailStoredValueAccount"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseRetailStoredValueEntry_org_id_key" ON "EnterpriseRetailStoredValueEntry"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailStoredValueEntry_idempotency_key" ON "EnterpriseRetailStoredValueEntry"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailStoredValueEntry_account_idx" ON "EnterpriseRetailStoredValueEntry"("organizationId", "accountId", "createdAt");
CREATE INDEX "EnterpriseRetailStoredValueEntry_sale_idx" ON "EnterpriseRetailStoredValueEntry"("organizationId", "saleId");
CREATE INDEX "EnterpriseRetailStoredValueEntry_return_idx" ON "EnterpriseRetailStoredValueEntry"("organizationId", "returnId");

CREATE UNIQUE INDEX "EnterpriseRetailProviderIntegration_org_id_key" ON "EnterpriseRetailProviderIntegration"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailProviderIntegration_provider_key" ON "EnterpriseRetailProviderIntegration"("organizationId", "providerId");
CREATE INDEX "EnterpriseRetailProviderIntegration_mode_status_idx" ON "EnterpriseRetailProviderIntegration"("organizationId", "integrationMode", "connectionStatus");
CREATE INDEX "EnterpriseRetailProviderIntegration_adapter_idx" ON "EnterpriseRetailProviderIntegration"("organizationId", "adapterCode", "connectionStatus");
CREATE INDEX "EnterpriseRetailProviderIntegration_archived_idx" ON "EnterpriseRetailProviderIntegration"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseRetailProviderOperation_org_id_key" ON "EnterpriseRetailProviderOperation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailProviderOperation_idempotency_key" ON "EnterpriseRetailProviderOperation"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseRetailProviderOperation_reference_key" ON "EnterpriseRetailProviderOperation"("organizationId", "providerId", "externalReference");
CREATE INDEX "EnterpriseRetailProviderOperation_provider_status_idx" ON "EnterpriseRetailProviderOperation"("organizationId", "providerId", "status", "createdAt");
CREATE INDEX "EnterpriseRetailProviderOperation_source_idx" ON "EnterpriseRetailProviderOperation"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseRetailProviderOperation_retry_idx" ON "EnterpriseRetailProviderOperation"("organizationId", "nextRetryAt", "status");

CREATE UNIQUE INDEX "EnterpriseRetailPaymentTransaction_org_id_key" ON "EnterpriseRetailPaymentTransaction"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailPaymentTransaction_idempotency_key" ON "EnterpriseRetailPaymentTransaction"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseRetailPaymentTransaction_provider_reference_key" ON "EnterpriseRetailPaymentTransaction"("organizationId", "providerId", "providerReference");
CREATE INDEX "EnterpriseRetailPaymentTransaction_sale_idx" ON "EnterpriseRetailPaymentTransaction"("organizationId", "saleId", "status");
CREATE INDEX "EnterpriseRetailPaymentTransaction_return_idx" ON "EnterpriseRetailPaymentTransaction"("organizationId", "returnId", "status");
CREATE INDEX "EnterpriseRetailPaymentTransaction_provider_idx" ON "EnterpriseRetailPaymentTransaction"("organizationId", "providerId", "status", "createdAt");
CREATE INDEX "EnterpriseRetailPaymentTransaction_client_reference_idx" ON "EnterpriseRetailPaymentTransaction"("organizationId", "clientReference");

CREATE UNIQUE INDEX "EnterpriseRetailWebhookEvent_org_id_key" ON "EnterpriseRetailWebhookEvent"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailWebhookEvent_external_key" ON "EnterpriseRetailWebhookEvent"("organizationId", "providerId", "externalEventId");
CREATE INDEX "EnterpriseRetailWebhookEvent_provider_status_idx" ON "EnterpriseRetailWebhookEvent"("organizationId", "providerId", "status", "receivedAt");
CREATE INDEX "EnterpriseRetailWebhookEvent_operation_idx" ON "EnterpriseRetailWebhookEvent"("organizationId", "providerOperationId");
CREATE INDEX "EnterpriseRetailWebhookEvent_payment_idx" ON "EnterpriseRetailWebhookEvent"("organizationId", "paymentTransactionId");

CREATE UNIQUE INDEX "EnterpriseRetailDeviceProfile_org_id_key" ON "EnterpriseRetailDeviceProfile"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailDeviceProfile_code_key" ON "EnterpriseRetailDeviceProfile"("organizationId", "code");
CREATE INDEX "EnterpriseRetailDeviceProfile_site_type_idx" ON "EnterpriseRetailDeviceProfile"("organizationId", "siteId", "deviceType", "status");
CREATE INDEX "EnterpriseRetailDeviceProfile_type_connection_idx" ON "EnterpriseRetailDeviceProfile"("organizationId", "deviceType", "connectionMode", "status");
CREATE INDEX "EnterpriseRetailDeviceProfile_archived_idx" ON "EnterpriseRetailDeviceProfile"("archivedAt");

ALTER TABLE "EnterpriseRetailCustomerProfile" ADD CONSTRAINT "EnterpriseRetailCustomerProfile_party_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailLoyaltyAccount" ADD CONSTRAINT "EnterpriseRetailLoyaltyAccount_program_fkey" FOREIGN KEY ("organizationId", "programId") REFERENCES "EnterpriseRetailLoyaltyProgram"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailLoyaltyAccount" ADD CONSTRAINT "EnterpriseRetailLoyaltyAccount_customer_fkey" FOREIGN KEY ("organizationId", "customerBusinessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailLoyaltyEntry" ADD CONSTRAINT "EnterpriseRetailLoyaltyEntry_account_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "EnterpriseRetailLoyaltyAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailLoyaltyEntry" ADD CONSTRAINT "EnterpriseRetailLoyaltyEntry_sale_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailLoyaltyEntry" ADD CONSTRAINT "EnterpriseRetailLoyaltyEntry_return_fkey" FOREIGN KEY ("organizationId", "returnId") REFERENCES "EnterpriseRetailReturn"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailStoredValueAccount" ADD CONSTRAINT "EnterpriseRetailStoredValueAccount_customer_fkey" FOREIGN KEY ("organizationId", "customerBusinessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailStoredValueEntry" ADD CONSTRAINT "EnterpriseRetailStoredValueEntry_account_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "EnterpriseRetailStoredValueAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailStoredValueEntry" ADD CONSTRAINT "EnterpriseRetailStoredValueEntry_sale_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailStoredValueEntry" ADD CONSTRAINT "EnterpriseRetailStoredValueEntry_return_fkey" FOREIGN KEY ("organizationId", "returnId") REFERENCES "EnterpriseRetailReturn"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailProviderIntegration" ADD CONSTRAINT "EnterpriseRetailProviderIntegration_provider_fkey" FOREIGN KEY ("organizationId", "providerId") REFERENCES "EnterpriseRetailProvider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailProviderOperation" ADD CONSTRAINT "EnterpriseRetailProviderOperation_provider_fkey" FOREIGN KEY ("organizationId", "providerId") REFERENCES "EnterpriseRetailProvider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailPaymentTransaction" ADD CONSTRAINT "EnterpriseRetailPaymentTransaction_provider_fkey" FOREIGN KEY ("organizationId", "providerId") REFERENCES "EnterpriseRetailProvider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailPaymentTransaction" ADD CONSTRAINT "EnterpriseRetailPaymentTransaction_sale_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailPaymentTransaction" ADD CONSTRAINT "EnterpriseRetailPaymentTransaction_return_fkey" FOREIGN KEY ("organizationId", "returnId") REFERENCES "EnterpriseRetailReturn"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailWebhookEvent" ADD CONSTRAINT "EnterpriseRetailWebhookEvent_provider_fkey" FOREIGN KEY ("organizationId", "providerId") REFERENCES "EnterpriseRetailProvider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailWebhookEvent" ADD CONSTRAINT "EnterpriseRetailWebhookEvent_operation_fkey" FOREIGN KEY ("organizationId", "providerOperationId") REFERENCES "EnterpriseRetailProviderOperation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailWebhookEvent" ADD CONSTRAINT "EnterpriseRetailWebhookEvent_payment_fkey" FOREIGN KEY ("organizationId", "paymentTransactionId") REFERENCES "EnterpriseRetailPaymentTransaction"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailDeviceProfile" ADD CONSTRAINT "EnterpriseRetailDeviceProfile_site_fkey" FOREIGN KEY ("organizationId", "siteId") REFERENCES "EnterpriseSite"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
