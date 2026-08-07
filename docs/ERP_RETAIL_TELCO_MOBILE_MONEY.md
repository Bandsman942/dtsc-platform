# ERP Retail — Télécom & Mobile Money

## Statut

Profil métier : `RETAIL_TELCO_MOBILE_MONEY`

Secteur parent : `COMMERCE_RETAIL`

Plan minimal opérationnel : `BUSINESS`

Ce profil remplace le vieux template Commerce centré sur des codes sectoriels génériques par les sources de vérité ERP Core de DTSC Platform.

`EnterpriseRetailConfiguration` est le contrat 1:1 du profil métier Retail d’une organisation : `profileCode` identifie le profil, `status` indique s’il est actif et les champs `defaultSiteId`, `defaultWarehouseId`, `defaultStorageLocationId` et `baseCurrencyCode` portent sa configuration opérationnelle. DTSC n’introduit pas une deuxième table de profil qui concurrencerait cette source de vérité.

## Provisionnement automatique du Shop

L’application du template canonique `COMMERCE_RETAIL` synchronise désormais automatiquement le profil `RETAIL_TELCO_MOBILE_MONEY`.

Pour une nouvelle entreprise Shop, DTSC :

1. applique le template Commerce Retail v2 ;
2. crée ou réactive `EnterpriseRetailConfiguration` de manière idempotente ;
3. provisionne M-Pesa, Orange Money, Airtel Money et Afrimoney dans `EnterpriseRetailProvider` ;
4. conserve les quatre providers en type `BOTH` afin qu’ils puissent servir Mobile Money et Télécom lorsque le tenant les utilise ;
5. ne crée aucun faux compte financier, aucun float et aucun solde ;
6. laisse `mobileMoneyFloatAccountId` et `telcoFloatAccountId` non renseignés jusqu’à ce que l’entreprise lie ses vrais comptes ;
7. si l’organisation quitte `COMMERCE_RETAIL` lors d’un changement de template, désactive la configuration Retail et les providers sans supprimer l’historique.

Le provisionnement est relançable sans duplication. Une migration additive de convergence couvre aussi les organisations Commerce éventuellement créées entre le premier déploiement Retail et l’activation du provisionnement runtime.

## Offres et onboarding Shop

Les noms commerciaux recommandés n’altèrent pas les codes de facturation existants :

- `STARTER` — **Shop Essentials** ;
- `BUSINESS` — **Shop Operations** ;
- `ENTERPRISE` — **Shop Scale**.

### Starter — Shop Essentials

Le profil Shop et les providers peuvent être préparés, mais les opérations Retail restent verrouillées par les entitlements. Les modules utilisables dès Starter dans le template sont principalement :

- `CRM_CUSTOMERS` ;
- `CATALOG` ;
- `DOCUMENTS`.

Starter sert à préparer la clientèle, le catalogue, les offres et les documents. Il ne doit pas être vendu comme un POS complet : `RETAIL_POS`, `MOBILE_MONEY_AGENCY`, `TELCO_TOPUPS` et `RETAIL_DAILY_CLOSE` exigent tous `BUSINESS` au minimum.

### Business — Shop Operations

Business est le minimum recommandé pour exploiter réellement un Shop. Il débloque, sous réserve des permissions et dépendances :

- sites et dépôts ;
- stock et logistique ;
- fournisseurs et achats ;
- Finance, Trésorerie et Caisse ;
- `RETAIL_POS` ;
- `MOBILE_MONEY_AGENCY` ;
- `TELCO_TOPUPS` ;
- `RETAIL_DAILY_CLOSE` ;
- rapports.

Avant la première opération, l’administrateur doit encore renseigner les données réelles du tenant : site, entrepôt, stock initial, comptes CASH, comptes MOBILE_MONEY/float, éventuels comptes TELCO/CLEARING, soldes d’ouverture et mappings provider → comptes.

### Enterprise — Shop Scale

Enterprise reprend tout le parcours Business et ajoute la capacité du plan Enterprise pour une organisation plus large. Les quatre modules Retail ne nécessitent pas Enterprise : leur minimum reste Business. Enterprise se justifie par la croissance, la gouvernance, le nombre d’utilisateurs, le multisite et l’accès aux autres capacités Enterprise éligibles.

## Convergence canonique

| Ancien code Commerce | Source de vérité actuelle | Décision |
| --- | --- | --- |
| `PRODUCTS` | `CATALOG` | ancien module désactivé |
| `CUSTOMERS` | `CRM_CUSTOMERS` | ancien module désactivé |
| `STOCK`, `INVENTORY` | `INVENTORY_LOGISTICS` | anciens modules désactivés |
| `SUPPLIERS`, `PURCHASE_ORDERS` | `SUPPLIERS_PURCHASES` | anciens modules désactivés |
| `CASH_REGISTER` | `FINANCE_CASH` + `RETAIL_DAILY_CLOSE` | ancien module désactivé |
| `SALES` | `RETAIL_POS` | ancien module désactivé, pas d’alias actif |
| `SALES_REPORTS` | rapports Retail + `REPORTS` | ancien module désactivé |
| `PROMOTIONS` | aucune source de vérité commerciale active | reste désactivé tant qu’un vrai module n’est pas livré |

Aucune écriture Retail n’utilise `EnterpriseCoreRecord` ni les anciens CRUD sectoriels Commerce.

## Modules Retail

### `RETAIL_POS`

- vente comptoir idempotente ;
- calcul serveur du ticket ;
- paiements multiples/split tender ;
- client facultatif ;
- sortie de stock via `EnterpriseStockMovement` / `SALE_FULFILLMENT` ;
- blocage du stock négatif par le moteur Inventory ;
- encaissement via les comptes financiers existants ;
- cash uniquement avec `EnterpriseCashSession` ouverte ;
- annulation auditée avec `RETURN_IN` et contre-mouvements de trésorerie.

### `MOBILE_MONEY_AGENCY`

- opérateurs configurables par organisation ;
- `DEPOSIT` : cash augmente, float diminue du principal ;
- `WITHDRAWAL` : cash diminue, float augmente du principal ;
- frais client et commission opérateur séparés ;
- référence externe opérateur ;
- annulation contrôlée qui produit les effets opposés ;
- comptes `CASH` et `MOBILE_MONEY` distincts et dans la même devise.

Les opérateurs fournis par défaut sont M-Pesa, Orange Money, Airtel Money et Afrimoney. Les comptes de float ne sont jamais inventés : un responsable doit lier de vrais `EnterpriseFinancialAccount`.

### `TELCO_TOPUPS`

- airtime, crédit et forfaits internet ;
- offre libre ou liée à `EnterpriseCatalogItem` ;
- prix de vente, coût opérateur et marge calculée côté serveur ;
- encaissement séparé du float opérateur ;
- statut `SUCCESS` ou `FAILED` ;
- le float n’est débité que pour une opération réussie ;
- annulation auditée d’une opération réussie.

Cette livraison enregistre et rapproche l’exécution opérateur. Elle ne déclenche pas encore directement les API M-Pesa/Orange/Airtel/Afrimoney : la référence externe reste obligatoire dans la procédure opérationnelle du shop.

### `RETAIL_DAILY_CLOSE`

- sélection de plusieurs caisses/floats ;
- pour `CASH`, réutilisation de la vraie `EnterpriseCashSession` ;
- théorique = fonds d’ouverture + entrées - sorties ;
- détail des coupures obligatoire pour contrôler le montant déclaré ;
- rapprochement des floats contre `operationalBalance` ;
- justification obligatoire des écarts ;
- soumission puis validation indépendante ;
- la personne ayant soumis ne peut pas valider ;
- après approbation, la session CASH est fermée et les écarts sont transmis au posting Finance existant.

## RBAC Commerce

Les permissions Retail sont portées par les postes sous forme de tableau JSON, format compris par le résolveur central `module-access.ts`.

Postes fournis :

- `STORE_MANAGER` — supervision générale ;
- `SALES_MANAGER` — POS et Télécom ;
- `SELLER` — vente et recharge ;
- `CASHIER` — POS, Mobile Money et soumission de clôture ;
- `MOBILE_MONEY_AGENT` — dépôts, retraits, Télécom et soumission de clôture ;
- `STOCK_KEEPER` — opérations de stock ;
- `STOCK_MANAGER` — supervision stock ;
- `PURCHASE_MANAGER` — achats/réapprovisionnement ;
- `RETAIL_CONTROLLER` — lecture transverse et validation indépendante des clôtures.

Les rôles globaux `OWNER` / administrateurs conservent les règles centrales de DTSC Platform. Les permissions de poste ne remplacent ni l’abonnement, ni l’activation du module, ni ses dépendances.

## Départements du profil

- Direction ;
- Vente & Télécom ;
- Mobile Money & Caisse ;
- Stock & Achats ;
- Finance & Contrôle.

La migration initiale met à jour les postes existants par `organizationId + positionCode` afin de conserver leurs IDs et les affectations des collaborateurs.

## Données financières

Le profil utilise exclusivement les comptes financiers communs :

- `CASH` pour la caisse physique ;
- `MOBILE_MONEY` pour les wallets/floats opérateurs ;
- `BANK` pour les règlements bancaires ;
- `CLEARING` pour certains comptes techniques Télécom.

La devise doit correspondre entre l’opération et les comptes concernés. Pour un shop CDF/USD, créer des comptes séparés par devise. La devise fonctionnelle comptable reste une décision de configuration Finance de l’entreprise.

## Sécurité et audit

Toutes les mutations Retail appliquent :

1. session active ;
2. organisation cliente active ;
3. appartenance à l’organisation ;
4. module canonique, dépendances et abonnement ;
5. permission de poste ;
6. contrôle same-origin ;
7. validation Zod ;
8. rate limiting ;
9. transaction Prisma en isolation sérialisée pour les opérations sensibles ;
10. événements opérationnels, logs API et audit.

Les numéros clients sont masqués dans les payloads de liste/dashboard. Les annulations conservent toujours l’opération originale.

## Mise en production

Les migrations `20260807050000_retail_telco_mobile_money` et `20260807060000_shop_onboarding_retail_provisioning` sont additives. La production reste pilotée par la CI/CD du dépôt : PR vers `main`, Quality Gates, merge, puis `prisma migrate deploy` avant le build Vercel.

L’E2E métier réel du shop et la confirmation finale en production restent à faire par le propriétaire après déploiement ; ils ne sont pas auto-déclarés comme validés par le code.
