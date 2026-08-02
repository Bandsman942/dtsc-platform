# Inventaire canonique des modules ERP DTSC

Source exécutable : `lib/enterprise/module-registry.ts` et ses fichiers JSON versionnés. Contrôles : `pnpm audit:enterprise-modules`, `pnpm qa:enterprise-module-registry`, `pnpm qa:erp-final-cutover`, `pnpm qa:erp-iteration-03` et `pnpm qa:erp-iteration-05`.

## Statuts techniques

- `ACTIVE` : modèle/service, route, workspace, permission, entitlement et QA réels.
- `BETA` : implémentation réelle encore sous observation, jamais simple CRUD générique.
- `PLANNED` : futur, non navigable.
- `HIDDEN` : connu pour compatibilité/audit, non ouvrable.
- `DEPRECATED` : visible uniquement pendant une transition documentée.
- `RETIRED` : retiré du produit actif.

Le statut technique ne constitue pas une preuve de commercialisabilité. La maturité commerciale est évaluée séparément.

## Socle commun

| Groupe | Modules canoniques actifs |
|---|---|
| Opérations | `TASKS_OPERATIONS`, `INTERNAL_REQUESTS`, `VALIDATIONS`, `MEETINGS`, `WORKFLOWS` |
| Référentiels commerciaux | `CRM_CUSTOMERS`, `CATALOG`, `SITES_WAREHOUSES`, `CRM_PIPELINE`, `CONTRACTS` |
| Ventes | `SALES_QUOTES_ORDERS` |
| Achats | `SUPPLIERS_PURCHASES` |
| Stock | `INVENTORY_LOGISTICS` |
| RH client | `HUMAN_RESOURCES`, `TIME_ATTENDANCE`, `PAYROLL_OPERATIONS` |
| Projets | `PROJECTS_SERVICES`, `TIME_DELIVERABLES` |
| Actifs | `ASSETS_MAINTENANCE` |
| Intelligence | `AI_ASSISTANT` |
| Analytics | `REPORTS` et rapports dédiés |

## Modules professionnalisés par itération

### Itération 2/6 — Référentiels

`CRM_CUSTOMERS`, `CATALOG`, `SITES_WAREHOUSES`, `CRM_PIPELINE` et `CONTRACTS` utilisent des expériences dédiées. La relation entre une fiche métier et un compte DTSC reste fondée sur le consentement.

### Itération 3/6 — Chaînes opérationnelles

Les codes suivants n’utilisent plus le workspace générique comme expérience principale :

| Code canonique | Expérience dédiée |
|---|---|
| `SALES_QUOTES_ORDERS` | Devis, commandes, reliquats et livraisons |
| `SUPPLIERS_PURCHASES` | Fournisseurs, demandes, commandes et réceptions |
| `INVENTORY_LOGISTICS` | Stock, transferts, inventaires et ajustements |
| `HUMAN_RESOURCES` | Collaborateurs, identité relationnelle, contrats et organigramme |
| `TIME_ATTENDANCE` | Congés et feuilles de temps |
| `PAYROLL_OPERATIONS` | Périodes, calcul, approbation et bulletins |
| `PROJECTS_SERVICES` | Projets, équipe, jalons et risques |
| `TIME_DELIVERABLES` | Temps projet et livrables |
| `ASSETS_MAINTENANCE` | Actifs, affectations, retours, incidents et maintenance |

### Itération 4/6 — Finance opérationnelle

| Code canonique | Expérience dédiée |
|---|---|
| `FINANCE_OVERVIEW` | Configuration et vue d’ensemble Finance |
| `FINANCE_RECEIVABLES` | Factures clients et créances |
| `FINANCE_PAYABLES` | Factures fournisseurs et dettes |
| `FINANCE_PAYMENTS` | Paiements, allocations et confirmations |
| `FINANCE_TREASURY` | Comptes financiers, transferts et trésorerie |
| `FINANCE_CASH` | Sessions de caisse, comptages et validation |
| `FINANCE_BANK` | Relevés bancaires et lignes importées |
| `FINANCE_RECONCILIATION` | Rapprochements et contrôles indépendants |

Ces modules sont évalués séparément selon leurs preuves et les validations réelles du propriétaire.

### Itération 5/6 — Comptabilité et Finance avancée

| Code canonique | Expérience dédiée |
|---|---|
| `FINANCE_ACCOUNTING` | Plan comptable, comptes, exercices, périodes, journaux, écritures, grand livre, balance, règles et anomalies |
| `FINANCE_TAX` | Codes fiscaux, taux à date d’effet et comptes fiscaux |
| `FINANCE_CLOSE` | Checklist, blocages, approbation, fermeture et réouverture contrôlée |
| `FINANCE_STATEMENTS` | Aperçus, états financiers et versions publiées immuables |
| `FINANCE_ASSETS` | Capitalisation, registre d’immobilisations et amortissement linéaire |
| `FINANCE_INVENTORY` | Couches de coût moyen pondéré, valorisation et versions publiées |

Les six modules sont `PROFESSIONAL_READY` et `commercializable: false`. Ils ne deviennent `COMMERCIAL_READY` qu’après validation E2E authentifiée du propriétaire, Production stable et décision commerciale explicite.

## Module global de relation utilisateur

`COMPANY_RELATIONSHIPS` est un module global du compte DTSC, accessible à `/enterprise-links` sans organisation active. Il ne doit pas être confondu avec un module tenant ni recréé comme alias concurrent. Une relation active ne donne aucun accès automatique aux modules Finance.

## Finance commune

`FINANCE_OVERVIEW`, `FINANCE_RECEIVABLES`, `FINANCE_PAYABLES`, `FINANCE_PAYMENTS`, `FINANCE_TREASURY`, `FINANCE_CASH`, `FINANCE_BANK`, `FINANCE_RECONCILIATION`, `FINANCE_ACCOUNTING`, `FINANCE_TAX`, `FINANCE_CLOSE`, `FINANCE_STATEMENTS`, `FINANCE_ASSETS` et `FINANCE_INVENTORY` restent soumis au registre, au membership, au plan, aux dépendances et aux permissions côté serveur.

Les chaînes respectent les frontières suivantes :

```text
commande ≠ facture
facture ≠ écriture comptable
paie calculée ≠ paiement effectué ≠ écriture de paie
actif opérationnel ≠ immobilisation comptable
stock physique ≠ valorisation comptable
rapport dynamique ≠ version publiée
```

Le moteur commun reste l’unique autorité pour la partie double, les clés d’idempotence, les contrepassations et les écritures `POSTED`.

## Health

Modules dédiés actifs : `PATIENTS`, `APPOINTMENTS`, `CONSULTATIONS`, `MEDICAL_RECORDS`, `CARE_TEAM`, `LABORATORY`, `INTERNAL_PHARMACY`, `MEDICAL_BILLING`, `INSURANCE_COVERAGE`, `QUALITY_INCIDENTS`, `MEDICAL_DOCUMENTS`.

Décisions finales :

| Code | Statut final | Motif |
|---|---|---|
| `MEDICAL_CONFIDENTIALITY` | `HIDDEN` | confidentialité appliquée dans les modules réels |
| `HEALTH_SETTINGS` | `HIDDEN` | paramètres gérés dans l’administration |
| `HEALTH_REPORTS` | `HIDDEN` | rapports canoniques à construire sans double comptage |

## Pharmacy

Modules dédiés actifs : `MEDICINES_PRODUCTS`, `BATCH_EXPIRY`, `STOCK_INVENTORY`, `STOCK_RECEIPTS`, `SALES_DISPENSATION`, `PRESCRIPTIONS`, `SUPPLIERS_ORDERS`, `CASH_INVOICES_PAYMENTS`, `RETURNS_ADJUSTMENTS_LOSSES`, `ALERTS_EXPIRY_LOW_STOCK`, `QUALITY_PHARMACOVIGILANCE`, `PHARMACY_DOCUMENTS`, `PHARMACY_REPORTS`, `PHARMACY_SETTINGS`.

Pharmacy conserve lots, FEFO, péremption, rappels, qualité, pharmacovigilance et quantités réglementées. Les fournisseurs, achats, factures, paiements, caisses et écritures communs sont reliés par extensions et mappings.

## Administration consolidée

`ADMIN_DASHBOARD`, `COLLABORATORS_POSITIONS`, `DEPARTMENTS`, `PERMISSIONS`, `SETTINGS` et `AUDIT_LOGS` restent uniquement des aliases ou redirections vers `/enterprise-admin`. Ils ne sont pas des modules métier autonomes.

## Legacy

- `EnterpriseCoreRecord` : `LEGACY_READ_ONLY`.
- `EnterpriseSectorRecord` : `LEGACY_READ_ONLY`.
- `EnterpriseWorkflow` : `LEGACY_READ_ONLY` ; Workflow Engine v2 actif.
- Aucun code sans modèle/service, route, workspace, permission, entitlement et QA ne peut rester `ACTIVE`.
- Les secteurs futurs restent `PLANNED` ou `HIDDEN`, jamais carte ou route active.
