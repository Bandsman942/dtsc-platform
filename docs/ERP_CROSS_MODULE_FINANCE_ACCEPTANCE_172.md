# ERP Stabilisation 5/6 — Acceptance transverse vers Finance

Issue : #172
Parent : #167

## Principe

Les modules métiers ne possèdent pas de ledger parallèle. Ils produisent ou projettent un événement métier vers le moteur Finance commun, qui reste seul responsable du readiness, des mappings sémantiques, des journaux, du taux de change, de la période, de l'idempotence, de l'équilibre débit/crédit et de l'écriture `POSTED`.

## Matrice de convergence

| Domaine source | Événement commun Finance | Preuve |
|---|---|---|
| Sales | `SALES_INVOICE_POSTED` | parcours navigateur réel de l'onboarding comptable + vérification DB équilibrée |
| Procurement | `SUPPLIER_INVOICE_POSTED` | facture fournisseur réelle `APPROVED → POSTED`, payable créé, posting unique et équilibré |
| Payroll | `PAYROLL_APPROVED` | run de paie approuvé, route `post-liability`, posting agrégé unique et équilibré |
| Inventory | `INVENTORY_RECEIPT_VALUED` / `INVENTORY_ISSUE_VALUED` | contrat de service et registre Finance contrôlés par gate permanent |
| Assets | `ASSET_CAPITALIZED` / `ASSET_DEPRECIATION_POSTED` | contrat de service et registre Finance contrôlés par gate permanent |
| Retail | `RETAIL_POS_SALE_POSTED` / retours | behavioral gates Shop 2 + registre Finance commun |
| Health | ventes/paiements mappés vers événements Sales/Payments ; write-off séparé gouverné | adapter statiquement contrôlé, aucun ledger secteur |
| Pharmacy | ventes/achats/stocks mappés vers Sales/Procurement/Inventory ; pertes/retours spécifiques gouvernés | adapter statiquement contrôlé, aucun ledger secteur |

## Invariants transverses

L'acceptance ne réimplémente pas les contrôles déjà prouvés par la même chaîne :

- absence de mapping → refus explicite du posting ;
- période fermée → posting impossible et historique immuable ;
- taux de change manquant → aucune conversion inventée ;
- isolation `organizationId` et membership ;
- séparation des acteurs sur les étapes d'approbation couvertes par les suites comptables et métier ;
- idempotence par événement/source : une relance ne crée pas une deuxième écriture ;
- chaque écriture `POSTED` est équilibrée ;
- correction d'un historique par événement inverse/contrepassation, jamais par réécriture.

## Acceptance production-like

`.github/workflows/accounting-acceptance.yml` exécute sur PostgreSQL propre et application Next.js buildée :

1. onboarding comptable et Sales réel ;
2. `erp-cross-module-finance.spec.mjs` pour Sales persistant, Procurement, Payroll et isolation tenant ;
3. redémarrage serveur ;
4. clôture de période et protection de l'historique.

Les domaines Inventory/Assets/Health/Pharmacy sont en plus protégés par `qa-erp-cross-module-finance.mjs`; Retail conserve ses behavioral gates spécialisés. Cette combinaison évite de fabriquer un second harness comptable spécifique à chaque secteur.

## Données / migrations

Aucune migration Prisma. Les données d'acceptance sont éphémères et créées uniquement dans la base CI propre.
