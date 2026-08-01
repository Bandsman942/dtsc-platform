# Inventaire canonique des modules ERP DTSC

Source exécutable : `lib/enterprise/module-registry.ts` et ses fichiers JSON versionnés. Contrôles : `pnpm audit:enterprise-modules`, `pnpm qa:enterprise-module-registry` et `pnpm qa:erp-final-cutover`.

## Statuts

- `ACTIVE` : modèle/service, route, workspace, permission, entitlement et QA réels.
- `BETA` : implémentation réelle encore sous observation, jamais simple CRUD générique.
- `PLANNED` : futur, non navigable.
- `HIDDEN` : connu pour compatibilité/audit, non ouvrable.
- `DEPRECATED` : visible uniquement pendant une transition documentée.
- `RETIRED` : retiré du produit actif.

## Socle commun

| Groupe | Modules canoniques actifs |
|---|---|
| Opérations | `TASKS_OPERATIONS`, `INTERNAL_REQUESTS`, `VALIDATIONS`, `MEETINGS`, `WORKFLOWS` |
| Commercial | tiers, CRM, devis, contrats, commandes, livraisons et ventes dédiées |
| Achats & ressources | `SUPPLIERS_PURCHASES`, catalogue, sites, entrepôts, stock commun, `DOCUMENTS` |
| RH client | collaborateurs, absences, timesheets et paie opérationnelle dédiés |
| Projets & actifs | projets, livrables, actifs et maintenances dédiés |
| Intelligence | `AI_ASSISTANT` |
| Analytics | `REPORTS` et rapports dédiés |

## Finance commune

`FINANCE_OVERVIEW`, `FINANCE_RECEIVABLES`, `FINANCE_PAYABLES`, `FINANCE_PAYMENTS`, `FINANCE_TREASURY`, `FINANCE_CASH`, `FINANCE_BANK`, `FINANCE_RECONCILIATION`, `FINANCE_ACCOUNTING`, `FINANCE_TAX`, `FINANCE_CLOSE`, `FINANCE_STATEMENTS`, `FINANCE_ASSETS` et `FINANCE_INVENTORY` sont soumis au registre, au membership, au plan, aux dépendances et aux permissions côté serveur.

## Health

Modules dédiés actifs : `PATIENTS`, `APPOINTMENTS`, `CONSULTATIONS`, `MEDICAL_RECORDS`, `CARE_TEAM`, `LABORATORY`, `INTERNAL_PHARMACY`, `MEDICAL_BILLING`, `INSURANCE_COVERAGE`, `QUALITY_INCIDENTS`, `MEDICAL_DOCUMENTS`.

Décisions finales :

| Code | Statut final | Motif |
|---|---|---|
| `MEDICAL_CONFIDENTIALITY` | `HIDDEN` | aucun workspace métier dédié indépendant ; confidentialité appliquée dans les modules réels |
| `HEALTH_SETTINGS` | `HIDDEN` | paramètres gérés dans l’administration sans CRUD sectoriel générique |
| `HEALTH_REPORTS` | `HIDDEN` | rapports canoniques à construire sur les sources dédiées, sans double comptage |

## Pharmacy

Modules dédiés actifs : `MEDICINES_PRODUCTS`, `BATCH_EXPIRY`, `STOCK_INVENTORY`, `STOCK_RECEIPTS`, `SALES_DISPENSATION`, `PRESCRIPTIONS`, `SUPPLIERS_ORDERS`, `CASH_INVOICES_PAYMENTS`, `RETURNS_ADJUSTMENTS_LOSSES`, `ALERTS_EXPIRY_LOW_STOCK`, `QUALITY_PHARMACOVIGILANCE`, `PHARMACY_DOCUMENTS`, `PHARMACY_REPORTS`, `PHARMACY_SETTINGS`.

Pharmacy conserve lots, FEFO, péremption, rappels, qualité, pharmacovigilance et quantités réglementées. Les fournisseurs, achats, factures, paiements, caisses et écritures communs sont reliés par extensions et mappings.

## Administration consolidée

`ADMIN_DASHBOARD`, `COLLABORATORS_POSITIONS`, `DEPARTMENTS`, `PERMISSIONS`, `SETTINGS` et `AUDIT_LOGS` restent uniquement des aliases/redirections vers `/enterprise-admin`. Ils ne sont pas des modules métier autonomes.

## Legacy

- `EnterpriseCoreRecord` : `LEGACY_READ_ONLY`.
- `EnterpriseSectorRecord` : `LEGACY_READ_ONLY`.
- `EnterpriseWorkflow` : `LEGACY_READ_ONLY` ; Workflow Engine v2 actif.
- Modules fantômes : aucun code sans modèle/service, route, workspace, permission, entitlement et QA ne peut rester `ACTIVE`.
- Secteurs futurs : `PLANNED` ou `HIDDEN`, jamais carte ou route active.

## Mise à jour — Itération 2/6 (2026-08-01)

`CRM_CUSTOMERS`, `CATALOG`, `SITES_WAREHOUSES`, `CRM_PIPELINE` et `CONTRACTS` ne dépendent plus du workspace générique comme expérience principale. `HUMAN_RESOURCES` et `SUPPLIERS_PURCHASES` reçoivent uniquement l’intégration d’identité transversale ; leur maturité commerciale globale n’est pas automatiquement promue.
