# Retail / Shop — Matrice de cohérence avec l’ERP commun

## Objet

Cette matrice rend explicite la complémentarité entre Shop 2.0 et les domaines ERP communs sans créer de seconde source de vérité.

Elle s’appuie sur :

- `docs/ERP_CANONICAL_ENTITY_OWNERSHIP.md` ;
- `docs/ERP_CROSS_MODULE_RELATION_MATRIX.md` ;
- le registre canonique des modules ERP ;
- les parcours Shop 2.0 déjà livrés.

La relation avec Retail est classée en trois niveaux :

- **DIRECTE** : Retail consomme ou déclenche directement un objet ERP commun ;
- **CONTEXTUELLE** : le domaine enrichit l’exploitation Retail sans être une dépendance transactionnelle du POS ;
- **INDÉPENDANTE** : le module cohabite avec Retail mais aucune dépendance métier ne doit être fabriquée artificiellement.

## Matrice canonique

| Objet / domaine | Autorité canonique | Module ERP propriétaire | Relation Retail | Usage Shop / Retail | Risque principal à éviter | Continuité UX attendue |
|---|---|---|---|---|---|---|
| Client | `EnterpriseBusinessParty` | `CRM_CUSTOMERS` | DIRECTE | client actif POS, historique, fidélité, commande client | créer un « client Retail » concurrent du CRM | sélectionner/créer depuis le Shop puis ouvrir la fiche client sans perdre le contexte |
| Catalogue | `EnterpriseCatalogItem` | `CATALOG` | DIRECTE | recherche POS, panier, prix de référence, commandes | dupliquer nom, SKU, prix de base ou article | recherche Retail rapide, accès au produit canonique pour administration |
| Sites | `EnterpriseSite` | `SITES_WAREHOUSES` | DIRECTE | magasin de vente, retrait, disponibilité multi-boutiques | créer une notion de magasin parallèle | afficher des libellés identiques et ouvrir le site propriétaire quand nécessaire |
| Dépôts / emplacements | `EnterpriseWarehouse`, `EnterpriseStorageLocation` | `SITES_WAREHOUSES` / `INVENTORY_LOGISTICS` | DIRECTE | stock POS, préparation, offline, réservation | maintenir un dépôt Retail séparé | choix du dépôt dans le Shop, administration dans le module propriétaire |
| Stock physique | `EnterpriseStockMovement` et soldes Inventory | `INVENTORY_LOGISTICS` | DIRECTE | disponibilité, réservation, vente, retour, multi-store | créer une balance Retail parallèle | Shop montre la disponibilité ; Inventory garde l’administration et l’historique détaillé |
| Réservation de stock | domaine Inventory commun | `INVENTORY_LOGISTICS` | DIRECTE | click & collect, retrait autre magasin, livraison | réserver sans contrôle de concurrence ou hors tenant | état métier traduit dans Shop ; détail logistique accessible depuis Inventory |
| Commande client | `EnterpriseSalesOrder` | `SALES_QUOTES_ORDERS` | DIRECTE | commande depuis POS, omnicanal | créer une commande financière Retail distincte | Shop crée/suit la commande ; Sales reste propriétaire du cycle commercial |
| Livraison / remise | `EnterpriseFulfillment` | `SALES_QUOTES_ORDERS` / Fulfillment commun | DIRECTE | retrait, ship-from-store, livraison client | reconstruire un moteur de fulfillment dans Retail | Shop affiche un suivi simple ; le détail opérationnel reste dans le domaine commun |
| Fournisseur / achat | `EnterpriseBusinessParty`, `EnterprisePurchase` | `SUPPLIERS_PURCHASES` | DIRECTE EN AMONT | approvisionnement du stock vendu dans Shop | permettre au POS de gérer un achat parallèle | achats et réceptions alimentent Inventory ; Shop ne fait que consommer la disponibilité |
| Réception achat | `EnterprisePurchaseReceipt` | `SUPPLIERS_PURCHASES` | DIRECTE EN AMONT | entrée de stock disponible ensuite à la vente | incrémenter aussi un stock Retail | réception → mouvement Inventory → disponibilité Shop |
| Paiement | `EnterprisePayment` et domaines financiers communs | `FINANCE_PAYMENTS` | DIRECTE | paiement des ventes, remboursements, méthodes autorisées | conserver un paiement financier parallèle dans Retail | Shop présente le moyen et l’état métier ; Finance garde la vérité financière |
| Caisse | sessions et comptes Finance communs | `FINANCE_CASH` | DIRECTE | ouverture, encaissement, comptage, clôture | caisse Retail indépendante de Finance | état de caisse visible dans Shop ; gestion et contrôles complets dans Finance |
| Trésorerie | comptes financiers communs | `FINANCE_TREASURY` | DIRECTE | cash, Mobile Money, float, transferts | soldes opérateurs parallèles | soldes résolus depuis Finance, jamais réécrits dans Retail |
| Comptabilité | `EnterpriseJournalEntry` | `FINANCE_ACCOUNTING` | DIRECTE | comptabilisation des ventes, retours, écarts | écriture sectorielle parallèle ou modification d’une écriture postée | Shop confirme l’effet métier ; détail comptable consultable dans Finance |
| Fiscalité | référentiel Finance commun | `FINANCE_TAX` | DIRECTE | taxes appliquées au pricing et aux ventes | taux pays codé en dur dans Retail | Shop affiche le résultat commercial ; configuration fiscale dans Finance |
| Valorisation stock | domaine Finance Inventory | `FINANCE_INVENTORY` | DIRECTE | coût/valorisation des sorties et retours | recalculer une valorisation Retail indépendante | impact invisible au caissier sauf besoin ; détail dans Finance |
| Clôture financière | domaines de clôture communs | `FINANCE_CLOSE` | CONTEXTUELLE / DIRECTE SELON PROCESSUS | cohérence fin de période après clôtures Retail | confondre clôture de caisse et clôture comptable | distinguer clairement « clôturer la caisse » de « clôturer une période comptable » |
| États financiers | versions publiées communes | `FINANCE_STATEMENTS` | CONTEXTUELLE | consolidation des effets Retail | produire un état financier Retail concurrent | Shop fournit ses KPI ; les états officiels restent Finance |
| Créances / factures | `EnterpriseSalesInvoice` | `FINANCE_RECEIVABLES` | CONTEXTUELLE / DIRECTE SELON VENTE | ventes à crédit / facturation lorsque le parcours le prévoit | créer une facture Shop parallèle | lien vers la facture commune lorsque générée, sans afficher une fausse facture POS |
| Banque / rapprochement | domaine Finance commun | `FINANCE_BANK`, `FINANCE_RECONCILIATION` | CONTEXTUELLE | paiements non-cash et contrôle financier | exposer la mécanique de rapprochement au vendeur | le vendeur voit « paiement confirmé/en attente » ; Finance voit le rapprochement détaillé |
| Collaborateurs | `EnterpriseEmployee` + membership/permissions | `HUMAN_RESOURCES` / Administration | CONTEXTUELLE FORTE | vendeur, caissier, manager, contrôleur | dupliquer l’identité employé ou contourner RBAC | Shop n’affiche que les actions autorisées ; gestion équipe dans son module propriétaire |
| Temps / présence | domaine RH commun | `TIME_ATTENDANCE` | CONTEXTUELLE | disponibilité opérationnelle des équipes | bloquer une vente sur une dépendance non requise | information contextuelle seulement si un vrai cas métier existe |
| Paie | `EnterprisePayrollRun` | `PAYROLL_OPERATIONS` | INDÉPENDANTE | aucun lien transactionnel nécessaire au POS | inventer une dépendance Retail → paie | cohérence visuelle générale uniquement |
| Tâches | domaine opérations commun | `TASKS_OPERATIONS` | CONTEXTUELLE | suivi d’actions correctives, préparation, inventaire, incidents | créer un moteur de tâches dans Retail | action contextuelle éventuelle « créer/suivre une tâche » avec retour vers Shop |
| Demandes internes | domaine opérations commun | `INTERNAL_REQUESTS` | CONTEXTUELLE | demande d’approvisionnement, matériel, support interne | remplacer le workflow achat/stock | utiliser seulement pour demandes internes non transactionnelles |
| Validations | domaine opérations commun | `VALIDATIONS` | CONTEXTUELLE FORTE | retours, dérogations, écarts selon politiques | auto-validation par l’initiateur | statut de validation lisible dans Shop ; détail dans Validations |
| Workflows | Workflow Engine commun | `WORKFLOWS` | CONTEXTUELLE | automatisations autour de processus Retail | dupliquer une state machine métier déjà existante | lien contextuel seulement quand un workflow réel est configuré |
| Réunions | domaine collaboration/opérations | `MEETINGS` | INDÉPENDANTE | pas de dépendance POS | imposer une relation artificielle | cohérence de navigation et UI seulement |
| Pipeline CRM | domaine CRM commun | `CRM_PIPELINE` | CONTEXTUELLE | exploitation commerciale de clients/prospects | transformer une vente POS en opportunité par défaut | intégration uniquement pour cas B2B/configurés |
| Contrats | domaine contrats commun | `CONTRACTS` | CONTEXTUELLE | tarifs ou engagements B2B si configurés | appliquer implicitement un contrat non sélectionné | afficher l’effet commercial lorsqu’un contrat est réellement applicable |
| Projets / services | `EnterpriseProject`, livrables | `PROJECTS_SERVICES`, `TIME_DELIVERABLES` | INDÉPENDANTE / CONTEXTUELLE | cas Retail services spécifiques | créer une dépendance obligatoire | seulement si un produit/service Retail est réellement lié à un projet |
| Actifs | `EnterpriseAsset` | `ASSETS_MAINTENANCE` | CONTEXTUELLE | terminaux, imprimantes et matériel du point de vente | confondre profil de périphérique POS et actif comptable/opérationnel | possibilité de relier un équipement géré à son actif sans dupliquer l’actif |
| IA entreprise | domaine assistant commun | `AI_ASSISTANT` | CONTEXTUELLE | aide à l’analyse ou au support métier | laisser l’IA devenir source de vérité | IA lit/assiste ; aucune écriture silencieuse dans Retail/ERP |
| Reporting | agrégats et rapports canoniques | `REPORTS` et rapports dédiés | DIRECTE EN LECTURE | performance commerciale, ventes, stock, marge selon autorisations | deux définitions différentes du même KPI | même définition et même période entre Shop et Reports |

## Parcours de référence

### 1. Mise en service

`Entreprise → Site → Dépôt → Catalogue → Inventory → Finance/Tax → Caisse → Équipe/RBAC → Shop prêt à vendre`

Le Shop sélectionne et vérifie les objets communs existants ; il ne recrée ni compte, ni site, ni dépôt, ni taux fiscal.

### 2. Achat vers vente

`Fournisseur → Achat → Réception → Mouvement Inventory → Disponibilité Shop → Vente POS → Paiement/Caisse → Comptabilité → Reporting`

### 3. Commande client

`Client CRM → Shop → EnterpriseSalesOrder → Réservation Inventory → Fulfillment → Paiement → Historique client → Reporting`

### 4. Retour / remboursement

`Vente source → Retour → Validation si requise → Stock inverse/rebut → Remboursement → Finance → Fidélité / avoir → Historique`

### 5. Clôture

`Session de caisse → Mouvements → Comptage → Écart → Justification → Validation indépendante → Finance / Accounting → Rapports`

### 6. Offline vers online

`Vente enregistrée localement → Retour réseau → Validation serveur → Vente canonique → Inventory → Finance → Historique`

Le brouillon local n’est jamais une seconde vérité durable.

## Risques transverses à auditer dans les tranches suivantes

1. deep links exacts entre Shop et les objets ERP propriétaires ;
2. conservation du contexte de retour vers Shop ;
3. cohérence des KPI Shop vs `REPORTS` ;
4. cohérence des labels et statuts entre Retail, Sales, Inventory et Finance ;
5. surfaces où une erreur backend brute peut encore atteindre le client ;
6. duplication éventuelle de formulaires de configuration déjà possédés par l’ERP commun ;
7. permissions visibles côté UI mais non alignées avec les mêmes capacités côté serveur.

Cette matrice est un contrat d’audit. Toute correction doit conserver les autorités canoniques ci-dessus.
