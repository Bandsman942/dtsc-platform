# Audit final de professionnalisation ERP

**Date d’évaluation :** 3 août 2026
**Source de vérité :** registre canonique et résolveur de maturité versionné
**Règle :** présence en Production ≠ commercialisabilité

## Légende

- Expérience `D` : workspace dédié.
- Formulaire / détail / actions : présents sauf mention `NR` lorsque non requis.
- Traduction, mobile et permissions : conformes aux gates automatisées, sous réserve de la recette authentifiée.
- E2E manuel : `En attente` pour les itérations 5 et 6.
- Dette restante : validation Production du propriétaire et, pour une promotion, PR séparée.

## Socle, référentiels, commerce et opérations

| Codes canoniques | Domaine | Statut technique | Maturité | Expérience | Formulaire / détail / actions | Traduction / mobile / permissions | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|
| `TASKS_OPERATIONS`, `INTERNAL_REQUESTS`, `VALIDATIONS`, `MEETINGS`, `DOCUMENTS`, `FINANCE_BUDGETS`, `REPORTS` | Core / Analytics | ACTIVE | OPERATIONAL_UI | D | Oui | Conforme | Oui | En attente de campagne finale | Non | Acceptation produit complète |
| `WORKFLOWS`, `AI_ASSISTANT` | Core / IA | ACTIVE | PROFESSIONAL_READY | D | Oui | Conforme | Oui | En attente de campagne finale | Non | Packaging et décision commerciale |
| `CRM_CUSTOMERS`, `CATALOG`, `SITES_WAREHOUSES`, `CRM_PIPELINE`, `CONTRACTS` | Core | ACTIVE | COMMERCIAL_READY | D | Oui | Conforme | Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production |
| `SALES_QUOTES_ORDERS`, `SUPPLIERS_PURCHASES`, `INVENTORY_LOGISTICS`, `HUMAN_RESOURCES`, `TIME_ATTENDANCE`, `PAYROLL_OPERATIONS`, `PROJECTS_SERVICES`, `TIME_DELIVERABLES`, `ASSETS_MAINTENANCE` | Core | ACTIVE | COMMERCIAL_READY | D | Oui | Conforme | Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production |

## Finance opérationnelle — itération 4

| Codes canoniques | Domaine | Statut technique | Maturité | Expérience | Formulaire / détail / actions | Traduction / mobile / permissions | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|
| `FINANCE_OVERVIEW`, `FINANCE_RECEIVABLES`, `FINANCE_PAYABLES`, `FINANCE_PAYMENTS`, `FINANCE_TREASURY`, `FINANCE_CASH`, `FINANCE_BANK`, `FINANCE_RECONCILIATION` | Finance | ACTIVE | COMMERCIAL_READY | D | Oui | Conforme | Oui | Réussi le 2 août 2026 | Oui | Suivi Production |

## Comptabilité et clôture — itération 5

| Codes canoniques | Domaine | Statut technique | Maturité | Expérience | Formulaire / détail / actions | Traduction / mobile / permissions | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|
| `FINANCE_ACCOUNTING`, `FINANCE_TAX`, `FINANCE_CLOSE`, `FINANCE_STATEMENTS`, `FINANCE_ASSETS`, `FINANCE_INVENTORY` | Finance | ACTIVE | PROFESSIONAL_READY | D | Oui / Oui / Oui ou NR | Conforme | Oui | En attente | Non | Validation manuelle propriétaire et PR séparée |

## Health — itération 6

| Code canonique | Libellé français | Statut technique | Maturité | Workspace dédié | Formulaire | Détail | Actions | Traduction | Mobile | Permissions | Documentation | QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PATIENTS` | Patients | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E Production et PR séparée |
| `APPOINTMENTS` | Rendez-vous | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E Production et PR séparée |
| `CONSULTATIONS` | Consultations | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E clôture/confidentialité |
| `MEDICAL_RECORDS` | Dossiers médicaux | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E accès et révocation |
| `CARE_TEAM` | Équipe médicale | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E permissions et liaisons |
| `LABORATORY` | Laboratoire | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E résultat critique |
| `INTERNAL_PHARMACY` | Pharmacie interne | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E FEFO, stock et Finance |
| `MEDICAL_BILLING` | Facturation médicale | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E facture commune |
| `INSURANCE_COVERAGE` | Assurances & prises en charge | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E allocations |
| `QUALITY_INCIDENTS` | Incidents qualité | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E confidentialité |
| `MEDICAL_DOCUMENTS` | Documents médicaux | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E upload et téléchargement |

## Pharmacy — itération 6

| Code canonique | Libellé français | Statut technique | Maturité | Workspace dédié | Formulaire | Détail | Actions | Traduction | Mobile | Permissions | Documentation | QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `MEDICINES_PRODUCTS` | Produits & médicaments | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E catalogue commun |
| `BATCH_EXPIRY` | Lots & péremptions | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E lots et blocages |
| `STOCK_INVENTORY` | Stock & inventaire | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E mobile et idempotence |
| `STOCK_RECEIPTS` | Réceptions | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E réception unique |
| `SALES_DISPENSATION` | Ventes & dispensation | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E FEFO et Finance |
| `PRESCRIPTIONS` | Ordonnances | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E validation pharmacien |
| `SUPPLIERS_ORDERS` | Fournisseurs & commandes | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E achats communs |
| `CASH_INVOICES_PAYMENTS` | Caisse, factures & paiements | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E caisse commune |
| `RETURNS_ADJUSTMENTS_LOSSES` | Retours, ajustements & pertes | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E mouvements inverses |
| `ALERTS_EXPIRY_LOW_STOCK` | Alertes & rappels | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E rappel et blocage |
| `QUALITY_PHARMACOVIGILANCE` | Qualité & pharmacovigilance | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E confidentialité |
| `PHARMACY_DOCUMENTS` | Documents & conformité | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E documents |
| `PHARMACY_REPORTS` | Rapports Pharmacy | ACTIVE | PROFESSIONAL_READY | Oui | NR | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E absence de double comptage |
| `PHARMACY_SETTINGS` | Paramètres Pharmacy | ACTIVE | PROFESSIONAL_READY | Oui | Oui | Oui | Oui | Conforme | Conforme | Conforme | Oui | Oui | En attente | Non | E2E paramètres critiques |

## Modules masqués et administration consolidée

| Code ou famille | Statut | Décision |
|---|---|---|
| `MEDICAL_CONFIDENTIALITY` | HIDDEN | La confidentialité est appliquée dans les modules Health réels |
| `HEALTH_SETTINGS` | HIDDEN | Aucune surface générique sans workspace professionnel |
| `HEALTH_REPORTS` | HIDDEN | Aucun rapport fantôme ni double projection financière |
| `ADMIN_DASHBOARD`, `COLLABORATORS_POSITIONS`, `DEPARTMENTS`, `PERMISSIONS`, `SETTINGS`, `AUDIT_LOGS` | Administration consolidée | Non vendus comme modules autonomes |
| `EnterpriseCoreRecord`, `EnterpriseSectorRecord`, `EnterpriseWorkflow` | LEGACY_READ_ONLY | Lecture historique tenant-scoped, aucune nouvelle écriture |

## Conclusion

Les modules Health et Pharmacy actifs atteignent `PROFESSIONAL_READY`. Leur E2E manuel reste **En attente**, leur colonne **Commercialisable** reste **Non**, et la **Dette restante** commune est la validation authentifiée en Production suivie d’une PR de promotion commerciale séparée et auditée.
