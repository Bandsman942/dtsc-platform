WITH pharmacy_template AS (
  SELECT t."id" AS "templateId"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'PHARMACY' AND t."version" = 1
),
pharmacy_modules AS (
  SELECT * FROM jsonb_to_recordset('[
    {"moduleCode":"MEDICINES_PRODUCTS","labelFr":"Produits & médicaments","labelEn":"Products & medicines","descriptionFr":"Référentiel produits, règles de dispensation, seuils, conservation et prix.","descriptionEn":"Product catalog, dispensing rules, thresholds, storage and prices.","icon":"pill","sortOrder":210},
    {"moduleCode":"BATCH_EXPIRY","labelFr":"Lots & péremptions","labelEn":"Batches & expiry","descriptionFr":"Lots, dates de péremption, quantités disponibles, quarantaine et rappels.","descriptionEn":"Batches, expiry dates, available quantities, quarantine and recalls.","icon":"hourglass","sortOrder":220},
    {"moduleCode":"STOCK_INVENTORY","labelFr":"Stock & inventaire","labelEn":"Stock & inventory","descriptionFr":"Stock théorique, inventaires, écarts et ajustements validés.","descriptionEn":"Theoretical stock, inventories, variances and validated adjustments.","icon":"boxes","sortOrder":230},
    {"moduleCode":"STOCK_RECEIPTS","labelFr":"Entrées stock / réceptions","labelEn":"Stock receipts","descriptionFr":"Réceptions fournisseurs et augmentation contrôlée du stock.","descriptionEn":"Supplier receipts and controlled stock increases.","icon":"package-check","sortOrder":240},
    {"moduleCode":"SALES_DISPENSATION","labelFr":"Sorties, ventes & dispensation","labelEn":"Sales & dispensing","descriptionFr":"Ventes liées aux lots disponibles avec impact stock contrôlé.","descriptionEn":"Sales linked to available batches with controlled stock impact.","icon":"receipt","sortOrder":250},
    {"moduleCode":"PRESCRIPTIONS","labelFr":"Ordonnances / prescriptions","labelEn":"Prescriptions","descriptionFr":"Ordonnances reçues, validation pharmacien et liaison vente.","descriptionEn":"Received prescriptions, pharmacist validation and sale linkage.","icon":"clipboard-list","sortOrder":260},
    {"moduleCode":"SUPPLIERS_ORDERS","labelFr":"Fournisseurs & commandes","labelEn":"Suppliers & orders","descriptionFr":"Fournisseurs, commandes de réapprovisionnement et suivi des réceptions.","descriptionEn":"Suppliers, replenishment orders and receipt tracking.","icon":"shopping-cart","sortOrder":270},
    {"moduleCode":"CASH_INVOICES_PAYMENTS","labelFr":"Caisse, factures & paiements","labelEn":"Cash, invoices & payments","descriptionFr":"Sessions caisse, factures, paiements, clôtures et écarts.","descriptionEn":"Cash sessions, invoices, payments, closures and variances.","icon":"wallet","sortOrder":280},
    {"moduleCode":"RETURNS_ADJUSTMENTS_LOSSES","labelFr":"Retours, ajustements & pertes","labelEn":"Returns, adjustments & losses","descriptionFr":"Corrections de stock avec motif, validation et audit.","descriptionEn":"Stock corrections with reason, validation and audit.","icon":"rotate-ccw","sortOrder":290},
    {"moduleCode":"ALERTS_EXPIRY_LOW_STOCK","labelFr":"Alertes stock / péremption / rappel","labelEn":"Stock, expiry & recall alerts","descriptionFr":"Alertes critiques de stock, péremption, rappel et conservation.","descriptionEn":"Critical stock, expiry, recall and storage alerts.","icon":"bell-ring","sortOrder":300},
    {"moduleCode":"QUALITY_PHARMACOVIGILANCE","labelFr":"Incidents qualité & pharmacovigilance","labelEn":"Quality incidents & pharmacovigilance","descriptionFr":"Incidents qualité, effets indésirables et actions immédiates.","descriptionEn":"Quality incidents, adverse effects and immediate actions.","icon":"triangle-alert","sortOrder":310},
    {"moduleCode":"PHARMACY_DOCUMENTS","labelFr":"Documents & conformité","labelEn":"Documents & compliance","descriptionFr":"Documents internes contrôlés et références de conformité.","descriptionEn":"Controlled internal documents and compliance references.","icon":"file-text","sortOrder":320},
    {"moduleCode":"PHARMACY_REPORTS","labelFr":"Rapports pharmacie","labelEn":"Pharmacy reports","descriptionFr":"Rapports stock, ventes, achats, pertes, péremptions et caisse.","descriptionEn":"Stock, sales, purchases, losses, expiry and cash reports.","icon":"file-bar-chart","sortOrder":330},
    {"moduleCode":"PHARMACY_SETTINGS","labelFr":"Paramètres pharmacie","labelEn":"Pharmacy settings","descriptionFr":"Préfixes, devise, seuils, FEFO et règles de validation.","descriptionEn":"Prefixes, currency, thresholds, FEFO and validation rules.","icon":"settings","sortOrder":340}
  ]'::jsonb) AS x("moduleCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "descriptionFr" TEXT, "descriptionEn" TEXT, "icon" TEXT, "sortOrder" INTEGER)
),
saved_modules AS (
  INSERT INTO "SectorTemplateModule" ("id","templateId","moduleCode","labelFr","labelEn","descriptionFr","descriptionEn","moduleCategory","icon","sortOrder","defaultEnabled","requiresPlanLevel")
  SELECT CONCAT('stm-', p."templateId", '-', LOWER(REPLACE(m."moduleCode",'_','-'))), p."templateId", m."moduleCode", m."labelFr", m."labelEn", m."descriptionFr", m."descriptionEn", 'SECTOR', m."icon", m."sortOrder", true, 'ENTERPRISE'
  FROM pharmacy_template p CROSS JOIN pharmacy_modules m
  ON CONFLICT ("templateId","moduleCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","descriptionFr"=EXCLUDED."descriptionFr","descriptionEn"=EXCLUDED."descriptionEn","icon"=EXCLUDED."icon","sortOrder"=EXCLUDED."sortOrder","defaultEnabled"=true,"requiresPlanLevel"='ENTERPRISE',"updatedAt"=CURRENT_TIMESTAMP
  RETURNING *
)
INSERT INTO "EnterpriseModule" ("id","organizationId","sectorId","moduleCode","labelFr","labelEn","descriptionFr","descriptionEn","moduleCategory","icon","isEnabled","isCore","sourceTemplateId","requiresPlanLevel","sortOrder")
SELECT CONCAT('em-',o."id",'-',LOWER(REPLACE(m."moduleCode",'_','-'))),o."id",o."sectorId",m."moduleCode",m."labelFr",m."labelEn",m."descriptionFr",m."descriptionEn",'SECTOR',m."icon",true,false,m."id",'ENTERPRISE',m."sortOrder"
FROM "Organization" o CROSS JOIN saved_modules m
WHERE o."sectorCode"='PHARMACY' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId","moduleCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","descriptionFr"=EXCLUDED."descriptionFr","descriptionEn"=EXCLUDED."descriptionEn","icon"=EXCLUDED."icon","isEnabled"=true,"sourceTemplateId"=EXCLUDED."sourceTemplateId","requiresPlanLevel"='ENTERPRISE',"sortOrder"=EXCLUDED."sortOrder","updatedAt"=CURRENT_TIMESTAMP;

INSERT INTO "EnterpriseAdminSection" ("id","organizationId","moduleId","sectionCode","labelFr","labelEn","descriptionFr","descriptionEn","icon","isEnabled","requiredPermission","sortOrder","sourceTemplateId")
SELECT CONCAT('eas-',em."organizationId",'-',LOWER(REPLACE(em."moduleCode",'_','-'))),em."organizationId",em."id",em."moduleCode",em."labelFr",em."labelEn",em."descriptionFr",em."descriptionEn",em."icon",true,CONCAT('module:',em."moduleCode",':manage'),em."sortOrder",em."sourceTemplateId"
FROM "EnterpriseModule" em JOIN "Organization" o ON o."id"=em."organizationId"
WHERE o."sectorCode"='PHARMACY' AND em."isCore"=false
ON CONFLICT ("organizationId","sectionCode") DO UPDATE SET "moduleId"=EXCLUDED."moduleId","labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","descriptionFr"=EXCLUDED."descriptionFr","descriptionEn"=EXCLUDED."descriptionEn","icon"=EXCLUDED."icon","isEnabled"=true,"requiredPermission"=EXCLUDED."requiredPermission","sortOrder"=EXCLUDED."sortOrder","sourceTemplateId"=EXCLUDED."sourceTemplateId","updatedAt"=CURRENT_TIMESTAMP;

WITH pharmacy_template AS (
  SELECT t."id" AS "templateId" FROM "SectorTemplate" t JOIN "BusinessSector" s ON s."id"=t."sectorId" WHERE s."code"='PHARMACY' AND t."version"=1
),
pharmacy_blocks AS (
  SELECT * FROM jsonb_to_recordset('[
    {"blockCode":"MY_PHARMACY_ACTIONS","labelFr":"Mes ventes / actions du jour","labelEn":"My pharmacy actions today","descriptionFr":"Consulter et transmettre les actions pharmacie du jour.","descriptionEn":"Review and submit today pharmacy actions.","targetModuleCode":"SALES_DISPENSATION","icon":"activity","sortOrder":210},
    {"blockCode":"REPORT_LOW_STOCK","labelFr":"Signaler rupture de stock","labelEn":"Report stockout","descriptionFr":"Signaler une rupture ou un seuil critique.","descriptionEn":"Report a stockout or critical threshold.","targetModuleCode":"ALERTS_EXPIRY_LOW_STOCK","icon":"bell-ring","sortOrder":220},
    {"blockCode":"REQUEST_REPLENISHMENT","labelFr":"Demander réapprovisionnement","labelEn":"Request replenishment","descriptionFr":"Demander un réapprovisionnement produit.","descriptionEn":"Request product replenishment.","targetModuleCode":"SUPPLIERS_ORDERS","icon":"shopping-cart","sortOrder":230},
    {"blockCode":"DECLARE_NEAR_EXPIRY","labelFr":"Déclarer produit proche péremption","labelEn":"Declare near-expiry product","descriptionFr":"Signaler un lot proche de péremption.","descriptionEn":"Report a near-expiry batch.","targetModuleCode":"BATCH_EXPIRY","icon":"hourglass","sortOrder":240},
    {"blockCode":"REQUEST_PURCHASE_VALIDATION","labelFr":"Demander validation achat","labelEn":"Request purchase validation","descriptionFr":"Soumettre une commande à validation.","descriptionEn":"Submit an order for validation.","targetModuleCode":"SUPPLIERS_ORDERS","icon":"badge-check","sortOrder":250},
    {"blockCode":"REQUEST_STOCK_ADJUSTMENT_VALIDATION","labelFr":"Demander validation ajustement stock","labelEn":"Request stock adjustment validation","descriptionFr":"Soumettre un ajustement stock sensible.","descriptionEn":"Submit a sensitive stock adjustment.","targetModuleCode":"RETURNS_ADJUSTMENTS_LOSSES","icon":"boxes","sortOrder":260},
    {"blockCode":"SUBMIT_CASH_REPORT","labelFr":"Soumettre rapport caisse","labelEn":"Submit cash report","descriptionFr":"Transmettre un rapport et les écarts de caisse.","descriptionEn":"Submit a cash report and variances.","targetModuleCode":"CASH_INVOICES_PAYMENTS","icon":"receipt","sortOrder":270},
    {"blockCode":"REPORT_SALE_ANOMALY","labelFr":"Signaler anomalie vente","labelEn":"Report sale anomaly","descriptionFr":"Signaler une anomalie liée à une vente.","descriptionEn":"Report a sale anomaly.","targetModuleCode":"SALES_DISPENSATION","icon":"triangle-alert","sortOrder":280},
    {"blockCode":"REPORT_QUALITY_INCIDENT","labelFr":"Signaler incident qualité","labelEn":"Report quality incident","descriptionFr":"Signaler un incident qualité ou de pharmacovigilance.","descriptionEn":"Report a quality or pharmacovigilance incident.","targetModuleCode":"QUALITY_PHARMACOVIGILANCE","icon":"triangle-alert","sortOrder":290},
    {"blockCode":"REQUEST_PHARMACIST_OPINION","labelFr":"Demander avis pharmacien","labelEn":"Request pharmacist opinion","descriptionFr":"Demander un avis de dispensation ou prescription.","descriptionEn":"Request dispensing or prescription advice.","targetModuleCode":"PRESCRIPTIONS","icon":"message-square","sortOrder":300},
    {"blockCode":"SUBMIT_INVENTORY","labelFr":"Soumettre inventaire","labelEn":"Submit inventory","descriptionFr":"Soumettre une session inventaire et ses écarts.","descriptionEn":"Submit an inventory session and variances.","targetModuleCode":"STOCK_INVENTORY","icon":"clipboard-list","sortOrder":310}
  ]'::jsonb) AS x("blockCode" TEXT,"labelFr" TEXT,"labelEn" TEXT,"descriptionFr" TEXT,"descriptionEn" TEXT,"targetModuleCode" TEXT,"icon" TEXT,"sortOrder" INTEGER)
),
saved_blocks AS (
  INSERT INTO "SectorTemplateActivityBlock" ("id","templateId","blockCode","labelFr","labelEn","descriptionFr","descriptionEn","icon","sortOrder","defaultEnabled","targetModuleCode")
  SELECT CONCAT('stab-',p."templateId",'-',LOWER(REPLACE(b."blockCode",'_','-'))),p."templateId",b."blockCode",b."labelFr",b."labelEn",b."descriptionFr",b."descriptionEn",b."icon",b."sortOrder",true,b."targetModuleCode"
  FROM pharmacy_template p CROSS JOIN pharmacy_blocks b
  ON CONFLICT ("templateId","blockCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","descriptionFr"=EXCLUDED."descriptionFr","descriptionEn"=EXCLUDED."descriptionEn","icon"=EXCLUDED."icon","sortOrder"=EXCLUDED."sortOrder","defaultEnabled"=true,"targetModuleCode"=EXCLUDED."targetModuleCode","updatedAt"=CURRENT_TIMESTAMP
  RETURNING *
)
INSERT INTO "EnterpriseActivityBlock" ("id","organizationId","sectorId","blockCode","labelFr","labelEn","descriptionFr","descriptionEn","icon","targetModuleCode","isEnabled","requiredPermission","sourceTemplateId","sortOrder")
SELECT CONCAT('eab-',o."id",'-',LOWER(REPLACE(b."blockCode",'_','-'))),o."id",o."sectorId",b."blockCode",b."labelFr",b."labelEn",b."descriptionFr",b."descriptionEn",b."icon",b."targetModuleCode",true,CONCAT('module:',b."targetModuleCode",':submit'),b."id",b."sortOrder"
FROM "Organization" o CROSS JOIN saved_blocks b
WHERE o."sectorCode"='PHARMACY' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId","blockCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","descriptionFr"=EXCLUDED."descriptionFr","descriptionEn"=EXCLUDED."descriptionEn","icon"=EXCLUDED."icon","targetModuleCode"=EXCLUDED."targetModuleCode","isEnabled"=true,"requiredPermission"=EXCLUDED."requiredPermission","sourceTemplateId"=EXCLUDED."sourceTemplateId","sortOrder"=EXCLUDED."sortOrder","updatedAt"=CURRENT_TIMESTAMP;

WITH pharmacy_template AS (
  SELECT t."id" AS "templateId" FROM "SectorTemplate" t JOIN "BusinessSector" s ON s."id"=t."sectorId" WHERE s."code"='PHARMACY' AND t."version"=1
),
positions AS (
  SELECT * FROM jsonb_to_recordset('[
    {"positionCode":"RESPONSIBLE_PHARMACIST","labelFr":"Pharmacien responsable","labelEn":"Responsible pharmacist","departmentCode":"OPERATIONS","level":20,"permissions":["pharmacy.products.view","pharmacy.products.create","pharmacy.products.update","pharmacy.batches.manage","pharmacy.prescriptions.validate","pharmacy.quality.manage","pharmacy.reports.view","pharmacy.settings.update"]},
    {"positionCode":"QUALITY_MANAGER","labelFr":"Responsable qualité","labelEn":"Quality manager","departmentCode":"QUALITY_COMPLIANCE","level":25,"permissions":["pharmacy.batches.view","pharmacy.alerts.manage","pharmacy.quality.manage","pharmacy.documents.view","pharmacy.reports.view"]}
  ]'::jsonb) AS x("positionCode" TEXT,"labelFr" TEXT,"labelEn" TEXT,"departmentCode" TEXT,"level" INTEGER,"permissions" JSONB)
),
saved_positions AS (
  INSERT INTO "SectorTemplatePosition" ("id","templateId","positionCode","labelFr","labelEn","departmentCode","hierarchyLevel","defaultPermissionsJson","isKeyPosition","sortOrder")
  SELECT CONCAT('stp-',p."templateId",'-',LOWER(REPLACE(x."positionCode",'_','-'))),p."templateId",x."positionCode",x."labelFr",x."labelEn",x."departmentCode",x."level",x."permissions",true,x."level"
  FROM pharmacy_template p CROSS JOIN positions x
  ON CONFLICT ("templateId","positionCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","departmentCode"=EXCLUDED."departmentCode","hierarchyLevel"=EXCLUDED."hierarchyLevel","defaultPermissionsJson"=EXCLUDED."defaultPermissionsJson","isKeyPosition"=true,"updatedAt"=CURRENT_TIMESTAMP
  RETURNING *
)
INSERT INTO "EnterprisePosition" ("id","organizationId","sectorId","positionCode","labelFr","labelEn","departmentId","hierarchyLevel","permissionsJson","isActive","isKeyPosition","sourceTemplateId")
SELECT CONCAT('ep-',o."id",'-',LOWER(REPLACE(p."positionCode",'_','-'))),o."id",o."sectorId",p."positionCode",p."labelFr",p."labelEn",d."id",p."hierarchyLevel",p."defaultPermissionsJson",true,true,p."id"
FROM "Organization" o CROSS JOIN saved_positions p
LEFT JOIN "EnterpriseDepartment" d ON d."organizationId"=o."id" AND d."departmentCode"=p."departmentCode"
WHERE o."sectorCode"='PHARMACY' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId","positionCode") DO UPDATE SET "labelFr"=EXCLUDED."labelFr","labelEn"=EXCLUDED."labelEn","departmentId"=EXCLUDED."departmentId","hierarchyLevel"=EXCLUDED."hierarchyLevel","permissionsJson"=EXCLUDED."permissionsJson","isActive"=true,"isKeyPosition"=true,"sourceTemplateId"=EXCLUDED."sourceTemplateId","updatedAt"=CURRENT_TIMESTAMP;

UPDATE "EnterpriseModule" em
SET "isEnabled"=false, "updatedAt"=CURRENT_TIMESTAMP
FROM "Organization" o
WHERE o."id"=em."organizationId" AND o."sectorCode"='PHARMACY' AND em."isCore"=false
  AND em."moduleCode" NOT IN ('MEDICINES_PRODUCTS','BATCH_EXPIRY','STOCK_INVENTORY','STOCK_RECEIPTS','SALES_DISPENSATION','PRESCRIPTIONS','SUPPLIERS_ORDERS','CASH_INVOICES_PAYMENTS','RETURNS_ADJUSTMENTS_LOSSES','ALERTS_EXPIRY_LOW_STOCK','QUALITY_PHARMACOVIGILANCE','PHARMACY_DOCUMENTS','PHARMACY_REPORTS','PHARMACY_SETTINGS');

UPDATE "EnterpriseActivityBlock" eab
SET "isEnabled"=false, "updatedAt"=CURRENT_TIMESTAMP
FROM "Organization" o
WHERE o."id"=eab."organizationId" AND o."sectorCode"='PHARMACY'
  AND eab."blockCode" NOT IN ('MY_PHARMACY_ACTIONS','REPORT_LOW_STOCK','REQUEST_REPLENISHMENT','DECLARE_NEAR_EXPIRY','REQUEST_PURCHASE_VALIDATION','REQUEST_STOCK_ADJUSTMENT_VALIDATION','SUBMIT_CASH_REPORT','REPORT_SALE_ANOMALY','REPORT_QUALITY_INCIDENT','REQUEST_PHARMACIST_OPINION','SUBMIT_INVENTORY');
