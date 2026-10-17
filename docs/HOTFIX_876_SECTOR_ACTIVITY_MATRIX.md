# Hotfix #876 — Matrice exhaustive des 94 actions sectorielles DTSC

## Source de vérité et limites

Source historique : `prisma/migrations/20260527143000_enterprise_sector_templates/migration.sql` (16 actions Santé / Pharmacie / Autres et 78 actions des autres secteurs). Les cinq actions collaboratives communes issues de `generic_blocks` restent complémentaires. **Les codes `targetModuleCode` ci-dessous sont historiques** : ce document n'affirme pas qu'ils sont des workspaces ERP actifs, ni que leur présence autorise une navigation.

Les actions et leurs formulaires sont explicités dans `lib/enterprise/sector-activity-capabilities.ts`. Le résolveur `resolveEnterpriseActivityAction()` bloque tout type non reconnu au frontend et dans l'API. Aucune migration d'une ancienne définition, écriture de stock/finance/paie, mouvement de caisse, création de ticket, saisie des notes, livrable ou pièce jointe n'est effectuée par la demande collaborative.

**REQUEST** : un formulaire de demande ciblé avec validation de champs, réponse `201` seulement après création `EnterpriseActivityRequest` et `EnterpriseRequest` transactionnels. Le destinataire traite ensuite la demande ; **aucune opération sectorielle n'est automatiquement exécutée**. Les références saisies pour les secteurs non intégrés sont explicitement **communiquées par l'utilisateur, et non des clés étrangères vérifiées**.

**UNAVAILABLE** : action visible comme non disponible, bouton de soumission désactivé, explication FR/EN ; le POST est refusé `422 ENTERPRISE_ACTIVITY_ACTION_NOT_READY` avant toute transaction. Pour devenir exécutable, elle devra intégrer le workspace canonique, le RBAC, l'entitlement, les références et le vrai workflow métier.

**DEDICATED** : parcours Pharmacie existant via `/pharmacy/activities`, pas le formulaire générique ; **HEALTH_REQUEST** : action Santé existante dans son domaine métier / formulaires cliniques dédiés, non certifiée par la nouvelle matrice non clinique ; **HOSPITALITY_REQUEST** : contrats Hôtellerie/Gaming de #873 conservés, avec l'exception cuisine bloquée en Gaming Lounge.

## Synthèse

- 94 actions historiques au total : 60 REQUEST, 17 UNAVAILABLE, 5 HEALTH_REQUEST, 6 HOSPITALITY_REQUEST, 6 DEDICATED.
- 74 actions hors Hôtellerie/Santé/Pharmacie explicitement inventoriées (72 actions dans 12 secteurs + 2 « Autres ») ; **60 REQUEST, 14 UNAVAILABLE**.
- Les cinq actions génériques demeurent des demandes sans mutation sectorielle.
- Pas de faux upload : les actions nécessitant des fichiers privés restent indisponibles jusqu'au branchement sur Documents et les contrôles d'accès.
- Pas de second ERP ou nouveau registre de modules ; les codes cibles ne sont pas utilisés pour dispatcher des requêtes dynamiques.

## Matrice

| Secteur canonique | Action historique | Module cible historique (indicatif) | Politique | Champs/objet de la demande |
|---|---|---|---|---|
| AGRI_FOOD | REPORT_INPUT_NEED | INPUTS | REQUEST | productRef, quantity, deadline, reason |
| AGRI_FOOD | SUBMIT_FIELD_REPORT | FARMS_PLOTS | REQUEST | location, period, observations, action |
| AGRI_FOOD | DECLARE_HARVEST | HARVESTS | UNAVAILABLE | — |
| AGRI_FOOD | REPORT_QUALITY_PROBLEM | QUALITY_FOOD_SAFETY | REQUEST | batchRef, quality, location, action |
| AGRI_FOOD | REQUEST_PRODUCT_TRANSPORT | DISTRIBUTION | REQUEST | productRef, quantity, route, deadline |
| AGRI_FOOD | UPDATE_AGRI_STOCK | STOCKS | UNAVAILABLE | — |
| COMMERCE_RETAIL | REPORT_STOCKOUT | STOCK | REQUEST | productRef, reportedQty, urgency, action |
| COMMERCE_RETAIL | REQUEST_REPLENISHMENT | PURCHASE_ORDERS | REQUEST | productRef, quantity, deadline, reason |
| COMMERCE_RETAIL | SUBMIT_SALES_REPORT | SALES_REPORTS | REQUEST | period, reportedAmount, currency, observations |
| COMMERCE_RETAIL | SUBMIT_CASH_REPORT | CASH_REGISTER | REQUEST | period, reportedAmount, currency, observations |
| COMMERCE_RETAIL | REPORT_CUSTOMER_ANOMALY | CUSTOMERS | REQUEST | customerRef, eventDate, incident, action |
| COMMERCE_RETAIL | REQUEST_DISCOUNT_VALIDATION | PROMOTIONS | REQUEST | salesRef, discount, reason, action |
| CONSTRUCTION_REAL_ESTATE | SUBMIT_SITE_REPORT | SITE_PROGRESS | REQUEST | projectRef, location, period, observations |
| CONSTRUCTION_REAL_ESTATE | REPORT_SAFETY_INCIDENT | SAFETY_INCIDENTS | REQUEST | location, eventDate, severity, incident, action |
| CONSTRUCTION_REAL_ESTATE | REQUEST_MATERIALS | MATERIALS | REQUEST | projectRef, productRef, quantity, deadline, reason |
| CONSTRUCTION_REAL_ESTATE | VALIDATE_PROGRESS | SITE_PROGRESS | UNAVAILABLE | — |
| CONSTRUCTION_REAL_ESTATE | SUBMIT_SITE_PHOTO | TECHNICAL_DOCUMENTS | UNAVAILABLE | — |
| CONSTRUCTION_REAL_ESTATE | REPORT_SUBCONTRACTOR_DELAY | SUBCONTRACTORS | REQUEST | projectRef, provider, deadline, incident, action |
| EDUCATION | REPORT_ABSENCE | ATTENDANCE | REQUEST | studentRef, classRef, eventDate, reason |
| EDUCATION | SUBMIT_CLASS_REPORT | ACADEMIC_REPORTS | REQUEST | classRef, period, observations |
| EDUCATION | ENTER_GRADES | EXAMS_GRADES | UNAVAILABLE | — |
| EDUCATION | REQUEST_PARENT_MEETING | PARENTS_GUARDIANS | REQUEST | studentRef, meetingDate, proposedSlot, reason |
| EDUCATION | REPORT_DISCIPLINE_INCIDENT | DISCIPLINE | REQUEST | studentRef, eventDate, severity, incident, action |
| EDUCATION | REQUEST_ACADEMIC_VALIDATION | COURSES | REQUEST | classRef, reference, reason, action |
| FINANCE_MICROFINANCE | SUBMIT_CREDIT_FILE | CREDIT_FILES | UNAVAILABLE | — |
| FINANCE_MICROFINANCE | REQUEST_CREDIT_VALIDATION | CREDIT_FILES | REQUEST | caseRef, amount, currency, reason |
| FINANCE_MICROFINANCE | REPORT_LATE_REPAYMENT | REPAYMENTS | REQUEST | caseRef, eventDate, reportedAmount, currency, observations |
| FINANCE_MICROFINANCE | SUBMIT_CASH_REPORT | TRANSACTIONS | REQUEST | period, reportedAmount, currency, observations |
| FINANCE_MICROFINANCE | REQUEST_RISK_REVIEW | RISK_REVIEW | REQUEST | caseRef, reason, action |
| FINANCE_MICROFINANCE | REPORT_KYC_ANOMALY | KYC_COMPLIANCE | REQUEST | caseRef, severity, incident, action |
| HEALTH_CARE | MY_ASSIGNED_PATIENTS | PATIENTS | UNAVAILABLE | — |
| HEALTH_CARE | MY_APPOINTMENTS | APPOINTMENTS | UNAVAILABLE | — |
| HEALTH_CARE | REPORT_PATIENT_INCIDENT | QUALITY_INCIDENTS | HEALTH_REQUEST | Clinical request fields (existing contract) |
| HEALTH_CARE | REQUEST_COVERAGE | INSURANCE_COVERAGE | HEALTH_REQUEST | Clinical request fields (existing contract) |
| HEALTH_CARE | SUBMIT_MEDICAL_REPORT | MEDICAL_RECORDS | HEALTH_REQUEST | Clinical request fields (existing contract) |
| HEALTH_CARE | REQUEST_MEDICAL_OPINION | CARE_TEAM | HEALTH_REQUEST | Clinical request fields (existing contract) |
| HEALTH_CARE | REPORT_CONFIDENTIALITY_ISSUE | MEDICAL_CONFIDENTIALITY | UNAVAILABLE | — |
| HEALTH_CARE | REQUEST_ADMIN_VALIDATION | INTERNAL_REQUESTS | HEALTH_REQUEST | Clinical request fields (existing contract) |
| HOSPITALITY_EVENTS | CONFIRM_BOOKING | BOOKINGS | HOSPITALITY_REQUEST | Existing Hospitality / Gaming contract |
| HOSPITALITY_EVENTS | REPORT_CUSTOMER_INCIDENT | SERVICE_INCIDENTS | HOSPITALITY_REQUEST | Existing Hospitality / Gaming contract |
| HOSPITALITY_EVENTS | REQUEST_KITCHEN_STOCK | KITCHEN_STOCK | HOSPITALITY_REQUEST | Existing Hospitality / Gaming contract |
| HOSPITALITY_EVENTS | SUBMIT_CASH_REPORT | CASHIER | HOSPITALITY_REQUEST | Existing Hospitality / Gaming contract |
| HOSPITALITY_EVENTS | REQUEST_EXTRA_STAFF | STAFF_SHIFTS | HOSPITALITY_REQUEST | Existing Hospitality / Gaming contract |
| HOSPITALITY_EVENTS | REPORT_ROOM_SERVICE_PROBLEM | ROOMS_TABLES_SERVICES | HOSPITALITY_REQUEST | Existing Hospitality / Gaming contract |
| INSURANCE | SUBMIT_CLAIM_FILE | CLAIMS | UNAVAILABLE | — |
| INSURANCE | REQUEST_COVERAGE_VALIDATION | PREAUTHORIZATIONS | REQUEST | coverageRef, provider, reason, action |
| INSURANCE | REPORT_INCOMPLETE_FILE | CLAIMS | REQUEST | claimRef, observations, action |
| INSURANCE | REQUEST_CLAIM_AUDIT | CLAIM_AUDIT | REQUEST | claimRef, reason, action |
| INSURANCE | ANSWER_COMPLIANCE_REQUEST | COMPLIANCE | REQUEST | caseRef, reference, observations |
| INSURANCE | SUBMIT_PROVIDER_REPORT | PROVIDERS | REQUEST | provider, period, observations |
| MANUFACTURING | DECLARE_PRODUCTION | PRODUCTION_ORDERS | UNAVAILABLE | — |
| MANUFACTURING | REPORT_MACHINE_FAILURE | MACHINE_MAINTENANCE | REQUEST | machineRef, eventDate, severity, incident, action |
| MANUFACTURING | REPORT_QUALITY_DEFECT | QUALITY_CONTROL | REQUEST | batchRef, productRef, quality, action |
| MANUFACTURING | REQUEST_RAW_MATERIAL | RAW_MATERIALS | REQUEST | productRef, quantity, deadline, reason |
| MANUFACTURING | SUBMIT_WORKSHOP_REPORT | PRODUCTION_REPORTS | REQUEST | team, period, observations, action |
| MANUFACTURING | REQUEST_MAINTENANCE | MACHINE_MAINTENANCE | REQUEST | machineRef, severity, incident, deadline |
| NGO_ASBL | SUBMIT_FIELD_REPORT | FIELD_ACTIVITIES | REQUEST | projectRef, location, period, observations |
| NGO_ASBL | SUBMIT_SUPPORTING_DOCUMENT | SUPPORTING_DOCUMENTS | UNAVAILABLE | — |
| NGO_ASBL | REPORT_FIELD_INCIDENT | FIELD_INCIDENTS | REQUEST | projectRef, location, eventDate, incident, action |
| NGO_ASBL | REQUEST_ACTIVITY_VALIDATION | FIELD_ACTIVITIES | REQUEST | projectRef, reference, reason, action |
| NGO_ASBL | UPDATE_INDICATOR | INDICATORS_ME | REQUEST | projectRef, indicator, proposedValue, reason |
| NGO_ASBL | REQUEST_PROJECT_DISBURSEMENT | BUDGET_LINES | REQUEST | projectRef, budgetRef, amount, currency, reason |
| OTHER | REQUEST_VALIDATION | INTERNAL_REQUESTS | REQUEST | reference, reason, action |
| OTHER | REPORT_PROBLEM | INTERNAL_REQUESTS | REQUEST | eventDate, severity, incident, action |
| PHARMACY | REPORT_LOW_STOCK | ALERTS_EXPIRY_LOW_STOCK | DEDICATED | — |
| PHARMACY | REQUEST_REPLENISHMENT | PURCHASE_REQUESTS | DEDICATED | — |
| PHARMACY | DECLARE_NEAR_EXPIRY | BATCH_EXPIRY | DEDICATED | — |
| PHARMACY | SUBMIT_CASH_REPORT | SALES_CASHIER | DEDICATED | — |
| PHARMACY | REPORT_SALE_ANOMALY | SALES_CASHIER | DEDICATED | — |
| PHARMACY | REQUEST_PURCHASE_VALIDATION | PURCHASE_REQUESTS | DEDICATED | — |
| PROFESSIONAL_SERVICES | SUBMIT_DELIVERABLE | DELIVERABLES | UNAVAILABLE | — |
| PROFESSIONAL_SERVICES | SEND_MISSION_REPORT | EXPERT_REPORTS | REQUEST | missionRef, period, observations, action |
| PROFESSIONAL_SERVICES | REQUEST_CLIENT_VALIDATION | CLIENTS | REQUEST | customerRef, projectRef, reason, action |
| PROFESSIONAL_SERVICES | REQUEST_CONTRACT_REVIEW | CONTRACTS | REQUEST | contractRef, reason, deadline |
| PROFESSIONAL_SERVICES | DECLARE_TIME_WORKED | TIMESHEETS | UNAVAILABLE | — |
| PROFESSIONAL_SERVICES | REPORT_MISSION_BLOCKER | MISSIONS | REQUEST | missionRef, severity, incident, action |
| PUBLIC_ADMIN | SUBMIT_CASE | FILES_CASES | UNAVAILABLE | — |
| PUBLIC_ADMIN | REQUEST_LETTER_VALIDATION | OFFICIAL_LETTERS | REQUEST | reference, reason, deadline |
| PUBLIC_ADMIN | REPORT_INCOMPLETE_CASE | FILES_CASES | REQUEST | caseRef, observations, action |
| PUBLIC_ADMIN | SUBMIT_SERVICE_REPORT | PUBLIC_REPORTS | REQUEST | team, period, observations, action |
| PUBLIC_ADMIN | REQUEST_ARCHIVING | ARCHIVES | REQUEST | caseRef, reason, action |
| PUBLIC_ADMIN | ESCALATE_DECISION | DECISIONS | REQUEST | decisionRef, severity, reason, action |
| TECH_DIGITAL | REPORT_BUG | BUGS | REQUEST | projectRef, environment, reproduce, severity, action |
| TECH_DIGITAL | REQUEST_TECH_ESTIMATE | DIGITAL_PROJECTS | REQUEST | projectRef, reason, deadline, action |
| TECH_DIGITAL | SUBMIT_TICKET | TICKETS | UNAVAILABLE | — |
| TECH_DIGITAL | REQUEST_CODE_REVIEW | REPOSITORIES | REQUEST | projectRef, reference, reason, deadline |
| TECH_DIGITAL | REPORT_PRODUCTION_INCIDENT | DEPLOYMENTS | REQUEST | environment, eventDate, severity, incident, action |
| TECH_DIGITAL | SUBMIT_RELEASE_NOTE | RELEASE_NOTES | REQUEST | projectRef, reference, observations, action |
| TRANSPORT_LOGISTICS | SUBMIT_MISSION_REPORT | TRANSPORT_MISSIONS | REQUEST | missionRef, vehicleRef, period, observations |
| TRANSPORT_LOGISTICS | REPORT_BREAKDOWN | MAINTENANCE | REQUEST | vehicleRef, location, eventDate, severity, incident |
| TRANSPORT_LOGISTICS | DECLARE_DELIVERY_INCIDENT | INCIDENTS | REQUEST | deliveryRef, route, eventDate, incident, action |
| TRANSPORT_LOGISTICS | REQUEST_FUEL | FUEL | REQUEST | vehicleRef, route, quantity, reason |
| TRANSPORT_LOGISTICS | REQUEST_MAINTENANCE | MAINTENANCE | REQUEST | vehicleRef, severity, incident, deadline |
| TRANSPORT_LOGISTICS | CONFIRM_DELIVERY | DELIVERIES | UNAVAILABLE | — |

## Sécurité et critères de validation

1. L'action doit être proposée seulement au collaborateur ayant la permission `submit` ; une action `UNAVAILABLE` ne peut pas être envoyée même en appelant directement l'API.
2. Les valeurs obligatoires et les listes contrôlées sont validées côté serveur, les dates correspondent à des jours réels, les nombres sont finis et positifs lorsque nécessaire.
3. Le formulaire conserve les valeurs lors d'un échec, affiche un toast global et ne simule jamais un effet sur la comptabilité, les notes, le stock ou les documents.
4. Les identifiants d'objets Gaming restent revalidés sous le bon `organizationId` et `canRead` ; les 74 nouveaux contrats n'introduisent aucune référence technique inventée.
5. Test `pnpm qa:hotfix-876-sector-activities` (inventaire historique 94, 74 contrats explicites, mode backend/frontend, régression Gaming et permissions) + Quality Gates / OWNER_E2E requis.
6. E2E au minimum : Commerce Retail (rupture, caisse informative, remise), Éducation (absence, notes bloquées), Construction (photo bloquée), Transport (incident et confirmation bloquée), Assurance (dossier sinistre bloqué), Autres (demande), Gaming (réservation conservée), Santé/Pharmacie (parcours existants conservés), cross-tenant, mobile 320–1024, clavier/iOS, FR/EN et light/dark.

## Dette et périmètre futur

Les 14 opérations `UNAVAILABLE` sont intentionnellement bloquées plutôt que de fabriquer un objet métier. Elles seront ouvertes uniquement après API et workflow canonique, pièces jointes privées si nécessaires, QA métier et E2E. Les champs de référence non liés restent de simples indications textuelles : si une action exige l'existence d'un objet ERP, son mode doit devenir `UNAVAILABLE` tant que la validation serveur n'est pas ajoutée. Ne jamais modifier la migration historique pour masquer cette dette.

## Rollback

Aucune migration de base, aucune suppression de données. Rollback du résolveur et de la UI par une PR traçable, après contrôle des contrats et des anciennes demandes. Production exclusivement par merge `main` après CI + OWNER_E2E.
