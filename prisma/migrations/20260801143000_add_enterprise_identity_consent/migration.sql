-- Additive foundation for consented links between DTSC accounts and enterprise business records.
-- No existing party, employee, member or user row is linked automatically.

CREATE TABLE "EnterprisePersonIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "primaryEmail" TEXT,
    "primaryPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterprisePersonIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterprisePersonIdentity_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "EnterprisePersonIdentity_revision_check" CHECK ("revision" >= 1)
);

CREATE UNIQUE INDEX "EnterprisePersonIdentity_organizationId_id_key" ON "EnterprisePersonIdentity"("organizationId", "id");
CREATE INDEX "EnterprisePersonIdentity_organizationId_status_displayName_idx" ON "EnterprisePersonIdentity"("organizationId", "status", "displayName");
CREATE INDEX "EnterprisePersonIdentity_organizationId_primaryEmail_idx" ON "EnterprisePersonIdentity"("organizationId", "primaryEmail");
CREATE INDEX "EnterprisePersonIdentity_organizationId_primaryPhone_idx" ON "EnterprisePersonIdentity"("organizationId", "primaryPhone");
CREATE INDEX "EnterprisePersonIdentity_archivedAt_idx" ON "EnterprisePersonIdentity"("archivedAt");

CREATE TABLE "EnterprisePersonBusinessReference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personIdentityId" TEXT NOT NULL,
    "businessPartyId" TEXT,
    "businessPartyContactId" TEXT,
    "employeeId" TEXT,
    "relationType" TEXT NOT NULL,
    "roleCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterprisePersonBusinessReference_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterprisePersonBusinessReference_one_target_check"
      CHECK ((CASE WHEN "businessPartyId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "businessPartyContactId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "employeeId" IS NULL THEN 0 ELSE 1 END) = 1),
    CONSTRAINT "EnterprisePersonBusinessReference_relationType_check"
      CHECK ("relationType" IN ('PROSPECT', 'CUSTOMER', 'CUSTOMER_CONTACT', 'SUPPLIER_REPRESENTATIVE', 'EMPLOYEE', 'COLLABORATOR', 'CONTRACTOR', 'PARTNER', 'OTHER')),
    CONSTRAINT "EnterprisePersonBusinessReference_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "EnterprisePersonBusinessReference_revision_check" CHECK ("revision" >= 1)
);

CREATE UNIQUE INDEX "EnterprisePersonBusinessReference_organizationId_id_key" ON "EnterprisePersonBusinessReference"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePersonBusinessReference_org_party_relation_key" ON "EnterprisePersonBusinessReference"("organizationId", "businessPartyId", "relationType");
CREATE UNIQUE INDEX "EnterprisePersonBusinessReference_org_contact_relation_key" ON "EnterprisePersonBusinessReference"("organizationId", "businessPartyContactId", "relationType");
CREATE UNIQUE INDEX "EnterprisePersonBusinessReference_org_employee_relation_key" ON "EnterprisePersonBusinessReference"("organizationId", "employeeId", "relationType");
CREATE INDEX "EnterprisePersonBusinessReference_org_person_status_idx" ON "EnterprisePersonBusinessReference"("organizationId", "personIdentityId", "status");
CREATE INDEX "EnterprisePersonBusinessReference_org_type_status_idx" ON "EnterprisePersonBusinessReference"("organizationId", "relationType", "status");
CREATE INDEX "EnterprisePersonBusinessReference_org_party_idx" ON "EnterprisePersonBusinessReference"("organizationId", "businessPartyId");
CREATE INDEX "EnterprisePersonBusinessReference_org_contact_idx" ON "EnterprisePersonBusinessReference"("organizationId", "businessPartyContactId");
CREATE INDEX "EnterprisePersonBusinessReference_org_employee_idx" ON "EnterprisePersonBusinessReference"("organizationId", "employeeId");
CREATE INDEX "EnterprisePersonBusinessReference_archivedAt_idx" ON "EnterprisePersonBusinessReference"("archivedAt");

CREATE TABLE "EnterpriseIdentityLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personIdentityId" TEXT NOT NULL,
    "userId" TEXT,
    "origin" TEXT NOT NULL,
    "requestedRelationType" TEXT NOT NULL,
    "requestedRoleCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "initiatedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "purpose" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "invitationEmailDigest" TEXT,
    "invitationTokenDigest" TEXT,
    "invitationSentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "userDecisionAt" TIMESTAMP(3),
    "organizationDecisionAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refusalReason" TEXT,
    "revocationReason" TEXT,
    "cancellationReason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseIdentityLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseIdentityLink_origin_check" CHECK ("origin" IN ('ENTERPRISE', 'USER')),
    CONSTRAINT "EnterpriseIdentityLink_relationType_check" CHECK ("requestedRelationType" IN ('PROSPECT', 'CUSTOMER', 'CUSTOMER_CONTACT', 'SUPPLIER_REPRESENTATIVE', 'EMPLOYEE', 'COLLABORATOR', 'CONTRACTOR', 'PARTNER', 'OTHER')),
    CONSTRAINT "EnterpriseIdentityLink_status_check" CHECK ("status" IN ('DRAFT', 'INVITATION_PENDING', 'REQUEST_PENDING', 'USER_CONSENT_REQUIRED', 'ORGANIZATION_APPROVAL_REQUIRED', 'ACTIVE', 'REFUSED', 'EXPIRED', 'REVOKED', 'CANCELLED')),
    CONSTRAINT "EnterpriseIdentityLink_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "EnterpriseIdentityLink_active_requires_user_check" CHECK ("status" <> 'ACTIVE' OR "userId" IS NOT NULL),
    CONSTRAINT "EnterpriseIdentityLink_invitation_expiry_check" CHECK ("origin" <> 'ENTERPRISE' OR "expiresAt" IS NOT NULL OR "status" IN ('DRAFT', 'ACTIVE', 'REFUSED', 'REVOKED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "EnterpriseIdentityLink_organizationId_id_key" ON "EnterpriseIdentityLink"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseIdentityLink_invitationTokenDigest_key" ON "EnterpriseIdentityLink"("invitationTokenDigest");
CREATE UNIQUE INDEX "EnterpriseIdentityLink_active_person_user_key" ON "EnterpriseIdentityLink"("organizationId", "personIdentityId", "userId") WHERE "status" = 'ACTIVE' AND "userId" IS NOT NULL;
CREATE INDEX "EnterpriseIdentityLink_org_status_created_idx" ON "EnterpriseIdentityLink"("organizationId", "status", "createdAt");
CREATE INDEX "EnterpriseIdentityLink_org_relation_status_idx" ON "EnterpriseIdentityLink"("organizationId", "requestedRelationType", "status");
CREATE INDEX "EnterpriseIdentityLink_org_person_status_idx" ON "EnterpriseIdentityLink"("organizationId", "personIdentityId", "status");
CREATE INDEX "EnterpriseIdentityLink_user_status_created_idx" ON "EnterpriseIdentityLink"("userId", "status", "createdAt");
CREATE INDEX "EnterpriseIdentityLink_expiry_status_idx" ON "EnterpriseIdentityLink"("expiresAt", "status");
CREATE INDEX "EnterpriseIdentityLink_initiator_created_idx" ON "EnterpriseIdentityLink"("initiatedByUserId", "createdAt");

CREATE TABLE "EnterpriseIdentityConsentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "identityLinkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "statementDigest" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,
    CONSTRAINT "EnterpriseIdentityConsentRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseIdentityConsentRecord_action_check" CHECK ("action" IN ('ACCEPT', 'REVOKE'))
);

CREATE UNIQUE INDEX "EnterpriseIdentityConsentRecord_link_action_recorded_key" ON "EnterpriseIdentityConsentRecord"("identityLinkId", "action", "recordedAt");
CREATE INDEX "EnterpriseIdentityConsentRecord_org_user_recorded_idx" ON "EnterpriseIdentityConsentRecord"("organizationId", "userId", "recordedAt");
CREATE INDEX "EnterpriseIdentityConsentRecord_link_recorded_idx" ON "EnterpriseIdentityConsentRecord"("identityLinkId", "recordedAt");

CREATE TABLE "EnterpriseIdentityLinkEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "identityLinkId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorUserId" TEXT,
    "reason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseIdentityLinkEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnterpriseIdentityLinkEvent_org_link_created_idx" ON "EnterpriseIdentityLinkEvent"("organizationId", "identityLinkId", "createdAt");
CREATE INDEX "EnterpriseIdentityLinkEvent_actor_created_idx" ON "EnterpriseIdentityLinkEvent"("actorUserId", "createdAt");
CREATE INDEX "EnterpriseIdentityLinkEvent_type_created_idx" ON "EnterpriseIdentityLinkEvent"("eventType", "createdAt");

ALTER TABLE "EnterprisePersonIdentity"
  ADD CONSTRAINT "EnterprisePersonIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonIdentity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonIdentity_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnterprisePersonBusinessReference"
  ADD CONSTRAINT "EnterprisePersonBusinessReference_org_person_fkey" FOREIGN KEY ("organizationId", "personIdentityId") REFERENCES "EnterprisePersonIdentity"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonBusinessReference_org_party_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonBusinessReference_contact_fkey" FOREIGN KEY ("businessPartyContactId") REFERENCES "EnterpriseBusinessPartyContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonBusinessReference_org_employee_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "EnterpriseEmployee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonBusinessReference_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterprisePersonBusinessReference_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnterpriseIdentityLink"
  ADD CONSTRAINT "EnterpriseIdentityLink_org_person_fkey" FOREIGN KEY ("organizationId", "personIdentityId") REFERENCES "EnterprisePersonIdentity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterpriseIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterpriseIdentityLink_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterpriseIdentityLink_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnterpriseIdentityConsentRecord"
  ADD CONSTRAINT "EnterpriseIdentityConsentRecord_org_link_fkey" FOREIGN KEY ("organizationId", "identityLinkId") REFERENCES "EnterpriseIdentityLink"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterpriseIdentityConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseIdentityLinkEvent"
  ADD CONSTRAINT "EnterpriseIdentityLinkEvent_org_link_fkey" FOREIGN KEY ("organizationId", "identityLinkId") REFERENCES "EnterpriseIdentityLink"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EnterpriseIdentityLinkEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
