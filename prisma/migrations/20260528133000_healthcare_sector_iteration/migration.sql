WITH health_template AS (
  SELECT t."id" AS "templateId", s."id" AS "sectorId"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'HEALTH_CARE' AND t."version" = 1
),
new_modules AS (
  SELECT * FROM jsonb_to_recordset('[
    {"moduleCode":"MEDICAL_DOCUMENTS","labelFr":"Documents médicaux","labelEn":"Medical documents","descriptionFr":"Ordonnances, résultats, certificats, comptes rendus et documents assurance liés aux patients.","descriptionEn":"Prescriptions, results, certificates, reports and insurance documents linked to patients.","icon":"file-text","sortOrder":320},
    {"moduleCode":"HEALTH_SETTINGS","labelFr":"Paramètres santé","labelEn":"Healthcare settings","descriptionFr":"Paramètres d''établissement, préfixes patients/factures, services, unités et verrouillage clinique.","descriptionEn":"Facility settings, patient/invoice prefixes, services, units and clinical locking.","icon":"settings","sortOrder":330},
    {"moduleCode":"HEALTH_REPORTS","labelFr":"Rapports santé","labelEn":"Healthcare reports","descriptionFr":"Rapports d''activité médicale, difficultés, recommandations et synthèses par service.","descriptionEn":"Medical activity reports, blockers, recommendations and service summaries.","icon":"file-bar-chart","sortOrder":340}
  ]'::jsonb) AS x("moduleCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "descriptionFr" TEXT, "descriptionEn" TEXT, "icon" TEXT, "sortOrder" INTEGER)
),
upsert_template_modules AS (
  INSERT INTO "SectorTemplateModule" ("id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder", "defaultEnabled")
  SELECT CONCAT('stm-', h."templateId", '-', LOWER(REPLACE(m."moduleCode", '_', '-'))), h."templateId", m."moduleCode", m."labelFr", m."labelEn", m."descriptionFr", m."descriptionEn", 'SECTOR', m."icon", m."sortOrder", true
  FROM health_template h CROSS JOIN new_modules m
  ON CONFLICT ("templateId", "moduleCode") DO UPDATE SET
    "labelFr" = EXCLUDED."labelFr",
    "labelEn" = EXCLUDED."labelEn",
    "descriptionFr" = EXCLUDED."descriptionFr",
    "descriptionEn" = EXCLUDED."descriptionEn",
    "moduleCategory" = EXCLUDED."moduleCategory",
    "icon" = EXCLUDED."icon",
    "sortOrder" = EXCLUDED."sortOrder",
    "defaultEnabled" = true,
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder"
)
INSERT INTO "EnterpriseModule" ("id", "organizationId", "sectorId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "isEnabled", "isCore", "sourceTemplateId", "sortOrder")
SELECT CONCAT('em-', o."id", '-', LOWER(REPLACE(tm."moduleCode", '_', '-'))), o."id", o."sectorId", tm."moduleCode", tm."labelFr", tm."labelEn", tm."descriptionFr", tm."descriptionEn", tm."moduleCategory", tm."icon", true, false, tm."id", tm."sortOrder"
FROM "Organization" o
JOIN upsert_template_modules tm ON true
WHERE o."sectorCode" = 'HEALTH_CARE'
  AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder",
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "EnterpriseAdminSection" ("id", "organizationId", "moduleId", "sectionCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "isEnabled", "requiredPermission", "sortOrder", "sourceTemplateId")
SELECT CONCAT('eas-', em."organizationId", '-', LOWER(REPLACE(em."moduleCode", '_', '-'))), em."organizationId", em."id", em."moduleCode", em."labelFr", em."labelEn", em."descriptionFr", em."descriptionEn", em."icon", true, CONCAT('enterprise.', LOWER(em."moduleCode"), '.manage'), em."sortOrder", em."sourceTemplateId"
FROM "EnterpriseModule" em
JOIN "Organization" o ON o."id" = em."organizationId"
WHERE o."sectorCode" = 'HEALTH_CARE'
  AND em."moduleCode" IN ('MEDICAL_DOCUMENTS', 'HEALTH_SETTINGS', 'HEALTH_REPORTS')
ON CONFLICT ("organizationId", "sectionCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder",
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH health_template AS (
  SELECT t."id" AS "templateId", s."id" AS "sectorId"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'HEALTH_CARE' AND t."version" = 1
),
new_blocks AS (
  SELECT * FROM jsonb_to_recordset('[
    {"blockCode":"REPORT_LAB_ISSUE","labelFr":"Signaler problème laboratoire","labelEn":"Report laboratory issue","descriptionFr":"Signaler un retard, une anomalie de prélèvement ou un problème de résultat.","descriptionEn":"Report a delay, sampling anomaly or result issue.","targetModuleCode":"LABORATORY","icon":"microscope","sortOrder":281},
    {"blockCode":"REPORT_PHARMACY_STOCKOUT","labelFr":"Signaler rupture pharmacie","labelEn":"Report pharmacy stockout","descriptionFr":"Signaler une rupture, un seuil critique ou une péremption proche en pharmacie interne.","descriptionEn":"Report a stockout, critical threshold or upcoming expiry in internal pharmacy.","targetModuleCode":"INTERNAL_PHARMACY","icon":"pill","sortOrder":282},
    {"blockCode":"SUBMIT_PATIENT_DOCUMENT","labelFr":"Soumettre document patient","labelEn":"Submit patient document","descriptionFr":"Soumettre une demande de classement ou validation d''un document patient.","descriptionEn":"Submit a request to classify or validate a patient document.","targetModuleCode":"MEDICAL_DOCUMENTS","icon":"file-text","sortOrder":283}
  ]'::jsonb) AS x("blockCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "descriptionFr" TEXT, "descriptionEn" TEXT, "targetModuleCode" TEXT, "icon" TEXT, "sortOrder" INTEGER)
),
upsert_template_blocks AS (
  INSERT INTO "SectorTemplateActivityBlock" ("id", "templateId", "blockCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder", "defaultEnabled", "targetModuleCode")
  SELECT CONCAT('stab-', h."templateId", '-', LOWER(REPLACE(b."blockCode", '_', '-'))), h."templateId", b."blockCode", b."labelFr", b."labelEn", b."descriptionFr", b."descriptionEn", b."icon", b."sortOrder", true, b."targetModuleCode"
  FROM health_template h CROSS JOIN new_blocks b
  ON CONFLICT ("templateId", "blockCode") DO UPDATE SET
    "labelFr" = EXCLUDED."labelFr",
    "labelEn" = EXCLUDED."labelEn",
    "descriptionFr" = EXCLUDED."descriptionFr",
    "descriptionEn" = EXCLUDED."descriptionEn",
    "icon" = EXCLUDED."icon",
    "sortOrder" = EXCLUDED."sortOrder",
    "defaultEnabled" = true,
    "targetModuleCode" = EXCLUDED."targetModuleCode",
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id", "blockCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder", "targetModuleCode"
)
INSERT INTO "EnterpriseActivityBlock" ("id", "organizationId", "sectorId", "blockCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "targetModuleCode", "isEnabled", "sourceTemplateId", "sortOrder")
SELECT CONCAT('eab-', o."id", '-', LOWER(REPLACE(tb."blockCode", '_', '-'))), o."id", o."sectorId", tb."blockCode", tb."labelFr", tb."labelEn", tb."descriptionFr", tb."descriptionEn", tb."icon", tb."targetModuleCode", true, tb."id", tb."sortOrder"
FROM "Organization" o
JOIN upsert_template_blocks tb ON true
WHERE o."sectorCode" = 'HEALTH_CARE'
  AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId", "blockCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "icon" = EXCLUDED."icon",
  "targetModuleCode" = EXCLUDED."targetModuleCode",
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
