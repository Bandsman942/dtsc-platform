# Retail / Shop — Matrice de cohérence avec l’ERP commun

## Objet

Cette matrice rend explicite la complémentarité entre Shop 2.0 et les domaines ERP communs sans créer de seconde source de vérité.

État de référence pour la consolidation finale #145 :

- baseline Production : `bd948059eb2c2d2053f7f4359c61aa647bcdb13d` ;
- Release : `prod-20260809-0759-bd94805` ;
- Shop 2.0 technique : `COMPLETE` ;
- commercialisation : `COMMERCIAL_READY` ;
- aucune promotion `COMMERCIAL_READY_GLOBAL` dans cette itération.

La relation avec Retail est classée :

- **DIRECTE** : Retail consomme ou déclenche directement un objet ERP commun ;
- **CONTEXTUELLE** : le domaine enrichit l’exploitation Retail sans être une dépendance transactionnelle ;
- **INDÉPENDANTE** : aucune dépendance ne doit être fabriquée artificiellement.

## Matrice canonique et continuité UX

| Objet / domaine | Autorité canonique | Module propriétaire | Relation Retail | Usage Retail | Continuité UX finale |
|---|---|---|---|---|---|
| Client | `EnterpriseBusinessParty` | `CRM_CUSTOMERS` | DIRECTE | client actif POS, historique, fidélité, commandes | lien **Clients** depuis le POS ; aucune fiche client Retail parallèle |
| Catalogue | `EnterpriseCatalogItem` | `CATALOG` | DIRECTE | recherche POS, panier, prix de référence | lien **Catalogue** depuis le POS ; administration des produits hors Retail |
| Sites / dépôts | `EnterpriseSite`, `EnterpriseWarehouse` | `SITES_WAREHOUSES` | DIRECTE | point de vente, dépôt, retrait | Shop sélectionne les objets existants ; aucun magasin parallèle |
| Stock | Inventory commun | `INVENTORY_LOGISTICS` | DIRECTE | disponibilité, vente, retour, réservation, multi-store | lien **Stocks** depuis le POS ; Inventory garde l’historique et l’administration |
| Commande client | `EnterpriseSalesOrder` | `SALES_QUOTES_ORDERS` | DIRECTE | omnicanal, click & collect, livraison | lien **Commandes clients** depuis le POS ; aucune commande Retail concurrente |
| Fulfillment | `EnterpriseFulfillment` | Sales/Fulfillment commun | DIRECTE | retrait, livraison, ship-from-store | Shop affiche le suivi ; Sales garde le détail opérationnel |
| Fournisseur / achat | Purchase commun | `SUPPLIERS_PURCHASES` | DIRECTE EN AMONT | alimentation du stock | achat → réception → Inventory → disponibilité Shop |
| Paiement | Finance commun / `EnterprisePayment` | `FINANCE_PAYMENTS` | DIRECTE | paiement, remboursement, état paiement | Shop affiche moyen/état métier ; Finance garde les objets financiers |
| Caisse | sessions et comptes Finance | `FINANCE_CASH` | DIRECTE | ouverture, encaissement, comptage, clôture | lien **Caisse** depuis POS, opérateurs et clôture |
| Trésorerie | comptes financiers communs | `FINANCE_TREASURY` | DIRECTE | Mobile Money, Télécom, comptes opérateurs, remboursements | lien **Trésorerie** depuis opérateurs et clôture ; aucun solde opérateur Retail parallèle |
| Comptabilité | `EnterpriseJournalEntry` | `FINANCE_ACCOUNTING` | DIRECTE | ventes, COGS, retours, écarts | impacts générés par le moteur commun ; aucun journal Retail parallèle |
| Fiscalité | référentiel fiscal Finance | `FINANCE_TAX` | DIRECTE | pricing/taxes | résultat commercial visible dans Shop, configuration dans Finance |
| Valorisation stock | Finance Inventory | `FINANCE_INVENTORY` | DIRECTE | COGS et retours | invisible au caissier sauf besoin ; source Finance commune |
| Clôture financière | domaine Finance | `FINANCE_CLOSE` | CONTEXTUELLE | fin de période | distincte de la clôture journalière du Shop |
| Créances / factures | `EnterpriseSalesInvoice` | `FINANCE_RECEIVABLES` | CONTEXTUELLE / DIRECTE | vente à crédit ou facture liée | Retail ne fabrique pas de facture parallèle |
| Banque / rapprochement | Finance commun | `FINANCE_BANK`, `FINANCE_RECONCILIATION` | CONTEXTUELLE | paiement non cash | vendeur : état métier ; Finance : rapprochement détaillé |
| Collaborateurs | membership + RH | `HUMAN_RESOURCES` | CONTEXTUELLE FORTE | vendeur, caissier, manager, contrôleur | Retail respecte les permissions résolues ; aucune identité employé parallèle |
| Validations | domaine commun | `VALIDATIONS` | CONTEXTUELLE FORTE | retours, dérogations, écarts | séparation demandeur/approbateur conservée |
| Tâches / demandes | domaines opérations | `TASKS_OPERATIONS`, `INTERNAL_REQUESTS` | CONTEXTUELLE | actions correctives ou besoins internes | pas de moteur de tâches Retail parallèle |
| Actifs | `EnterpriseAsset` | `ASSETS_MAINTENANCE` | CONTEXTUELLE | équipement POS | profil périphérique Retail ≠ actif ERP ; relation seulement si utile |
| IA | assistant commun | `AI_ASSISTANT` | CONTEXTUELLE | assistance/analyse | aucune écriture silencieuse ni autorité métier IA |
| Reporting | agrégats canoniques | `REPORTS` | DIRECTE EN LECTURE | ventes, marges, activité opérateur | lien **Rapports** depuis POS/MM/Telco ; mêmes périodes/devises |

## Parcours de référence prouvés par la suite Shop 2

### 1. Mise en service

`Entreprise → Site → Dépôt → Catalogue → Inventory → Finance/Tax → Caisse → Équipe/RBAC → Shop prêt à vendre`

Le Shop vérifie et sélectionne les objets communs ; il ne recrée ni compte, ni site, ni dépôt, ni fiscalité.

### 2. Achat vers vente

`Fournisseur → Achat → Réception → Mouvement Inventory → Disponibilité Shop → Vente POS → Paiement/Caisse → Comptabilité → Reporting`

### 3. Client vers vente / commande omnicanale

`Client CRM → POS / commande → EnterpriseSalesOrder → réservation Inventory → fulfillment → paiement → historique client → reporting`

### 4. Retour / remboursement

`Vente source → retour → validation indépendante si requise → stock inverse/rebut → remboursement → Finance → fidélité/avoir → historique`

### 5. Clôture quotidienne

`Session de caisse → mouvements → comptage → écart → justification → validation indépendante → Finance / Accounting → rapports`

`RetailDailyCloseWorkspace` affiche l’étape métier et renvoie vers `FINANCE_CASH` / `FINANCE_TREASURY` pour l’administration financière.

### 6. Mobile Money / Télécom

`Opération client → service opérateur configuré → état métier → compte opérateur Finance → caisse/trésorerie → rapports`

L’interface ne demande plus à l’agent de comprendre ou sélectionner un « provider float » ; la configuration associe un compte opérateur une seule fois et le moteur existant reste l’autorité.

### 7. Offline vers online

`Vente enregistrée localement → retour réseau → validation serveur → vente canonique → Inventory → Finance → historique`

Le brouillon local reste temporaire et ne devient jamais une seconde vérité durable.

## Deep links opposables après #145

### POS

- `/enterprise-modules/CRM_CUSTOMERS`
- `/enterprise-modules/CATALOG`
- `/enterprise-modules/INVENTORY_LOGISTICS`
- `/enterprise-modules/SALES_QUOTES_ORDERS`
- `/enterprise-modules/FINANCE_CASH`
- `/enterprise-modules/REPORTS`

### Mobile Money / Télécom

- `/enterprise-modules/FINANCE_CASH`
- `/enterprise-modules/FINANCE_TREASURY`
- `/enterprise-modules/REPORTS`

### Clôture quotidienne

- `/enterprise-modules/FINANCE_CASH`
- `/enterprise-modules/FINANCE_TREASURY`

Les deep links rendent le propriétaire de la donnée actionnable sans créer de CRUD concurrent dans Shop.

## Risques désormais bloqués par QA

1. retour du workspace Retail monolithique ;
2. erreur backend brute rendue directement par les nouveaux workspaces ;
3. codes opérateur, types de transaction ou types de comptes utilisés comme libellés clients ;
4. disparition des liens ERP prioritaires ;
5. seconde source Retail pour CRM, Catalog, Inventory, Sales ou Finance ;
6. chargement non borné des listes principales ;
7. perte de la séparation soumission/validation des opérations sensibles.

## Frontière de cette consolidation

La matrice confirme la cohérence et la continuité du produit Retail existant. Elle ne crée :

- aucun nouveau domaine comptable ;
- aucun SYSCOHADA ;
- aucun nouveau plan comptable ;
- aucun provider fictif ;
- aucune certification réglementaire pays implicite.

Le programme d’implantation des plans comptables est explicitement hors scope et ne commence qu’après la stabilisation/acceptance demandée.
