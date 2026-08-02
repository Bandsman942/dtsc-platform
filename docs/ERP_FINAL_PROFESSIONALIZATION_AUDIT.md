# Audit final de professionnalisation ERP

**Date d’évaluation :** 3 août 2026  
**Source de vérité :** registre canonique et résolveur de maturité versionné  
**Règle :** présence en Production ≠ commercialisabilité

## Légende

- **Technique :** `ACTIVE` sauf mention contraire.
- **Expérience :** `D` = workspace dédié ; `A` = administration consolidée.
- **F/D/Act. :** formulaire / détail / actions métier. `NR` signifie non requis pour une vue de lecture.
- **Conformité :** FR, mobile et permissions serveur.
- **E2E :** validation manuelle du propriétaire.
- **Dette restante :** condition principale empêchant la prochaine promotion.

## Modules communs et opérations

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `TASKS_OPERATIONS` | Tâches & opérations | Core | ACTIVE | OPERATIONAL_UI | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Acceptation commerciale complète |
| `INTERNAL_REQUESTS` | Demandes internes | Core | ACTIVE | OPERATIONAL_UI | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Acceptation commerciale complète |
| `VALIDATIONS` | Validations | Core | ACTIVE | OPERATIONAL_UI | D | NR/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Acceptation commerciale complète |
| `MEETINGS` | Réunions | Core | ACTIVE | OPERATIONAL_UI | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Acceptation commerciale complète |
| `WORKFLOWS` | Workflows | Core | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Promotion commerciale explicite |
| `DOCUMENTS` | Documents | Core | ACTIVE | OPERATIONAL_UI | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Acceptation commerciale complète |
| `FINANCE_BUDGETS` | Finances & budgets | Core | ACTIVE | OPERATIONAL_UI | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Finition et acceptation commerciale |
| `REPORTS` | Rapports | Analytics | ACTIVE | OPERATIONAL_UI | D | NR/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Finition et acceptation commerciale |
| `AI_ASSISTANT` | IA Assistant Entreprise | IA | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente de campagne finale | Non | Packaging et décision commerciale |

## Référentiels et commerce — itération 2

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `CRM_CUSTOMERS` | Tiers, prospects et clients | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `CATALOG` | Catalogue produits & services | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `SITES_WAREHOUSES` | Sites, entrepôts & emplacements | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `CRM_PIPELINE` | Pipeline commercial | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `CONTRACTS` | Contrats | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |

## Opérations — itération 3

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `SALES_QUOTES_ORDERS` | Devis, commandes & livraisons | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `SUPPLIERS_PURCHASES` | Fournisseurs & achats | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `INVENTORY_LOGISTICS` | Stock & logistique | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `HUMAN_RESOURCES` | Ressources humaines | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `TIME_ATTENDANCE` | Congés, présences & temps | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `PAYROLL_OPERATIONS` | Paie opérationnelle | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `PROJECTS_SERVICES` | Projets & services | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `TIME_DELIVERABLES` | Temps projet & livrables | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |
| `ASSETS_MAINTENANCE` | Actifs & maintenance | Core | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi — validation propriétaire antérieure | Oui | Suivi Production continu |

## Finance opérationnelle — itération 4

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `FINANCE_OVERVIEW` | Vue d’ensemble Finance | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_RECEIVABLES` | Créances clients | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_PAYABLES` | Dettes fournisseurs | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_PAYMENTS` | Paiements & allocations | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_TREASURY` | Trésorerie | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_CASH` | Caisse | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_BANK` | Banque | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |
| `FINANCE_RECONCILIATION` | Rapprochement | Finance | ACTIVE | COMMERCIAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | Réussi le 2 août 2026 | Oui | Suivi Production continu |

## Comptabilité et clôture — itération 5

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `FINANCE_ACCOUNTING` | Comptabilité | Finance | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | Validation manuelle propriétaire |
| `FINANCE_TAX` | Fiscalité | Finance | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | Validation manuelle propriétaire |
| `FINANCE_CLOSE` | Clôture financière | Finance | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | Validation manuelle propriétaire |
| `FINANCE_STATEMENTS` | États financiers | Finance | ACTIVE | PROFESSIONAL_READY | D | NR/Oui/Oui | Conforme | Oui/Oui | En attente | Non | Validation manuelle propriétaire |
| `FINANCE_ASSETS` | Immobilisations | Finance | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | Validation manuelle propriétaire |
| `FINANCE_INVENTORY` | Valorisation du stock | Finance | ACTIVE | PROFESSIONAL_READY | D | NR/Oui/Oui | Conforme | Oui/Oui | En attente | Non | Validation manuelle propriétaire |

## Health — itération 6

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PATIENTS` | Patients | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E Production et PR de promotion |
| `APPOINTMENTS` | Rendez-vous | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E Production et PR de promotion |
| `CONSULTATIONS` | Consultations | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E Production et PR de promotion |
| `MEDICAL_RECORDS` | Dossiers médicaux | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E confidentialité et PR de promotion |
| `CARE_TEAM` | Équipe médicale | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E permissions et PR de promotion |
| `LABORATORY` | Laboratoire | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E résultat critique et PR de promotion |
| `INTERNAL_PHARMACY` | Pharmacie interne | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E FEFO/stock/finance et PR de promotion |
| `MEDICAL_BILLING` | Facturation médicale | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E facture commune et PR de promotion |
| `INSURANCE_COVERAGE` | Assurances & prises en charge | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E allocations et PR de promotion |
| `QUALITY_INCIDENTS` | Incidents qualité | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E confidentialité et PR de promotion |
| `MEDICAL_DOCUMENTS` | Documents médicaux | Health | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E upload/téléchargement et PR de promotion |

## Pharmacy — itération 6

| Code canonique | Libellé français | Domaine | Technique | Maturité | Exp. | F/D/Act. | Conformité | Documentation / QA | E2E manuel | Commercialisable | Dette restante |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `MEDICINES_PRODUCTS` | Produits & médicaments | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E catalogue commun et PR de promotion |
| `BATCH_EXPIRY` | Lots & péremptions | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E lots/blocages et PR de promotion |
| `STOCK_INVENTORY` | Stock & inventaire | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E mobile/idempotence et PR de promotion |
| `STOCK_RECEIPTS` | Réceptions | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E réception unique et PR de promotion |
| `SALES_DISPENSATION` | Ventes & dispensation | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E FEFO/finance et PR de promotion |
| `PRESCRIPTIONS` | Ordonnances | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E validation pharmacien et PR de promotion |
| `SUPPLIERS_ORDERS` | Fournisseurs & commandes | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E achats communs et PR de promotion |
| `CASH_INVOICES_PAYMENTS` | Caisse, factures & paiements | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E caisse commune et PR de promotion |
| `RETURNS_ADJUSTMENTS_LOSSES` | Retours, ajustements & pertes | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E mouvements inverses et PR de promotion |
| `ALERTS_EXPIRY_LOW_STOCK` | Alertes & rappels | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E file opérationnelle et PR de promotion |
| `QUALITY_PHARMACOVIGILANCE` | Qualité & pharmacovigilance | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E confidentialité et PR de promotion |
| `PHARMACY_DOCUMENTS` | Documents & conformité | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E documents et PR de promotion |
| `PHARMACY_REPORTS` | Rapports Pharmacy | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | NR/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E absence de double comptage et PR de promotion |
| `PHARMACY_SETTINGS` | Paramètres Pharmacy | Pharmacy | ACTIVE | PROFESSIONAL_READY | D | Oui/Oui/Oui | Conforme | Oui/Oui | En attente | Non | E2E paramètres critiques et PR de promotion |

## Administration et surfaces non autonomes

| Code | Statut | Décision |
|---|---|---|
| `ADMIN_DASHBOARD`, `COLLABORATORS_POSITIONS`, `DEPARTMENTS`, `PERMISSIONS`, `SETTINGS`, `AUDIT_LOGS` | Administration consolidée | Professionnels dans `/enterprise-admin`, non vendus comme modules autonomes |
| `MEDICAL_CONFIDENTIALITY` | HIDDEN | La confidentialité est appliquée dans les vrais modules Health |
| `HEALTH_SETTINGS` | HIDDEN | Les paramètres génériques sans workspace professionnel restent masqués |
| `HEALTH_REPORTS` | HIDDEN | Aucun rapport fantôme ni double projection financière |
| `EnterpriseCoreRecord`, `EnterpriseSectorRecord`, `EnterpriseWorkflow` | LEGACY_READ_ONLY | Aucune écriture nouvelle ; conservation historique bornée et tenant-scoped |

## Conclusion

Les modules actifs de l’itération 6 satisfont le niveau `PROFESSIONAL_READY`. Leur E2E manuel est **En attente** et leur colonne **Commercialisable** reste **Non**. La dette restante commune est la validation authentifiée en Production, suivie d’une PR de promotion commerciale séparée et auditée.
