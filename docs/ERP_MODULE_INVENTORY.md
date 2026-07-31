# Inventaire canonique des modules ERP DTSC

Version initiale : consolidation ERP, itération 1/5
Source de vérité exécutable : `lib/enterprise/module-registry-data.json`
Contrôles reproductibles : `pnpm audit:enterprise-modules` et `pnpm qa:enterprise-module-registry`

## Principes de lecture

- **ACTIVE** : route, workspace, service métier, API, permissions, entitlement et QA existants.
- **BETA** : implémentation ouvrable et contrôlée, mais encore appuyée partiellement sur une source legacy explicitement documentée.
- **PLANNED** : code historique ou futur sans implémentation complète; jamais navigable ni provisionné automatiquement.
- **HIDDEN** : code connu conservé pour compatibilité ou audit, volontairement non ouvrable.
- `EnterpriseModule` reste la configuration du tenant. Le registre TypeScript décide si un code peut réellement exister dans le produit.

## Socle ERP commun actif

| Code | Libellé FR / EN | Domaine | Statut | Secteurs | Source métier | Route / workspace | APIs principales | Permissions | Entitlement | Dépendances | Legacy | Navigation / QA | Décision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `TASKS_OPERATIONS` | Tâches & opérations / Tasks & operations | Opérations | ACTIVE | Tous | `EnterpriseTask` et services Core v2 | `/enterprise-modules/TASKS_OPERATIONS` / `EnterpriseTasksWorkspace` | `/api/enterprise/[organizationId]/core-v2/tasks/*` | `enterprise.tasks.*` | BUSINESS actif | — | `EnterpriseCoreRecord` conservé hors source dédiée | Opérations 10 / `enterprise-core-v2` | Conserver |
| `INTERNAL_REQUESTS` | Demandes internes / Internal requests | Opérations | ACTIVE | Tous | `EnterpriseRequest` | `/enterprise-modules/INTERNAL_REQUESTS` / `EnterpriseRequestsWorkspace` | `/api/enterprise/[organizationId]/core-v2/requests/*` | `enterprise.requests.*` | STARTER | — | Anciennes demandes Core lisibles selon compatibilité | Opérations 20 / `enterprise-core-v2` | Conserver |
| `VALIDATIONS` | Validations / Approvals | Opérations | ACTIVE | Tous | `EnterpriseApproval` | `/enterprise-modules/VALIDATIONS` / `EnterpriseApprovalsWorkspace` | `/api/enterprise/[organizationId]/core-v2/approvals/*` | `enterprise.approvals.*` | BUSINESS actif | — | `EnterpriseCoreRecord` non supprimé | Opérations 30 / `enterprise-core-v2` | Conserver |
| `MEETINGS` | Réunions / Meetings | Opérations | ACTIVE | Tous | `EnterpriseMeeting` | `/enterprise-modules/MEETINGS` / `EnterpriseMeetingsWorkspace` | `/api/enterprise/[organizationId]/core-v2/meetings/*` | `enterprise.meetings.*` | BUSINESS actif | — | Calendrier interne relié, non remplacé | Opérations 40 / `enterprise-core-v2` | Conserver |
| `WORKFLOWS` | Workflows / Workflows | Opérations | ACTIVE | Tous | Workflow Engine v2 | `/enterprise-modules/WORKFLOWS` / `EnterpriseWorkflowsWorkspace` | `/api/enterprise/[organizationId]/workflow-engine/*` | `enterprise.workflows.*` | BUSINESS actif | — | `EnterpriseWorkflow` legacy conservé | Opérations 50 / `enterprise-workflows` | Conserver |
| `SUPPLIERS_PURCHASES` | Fournisseurs & achats / Suppliers & purchases | Achats & inventaire | ACTIVE | Tous | `EnterpriseSupplier`, `EnterprisePurchase*` | `/enterprise-modules/SUPPLIERS_PURCHASES` / workspaces fournisseurs et achats dédiés | `/api/enterprise/[organizationId]/suppliers/*`, `/purchases/*` | `enterprise.suppliers.*`, `enterprise.purchases.*` | BUSINESS actif | — | Anciens records non supprimés | Achats & ressources 10 / `enterprise-documents-procurement` | Conserver |
| `DOCUMENTS` | Documents / Documents | Documents | ACTIVE | Tous | `EnterpriseDocument` | `/enterprise-modules/DOCUMENTS` / `EnterpriseDocumentsWorkspace` | `/api/enterprise/[organizationId]/documents/*` | `enterprise.documents.*` | STARTER | — | Documents sectoriels restent séparés | Achats & ressources 20 / `enterprise-documents-procurement` | Conserver |
| `FINANCE_BUDGETS` | Finances & budgets / Finance & budgets | Finance | ACTIVE | Tous | `EnterpriseBudget`, `EnterpriseExpense` | `/enterprise-modules/FINANCE_BUDGETS` / `EnterpriseFinanceWorkspace` | `/api/enterprise/[organizationId]/finance/*` | `enterprise.finance.*`, `enterprise.budgets.*` | BUSINESS actif | — | Aucune convergence Pharmacy/Health dans cette itération | Finances 10 / `enterprise-finance-reports` | Conserver |
| `REPORTS` | Rapports / Reports | Analytics | ACTIVE | Tous | `EnterpriseReport` et agrégats dédiés | `/enterprise-modules/REPORTS` / `EnterpriseReportsWorkspace` | `/api/enterprise/[organizationId]/reports/*` | `enterprise.reports.*` | STARTER | — | Rapports sectoriels restent distincts | Finances 20 / `enterprise-finance-reports` | Conserver |
| `AI_ASSISTANT` | IA Assistant Entreprise / Enterprise AI assistant | Intelligence | ACTIVE | Tous | RAG/CAG et conversations IA entreprise | `/enterprise-modules/AI_ASSISTANT` / `EnterpriseAiWorkspaceV2` | `/api/enterprise/[organizationId]/ai/*` | `enterprise.ai.*` | BUSINESS actif | — | Aucun alias | Intelligence 10 / `assistant-ux` | Conserver comme service transversal |

## Modules Health actifs

Tous les modules ci-dessous sont limités à `HEALTH_CARE`, au plan ENTERPRISE actif et aux permissions de poste correspondantes. Les données restent isolées par `organizationId`.

| Code | Libellé | Statut | Source / workspace réellement monté | Permissions | Dépendances | Décision |
|---|---|---|---|---|---|---|
| `PATIENTS` | Patients | ACTIVE | `HealthPatient` / `HealthPatientsWorkspace` | `health.patients.*` | — | Conserver |
| `APPOINTMENTS` | Rendez-vous | ACTIVE | `HealthAppointment` / `HealthAppointmentsWorkspace` | `health.appointments.*` | `PATIENTS` | Conserver |
| `CONSULTATIONS` | Consultations | ACTIVE | `HealthConsultation` / `HealthConsultationsWorkspace` | `health.consultations.*` | `PATIENTS` | Conserver |
| `MEDICAL_RECORDS` | Dossiers médicaux | ACTIVE | dossiers médicaux dédiés / `HealthMedicalRecordsWorkspace` | `health.medical_records.*` | `PATIENTS` | Conserver avec confidentialité renforcée |
| `CARE_TEAM` | Équipe médicale | ACTIVE | memberships/postes santé / `HealthStaffWorkspace` | `health.staff.*`, administration membres | — | Conserver |
| `LABORATORY` | Laboratoire | ACTIVE | demandes/résultats laboratoire / `HealthLaboratoryWorkspace` | `health.lab.*` | `PATIENTS` | Conserver |
| `INTERNAL_PHARMACY` | Pharmacie interne | ACTIVE | produits/mouvements Health / `HealthPharmacyWorkspace` | `health.pharmacy.*` | — | Conserver distinct de Pharmacy sectoriel |
| `MEDICAL_BILLING` | Facturation médicale | ACTIVE | facturation Health / `HealthMedicalBillingWorkspace` | `health.billing.*` | `PATIENTS` | Conserver sans migration finance commune |
| `INSURANCE_COVERAGE` | Assurances & prises en charge | ACTIVE | prises en charge / `HealthInsuranceWorkspace` | `health.insurance.*` | `PATIENTS`, `MEDICAL_BILLING` | Conserver |
| `QUALITY_INCIDENTS` | Incidents qualité | ACTIVE | incidents qualité / `HealthQualityWorkspace` | `health.incidents.*` | — | Conserver |
| `MEDICAL_DOCUMENTS` | Documents médicaux | ACTIVE | documents médicaux / `HealthDocumentsWorkspace` | `health.documents.*` | `PATIENTS` | Conserver avec confidentialité |

### Health beta

| Code | Statut | Source actuelle | Limite et décision |
|---|---|---|---|
| `MEDICAL_CONFIDENTIALITY` | BETA | Paramétrage et records sectoriels contrôlés | Lecture directe et administration existante; aucune nouvelle source métier créée ici |
| `HEALTH_SETTINGS` | BETA | Paramètres Health persistés dans l’organisation | Maintenir beta jusqu’au contrat de paramètres dédié |
| `HEALTH_REPORTS` | BETA | Agrégats Health existants | Aucune projection financière nouvelle; convergence différée |

## Modules Pharmacy actifs

Tous les modules ci-dessous sont limités à `PHARMACY`, au plan ENTERPRISE actif et aux permissions de poste correspondantes.

| Code canonique | Libellé | Source / workspace | Permissions | Dépendances | Alias legacy | Décision |
|---|---|---|---|---|---|---|
| `MEDICINES_PRODUCTS` | Produits & médicaments | `PharmacyProduct` / `PharmacyProductsWorkspace` | `pharmacy.products.*` | — | — | Conserver |
| `BATCH_EXPIRY` | Lots & péremptions | `PharmacyBatch` / `PharmacyBatchesWorkspace` | `pharmacy.batches.*` | Produits | — | Conserver |
| `STOCK_INVENTORY` | Stock & inventaire | mouvements/inventaires / `PharmacyStockWorkspace` | `pharmacy.stock.*` | Produits | — | Conserver |
| `STOCK_RECEIPTS` | Entrées stock / réceptions | réceptions / `PharmacyReceiptsWorkspace` | `pharmacy.receipts.*` | Produits, lots | — | Conserver |
| `SALES_DISPENSATION` | Sorties, ventes & dispensation | ventes/dispensation / `PharmacySalesWorkspace` | `pharmacy.sales.*` | Produits, lots | `SALES_CASHIER` | Canonique; alias non dupliqué au menu |
| `PRESCRIPTIONS` | Ordonnances / prescriptions | prescriptions / `PharmacyPrescriptionsWorkspace` | `pharmacy.prescriptions.*` | — | — | Conserver |
| `SUPPLIERS_ORDERS` | Fournisseurs & commandes | achats pharmacie / `PharmacyPurchasesWorkspace` | `pharmacy.suppliers.*`, `pharmacy.purchase_orders.*` | Produits | `PURCHASE_REQUESTS` | Canonique; alias non dupliqué au menu |
| `CASH_INVOICES_PAYMENTS` | Caisse, factures & paiements | caisse/factures/paiements / `PharmacyCashWorkspace` | `pharmacy.cash.*` | Ventes | — | Conserver |
| `RETURNS_ADJUSTMENTS_LOSSES` | Retours, ajustements & pertes | ajustements / `PharmacyReturnLossWorkspace` | `pharmacy.adjustments.*` | Produits, lots | — | Conserver |
| `ALERTS_EXPIRY_LOW_STOCK` | Alertes stock/péremption/rappel | alertes / `PharmacyAlertsWorkspace` | `pharmacy.alerts.*` | Produits, lots | — | Conserver |
| `QUALITY_PHARMACOVIGILANCE` | Qualité & pharmacovigilance | incidents / `PharmacyQualityWorkspace` | `pharmacy.quality.*` | — | — | Conserver |
| `PHARMACY_DOCUMENTS` | Documents & conformité | documents / `PharmacyDocumentsWorkspace` | `pharmacy.documents.*` | — | — | Conserver |
| `PHARMACY_REPORTS` | Rapports pharmacie | tables métier Pharmacy / `PharmacyReportsWorkspace` | `pharmacy.reports.*` | — | — | Conserver |
| `PHARMACY_SETTINGS` | Paramètres pharmacie | paramètres FEFO/stock / `PharmacySettingsWorkspace` | `pharmacy.settings.*` | — | — | Conserver |

## Administration consolidée

Ces codes restent connus uniquement pour préserver les anciens liens. Ils ne sont plus des domaines ERP autonomes.

| Ancien code | Redirection canonique | Politique |
|---|---|---|
| `ADMIN_DASHBOARD` | `/enterprise-admin?section=overview` | Administration explicite uniquement |
| `COLLABORATORS_POSITIONS` | `/enterprise-admin?section=members` | Administration explicite uniquement |
| `DEPARTMENTS` | `/enterprise-admin?section=departments` | Administration explicite uniquement |
| `PERMISSIONS` | `/enterprise-admin?section=permissions` | Administration explicite uniquement |
| `SETTINGS` | `/enterprise-admin?section=settings` | Administration explicite uniquement |
| `AUDIT_LOGS` | `/enterprise-admin?section=audit` | Administration explicite uniquement |

## Codes masqués et secteurs futurs

- `INTERNAL_CALENDAR` est **HIDDEN** : le calendrier demeure un service transversal et une relation opérationnelle, pas un module ERP générique autonome.
- Les catalogues historiques `INSURANCE`, `EDUCATION`, `COMMERCE_RETAIL`, `PROFESSIONAL_SERVICES` et `NGO_ASBL` contiennent des codes **PLANNED** ou **HIDDEN**.
- Exemples classés : `CLIENTS_POLICYHOLDERS`, `POLICIES`, `CLAIMS`, `STUDENTS`, `TEACHERS`, `CLASSES`, `PRODUCTS`, `SALES`, `CASH_REGISTER`, `CLIENTS`, `MISSIONS`, `CONTRACTS`, `PROGRAMS_PROJECTS`, `BENEFICIARIES`, `FIELD_ACTIVITIES`.
- Ces codes peuvent rester dans les migrations immuables ou l’historique des templates, mais ils sont désactivés lors d’une nouvelle application de template et ne sont ni navigables ni ouvrables.
- Tout autre code détecté par `audit:enterprise-modules` est classé `HISTORICAL_UNKNOWN` s’il existe uniquement dans une migration immuable, ou `UNKNOWN` s’il reste référencé dans du code actif. Un code `UNKNOWN` actif fait échouer l’audit.

## Services transversaux hors taxonomie ERP métier

Les services suivants ne sont pas supprimés et ne doivent pas être confondus avec les domaines ERP : Chatbot, Mes collaborateurs, Notifications, Annonces, Support, Abonnement, Profil et Paramètres personnels. `AI_ASSISTANT` reste enregistré parce qu’il possède un workspace et un entitlement entreprise propres, mais il est classé dans le domaine **Intelligence**.
