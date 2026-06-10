CREATE TABLE "PharmacyPrescription" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "prescriptionNumber" TEXT NOT NULL, "prescriptionType" TEXT NOT NULL,
  "prescriptionDate" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL, "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "customerId" TEXT, "patientId" TEXT, "patientName" TEXT NOT NULL, "patientAge" INTEGER, "patientSex" TEXT, "patientPhone" TEXT,
  "patientAddress" TEXT, "patientType" TEXT, "patientNotes" TEXT, "prescriberName" TEXT NOT NULL, "prescriberType" TEXT,
  "prescriberIdentifier" TEXT, "prescriberPhone" TEXT, "prescriberFacility" TEXT, "prescriberSpeciality" TEXT,
  "prescriberAddress" TEXT, "prescriberNotes" TEXT, "pharmacistId" TEXT, "validationStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
  "pharmacistComment" TEXT, "pharmacistValidatedAt" TIMESTAMP(3), "rejectionReason" TEXT, "riskDetected" TEXT,
  "recommendedAction" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "linkedSaleId" TEXT, "mainDocumentUrl" TEXT, "notes" TEXT,
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyPrescription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPrescriptionLine" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "prescriptionId" TEXT NOT NULL, "prescribedProductText" TEXT NOT NULL,
  "prescribedGenericName" TEXT, "productId" TEXT, "matchedProductId" TEXT, "substituteProductId" TEXT,
  "substitutionApplied" BOOLEAN NOT NULL DEFAULT false, "substitutionReason" TEXT, "dosage" TEXT, "pharmaceuticalForm" TEXT,
  "prescribedQuantity" DECIMAL(14,3), "prescribedUnit" TEXT, "dispensedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "frequency" TEXT, "duration" TEXT, "administrationRoute" TEXT, "posology" TEXT,
  "substitutionAllowed" BOOLEAN NOT NULL DEFAULT false, "matchingStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
  "dispensingStatus" TEXT NOT NULL DEFAULT 'NOT_DISPENSED', "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyPrescriptionLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPrescriptionDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "prescriptionId" TEXT NOT NULL, "documentType" TEXT NOT NULL,
  "title" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "reference" TEXT, "documentDate" TIMESTAMP(3),
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'CONFIDENTIAL', "notes" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPrescriptionDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPrescriptionAuditEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "prescriptionId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "oldValue" JSONB, "newValue" JSONB, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyPrescriptionAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyPrescription_organizationId_prescriptionNumber_key" ON "PharmacyPrescription"("organizationId","prescriptionNumber");
CREATE INDEX "PharmacyPrescription_organizationId_prescriptionDate_idx" ON "PharmacyPrescription"("organizationId","prescriptionDate");
CREATE INDEX "PharmacyPrescription_organizationId_receivedAt_idx" ON "PharmacyPrescription"("organizationId","receivedAt");
CREATE INDEX "PharmacyPrescription_organizationId_status_validationStatus_idx" ON "PharmacyPrescription"("organizationId","status","validationStatus");
CREATE INDEX "PharmacyPrescription_organizationId_pharmacistId_idx" ON "PharmacyPrescription"("organizationId","pharmacistId");
CREATE INDEX "PharmacyPrescription_organizationId_linkedSaleId_idx" ON "PharmacyPrescription"("organizationId","linkedSaleId");
CREATE INDEX "PharmacyPrescriptionLine_organizationId_prescriptionId_idx" ON "PharmacyPrescriptionLine"("organizationId","prescriptionId");
CREATE INDEX "PharmacyPrescriptionLine_organizationId_productId_idx" ON "PharmacyPrescriptionLine"("organizationId","productId");
CREATE INDEX "PharmacyPrescriptionLine_organizationId_matchedProductId_idx" ON "PharmacyPrescriptionLine"("organizationId","matchedProductId");
CREATE INDEX "PharmacyPrescriptionLine_organizationId_substituteProductId_idx" ON "PharmacyPrescriptionLine"("organizationId","substituteProductId");
CREATE INDEX "PharmacyPrescriptionLine_organizationId_matchingStatus_dispensingStatus_idx" ON "PharmacyPrescriptionLine"("organizationId","matchingStatus","dispensingStatus");
CREATE INDEX "PharmacyPrescriptionDocument_organizationId_prescriptionId_idx" ON "PharmacyPrescriptionDocument"("organizationId","prescriptionId");
CREATE INDEX "PharmacyPrescriptionDocument_organizationId_confidentialityLevel_idx" ON "PharmacyPrescriptionDocument"("organizationId","confidentialityLevel");
CREATE INDEX "PharmacyPrescriptionAuditEvent_organizationId_prescriptionId_createdAt_idx" ON "PharmacyPrescriptionAuditEvent"("organizationId","prescriptionId","createdAt");
CREATE INDEX "PharmacyPrescriptionAuditEvent_organizationId_actorId_createdAt_idx" ON "PharmacyPrescriptionAuditEvent"("organizationId","actorId","createdAt");
CREATE INDEX "PharmacySale_organizationId_prescriptionId_idx" ON "PharmacySale"("organizationId","prescriptionId");
ALTER TABLE "PharmacyPrescriptionLine" ADD CONSTRAINT "PharmacyPrescriptionLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PharmacyPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPrescriptionDocument" ADD CONSTRAINT "PharmacyPrescriptionDocument_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PharmacyPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPrescriptionAuditEvent" ADD CONSTRAINT "PharmacyPrescriptionAuditEvent_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PharmacyPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
