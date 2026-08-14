# ERP Retail — Shop 2.0 / Télécom & Mobile Money

## Statut produit

Secteur : `COMMERCE_RETAIL`

Profil métier par défaut pour les nouveaux tenants : `RETAIL_CORE`

Profil spécialisé rétrocompatible : `RETAIL_TELCO_MOBILE_MONEY`

Template : Commerce Retail v2

Plan minimal opérationnel : `BUSINESS`

Statut commercial du Shop déjà accepté : `COMMERCIAL_READY`

Programme d’évolution en cours : **Shop 2.0 — itération 1/4** (`#122`, `#123`).

`COMMERCIAL_READY` provient de l’acceptation propriétaire déjà réalisée sur le périmètre Shop précédent. Shop 2.0 ne doit pas être présenté comme `COMMERCIAL_READY_GLOBAL` tant que les quatre itérations et leurs preuves comportementales ne sont pas terminées. La CI ne peut promouvoir seule un statut commercial.

## Architecture Shop 2.0

Le Retail Core devient le socle neutre de `COMMERCE_RETAIL` :

- `RETAIL_POS` — point de vente ;
- `RETAIL_DAILY_CLOSE` — clôture magasin ;
- catalogue, sites, inventaire, achats, CRM et Finance issus des domaines ERP communs.

Les capacités suivantes deviennent des extensions spécialisées optionnelles :

- `MOBILE_MONEY_AGENCY` ;
- `TELCO_TOPUPS`.

Un nouveau tenant Retail ne reçoit plus automatiquement des opérateurs Mobile Money ou Télécom. Un tenant existant portant le profil `RETAIL_TELCO_MOBILE_MONEY` conserve son profil et ses providers afin d’éviter toute régression.

## Sources de vérité

Le Shop s’appuie exclusivement sur les sources ERP Core DTSC :

- `CATALOG` pour les produits, services, forfaits et prix de référence ;
- `SITES_WAREHOUSES` pour les boutiques, dépôts et emplacements ;
- `INVENTORY_LOGISTICS` pour les stocks et mouvements ;
- `SUPPLIERS_PURCHASES` pour fournisseurs, achats et réapprovisionnement ;
- CRM / `EnterpriseBusinessParty` pour les clients ;
- Finance/Trésorerie/Caisse pour les comptes `CASH`, `MOBILE_MONEY`, `BANK` et `CLEARING` ;
- Finance Inventory pour la valorisation du stock et le coût des ventes ;
- les modèles `EnterpriseRetail*` pour la vérité opérationnelle POS, Mobile Money, Télécom et clôture.

Aucune nouvelle opération Retail n’écrit dans `EnterpriseCoreRecord`. Les anciens modules Commerce (`PRODUCTS`, `SALES`, `CASH_REGISTER`, `STOCK`, `CUSTOMERS`, `SUPPLIERS`, `PURCHASE_ORDERS`, `INVENTORY`, `PROMOTIONS`, `SALES_REPORTS`) restent désactivés ; `PROMOTIONS` ne doit pas être réactivé tant que le moteur promotionnel Shop 2.0 de l’itération 2 n’est pas livré.

## Provisionnement du Shop

L’application du template canonique `COMMERCE_RETAIL` synchronise `EnterpriseRetailConfiguration` de façon idempotente.

Pour un nouveau tenant :

- profil `RETAIL_CORE` ;
- devise de base issue en priorité de la devise fonctionnelle Finance ;
- aucun wallet ou opérateur imposé ;
- aucun compte, float ou solde inventé.

Pour un tenant déjà spécialisé :

- le profil reconnu est conservé ;
- les mappings financiers existants restent conservés ;
- le profil `RETAIL_TELCO_MOBILE_MONEY` continue d’activer les providers spécialisés historiques.

La migration Shop 2.0 change uniquement la valeur par défaut SQL de `EnterpriseRetailConfiguration.profileCode` vers `RETAIL_CORE`. Elle ne réécrit pas les profils existants.

### Wallets Mobile Money du profil spécialisé

- `MPESA` — M-Pesa ;
- `ORANGE_MONEY` — Orange Money ;
- `AIRTEL_MONEY` — Airtel Money ;
- `AFRIMONEY` — Afrimoney.

Ils sont de type `MOBILE_MONEY`. Depuis #307, un opérateur n’est plus limité à un seul compte : ses wallets financiers sont mappés par devise dans `EnterpriseRetailProviderAccount`. En RDC, la readiness attend au minimum un wallet `CDF` et un wallet `USD` par opérateur actif. Le champ historique `mobileMoneyFloatAccountId` est conservé uniquement pendant la fenêtre de compatibilité et n’est plus l’autorité des nouvelles transactions.

### Opérateurs réseau Télécom du profil spécialisé

- `VODACOM` — Vodacom ;
- `ORANGE` — Orange ;
- `AIRTEL` — Airtel ;
- `AFRICELL` — Africell.

Ils sont de type `TELCO` et utilisent `telcoFloatAccountId`.

La séparation réseau/wallet est intentionnelle : par exemple Vodacom est l’opérateur réseau tandis que M-Pesa est un wallet Mobile Money.

## Gate de commercialisabilité

Le contrat générique est décrit dans `docs/SECTOR_ONBOARDING_COMMERCIAL_READINESS.md` et piloté par `lib/enterprise/sector-onboarding-readiness.json`.

La QA Retail contrôle désormais également les fondations Shop 2.0 :

- nouveau profil par défaut `RETAIL_CORE` ;
- préservation des profils existants ;
- Mobile Money et Télécom non obligatoires pour la clôture Retail Core ;
- migration additive sans réécriture des tenants existants ;
- recherche POS serveur paginée ;
- dashboard réellement scoped au module ;
- rate limiting par module et action ;
- batch-loading catalogue, inventaire, comptes et sessions du chemin POS ;
- posting comptable vente / annulation ;
- valorisation `COGS / INVENTORY` via le moteur Finance Inventory commun ;
- idempotence et isolation `Serializable` ;
- absence de réactivation des domaines legacy.

Le gate est exécuté sur la base Quality Gate migrée et sur une base reconstruite depuis zéro.

## Point de vente — `RETAIL_POS`

Le backend supporte jusqu’à 200 lignes et 8 moyens de paiement par ticket.

### Recherche catalogue et scalabilité

Shop 2.0 introduit `GET /api/enterprise/[organizationId]/retail/products/search` :

- recherche serveur par nom, code et SKU ;
- pagination ;
- validation tenant-scoped du dépôt ;
- disponibilité calculée depuis `quantityOnHand - quantityReserved`.

Le raccordement complet de cette recherche au workspace POS est encore un travail de l’itération 1. Tant qu’il n’est pas terminé, l’interface actuelle peut encore utiliser son bootstrap catalogue historique.

Le chemin d’écriture de la vente ne fait plus une requête catalogue et inventaire par ligne : les articles, inventaires, comptes de tender et sessions cash sont chargés en lots avant les mutations.

### Protection commerciale du prix

Le serveur charge le prix indicatif du catalogue avant de finaliser le ticket. Dans le périmètre actuel, une différence de prix, une remise manuelle, une taxe manuelle ou un article sans prix de référence est considérée comme une dérogation commerciale.

Une dérogation :

1. est refusée à un utilisateur sans droit d’administration du module ;
2. exige un motif ;
3. est enregistrée dans l’audit du ticket.

Ce comportement sera remplacé/complété par le Pricing & Tax Engine de l’itération 2. Le frontend ne constitue jamais la source d’autorité d’un prix modifié.

### Comptabilité POS Shop 2.0

Une vente POS réussie déclenche désormais le moteur comptable commun :

- débit des comptes de tender réellement liés ;
- crédit `SALES_REVENUE` ;
- crédit `TAX_PAYABLE` lorsqu’une taxe existe ;
- valorisation de chaque sortie de stock par le moteur Finance Inventory ;
- débit `COST_OF_SALES` / crédit `INVENTORY` pour la sortie valorisée.

Le posting est idempotent. L’écriture opérationnelle de vente et le posting comptable sont des transactions idempotentes séparées : si le posting échoue après la création de la vente, le retry avec la même clé retrouve la vente existante et tente de finaliser la comptabilité sans recréer le ticket.

Pour une annulation complète :

- le revenu et la taxe sont inversés ;
- les tenders sont crédités ;
- le stock est réintégré ;
- le coût est restauré sur la base du coût original de sortie ;
- `INVENTORY` est débité et `COST_OF_SALES` crédité.

Les scénarios de valorisation multi-devise doivent encore être couverts par les preuves comportementales de l’itération 1 avant toute revendication de certification comptable mondiale.

### Ticket

Après succès, le ticket affiche numéro, total et lignes et peut être imprimé ou partagé depuis les capacités du navigateur. L’annulation complète demeure non destructive et auditée. Les retours partiels et échanges appartiennent à l’itération 2.

## Agence Mobile Money — `MOBILE_MONEY_AGENCY`

Cette capacité est une extension Retail optionnelle.

L’agent sélectionne l’opérateur, le type `DEPOSIT`/`WITHDRAWAL`, le téléphone, le principal, les frais/commissions et la référence opérateur. Le wallet financier n’est pas choisi arbitrairement par l’agent : la devise de la caisse ouverte détermine la devise de l’opération et le serveur résout le wallet du même opérateur dans cette devise.

### Comptes opérateur multi-devise

`EnterpriseRetailProviderAccount` est la source canonique des wallets Mobile Money. Un mapping associe :

- une organisation ;
- un opérateur ;
- l’usage `MOBILE_MONEY_FLOAT` ;
- une devise ;
- un compte financier `MOBILE_MONEY` actif dans cette devise.

L’unicité `organizationId + providerId + accountUse + currencyCode` interdit deux mappings concurrents pour la même devise d’un opérateur.

En RDC, chaque opérateur actif est considéré prêt lorsque `CDF` et `USD` sont tous les deux configurés. Hors RDC, le mécanisme reste générique et la readiness attend au moins deux devises explicitement mappées. Aucun compte, devise, taux ou solde n’est créé silencieusement.

Le serveur impose notamment :

- validation et normalisation internationale du téléphone ;
- référence opérateur obligatoire lorsque le workflow l’exige ;
- protection unique `organizationId + providerCode + externalReference` ;
- idempotence ;
- tenant isolation ;
- rate limiting spécifique à l’action ;
- résolution serveur du wallet par opérateur + devise ;
- revalidation du compte financier : même tenant, type `MOBILE_MONEY`, devise correcte, statut actif.

Effets :

- `DEPOSIT` : cash augmente, float opérateur de la même devise diminue du principal ;
- `WITHDRAWAL` : cash diminue, float opérateur de la même devise augmente du principal ;
- un frais encaissé en cash reste séparé du principal ;
- la commission opérateur déclarée reste une donnée opérationnelle tant qu’aucun crédit réel de commission n’a été constaté.

Une annulation réutilise les identifiants de comptes enregistrés sur la transaction d’origine. Un changement ultérieur du mapping CDF/USD ne peut donc pas déplacer le reversal sur un autre wallet.

### Comptabilité Mobile Money

Les opérations Mobile Money utilisent le moteur Finance commun et le journal `MM` de type `MOBILE_MONEY`.

Événements de posting :

- `RETAIL_MOBILE_MONEY_POSTED` ;
- `RETAIL_MOBILE_MONEY_REVERSED` ;
- `RETAIL_MOBILE_MONEY_FX_POSTED` ;
- `RETAIL_MOBILE_MONEY_FX_REVERSED`.

Pour un dépôt/retrait, les lignes utilisent les vrais `ledgerAccountId` des comptes cash et Mobile Money. Lorsque les effets cash et float diffèrent parce qu’un frais a réellement été encaissé, la différence est comptabilisée via `SERVICE_REVENUE`. Le finalizer est idempotent et identique pour le mode manuel et les confirmations provider connectées.

### Transfert entre devises du même opérateur

Un agent autorisé peut convertir du float entre deux wallets de devises différentes appartenant au même opérateur.

Le serveur :

1. résout les deux mappings depuis un seul `providerId` ;
2. refuse une paire de devises identiques ;
3. résout le taux courant via le service Finance canonique `resolveExchangeRateDetails(...)` ;
4. refuse la conversion si aucun taux explicite applicable n’existe ;
5. calcule le montant cible ;
6. contrôle le solde source ;
7. verrouille les deux comptes dans un ordre déterministe ;
8. débite le wallet source et crédite le wallet cible atomiquement ;
9. crée les mouvements `EnterpriseTreasuryTransaction` ;
10. snapshotte le taux réellement utilisé ;
11. finalise le posting comptable Mobile Money.

`EnterpriseMobileMoneyFxTransfer` conserve les deux comptes, les deux devises, les deux montants, le taux, sa date/source, l’opérateur, l’agent, la clé d’idempotence et les données de reversal. Le contrat ne possède pas de `targetProviderCode` : un transfert inter-opérateurs est explicitement hors périmètre.

L’annulation d’un transfert FX est non destructive : elle inverse les soldes, crée les mouvements Treasury de reversal et poste l’écriture comptable inverse, sous contrôle de révision et de solde.

### UX

L’interface `MOBILE_MONEY_AGENCY` affiche chaque opérateur une seule fois. Sa carte montre les wallets configurés par devise, leur compte, leur solde et l’état `Prêt` / `À compléter`. En RDC, les lignes CDF et USD sont visibles ensemble.

Dans Mobile Money, toutes les sessions de caisse `OPEN` du cashier sur des comptes distincts sont affichées comme cartes sélectionnables. En RDC, la paire CDF + USD est recommandée. Le cashier peut ouvrir une autre caisse sans fermer la première, puis basculer en un toucher entre ses caisses. La caisse sélectionnée fixe la devise de l’opération ; seuls les opérateurs possédant un wallet dans cette devise sont proposés. Changer de caisse invalide tout brouillon de confirmation non confirmé. Le récapitulatif montre explicitement la caisse, le wallet et la devise qui seront utilisés.

En fin de journée, chaque caisse `OPEN` est comptée et soumise séparément. Le service Finance canonique recalcule le théorique, vérifie le total des coupures et exige un motif d’écart avant passage en `PENDING_VALIDATION`. L’approbation ou le rejet reste un acte Finance indépendant : le cashier ne peut pas auto-valider sa clôture.

La section `Transfert entre devises` affiche avant confirmation le taux Finance courant, le montant cible, le solde disponible et la date/source du taux. Les surfaces sont localisées FR/EN et conçues pour mobile/desktop et modes clair/sombre DTSC.

## Télécom & forfaits — `TELCO_TOPUPS`

Cette capacité est une extension Retail optionnelle.

### Comptes opérateur multi-devise

`EnterpriseRetailProviderAccount` est également la source canonique des comptes opérateur Télécom. Pour cet usage, `accountUse = TELCO_FLOAT` associe une organisation, un réseau, une devise et un vrai compte financier compatible (`MOBILE_MONEY` ou `CLEARING`).

Un même réseau reste affiché une seule fois mais peut disposer de plusieurs comptes par devise. En RDC, la readiness attend au minimum **CDF + USD** pour chaque réseau actif ; hors RDC, au moins deux devises explicitement configurées sont attendues. Le champ historique `telcoFloatAccountId` reste uniquement un pont de compatibilité pendant le cutover et n’est plus l’autorité des nouvelles recharges.

La devise d’une recharge est déterminée par le compte d’encaissement réellement utilisé :

- paiement en espèces : la caisse `OPEN` sélectionnée fixe la devise ;
- paiement non-cash : le compte financier d’encaissement sélectionné fixe la devise.

Le serveur revalide ce compte puis résout le compte opérateur par `organizationId + provider + TELCO_FLOAT + currencyCode`. Le navigateur ne peut donc pas imposer arbitrairement `operatorFloatAccountId`. Si aucun compte opérateur n’existe dans la devise d’encaissement, la recharge est refusée avant tout mouvement financier.

Lorsqu’une offre Catalogue porte une devise explicite, elle doit correspondre à la devise d’encaissement. Une recharge `SUCCESS` crédite l’encaissement du prix de vente et débite uniquement le compte opérateur de la même devise du coût opérateur. Une opération `FAILED` ne modifie pas les soldes.

L’annulation reste historique et non destructive : `EnterpriseTelcoTopup.operatorFloatAccountId` et `tenderFinancialAccountId` mémorisent les comptes réellement utilisés au moment de l’opération. Une reconfiguration ultérieure CDF/USD ne peut donc pas déplacer un reversal sur un autre compte.

### UX Télécom

Chaque carte réseau affiche ses comptes configurés par devise avec leur état de readiness. Pour une recharge cash, l’agent peut garder plusieurs caisses ouvertes en parallèle — notamment CDF et USD — et basculer en un toucher. Pour un encaissement non-cash, le choix du compte change immédiatement la devise et la liste des réseaux éligibles. Le récapitulatif avant confirmation affiche le réseau, la devise, le compte d’encaissement et le compte opérateur résolu.

Le mode connecté conserve la même autorité serveur : la confirmation provider converge vers `createTelcoTopup(...)`, qui résout à nouveau le mapping canonique avant de matérialiser les effets financiers.

## Sessions de caisse

Les sessions de caisse restent des objets Finance séparés par compte financier. Le POS conserve son contexte de caisse usuel. Dans `MOBILE_MONEY_AGENCY` et `TELCO_TOPUPS`, un même cashier peut garder plusieurs sessions `OPEN` en parallèle lorsque les comptes cash sont distincts, par exemple une caisse CDF et une caisse USD en RDC. Les interfaces opérateur exposent toutes ses caisses ouvertes, permettent d’en choisir une comme caisse opérationnelle et d’en ouvrir une autre sans fermer la première.

Sans caisse `OPEN` sélectionnée, une opération Mobile Money qui exige du cash est bloquée. Pour le POS, un paiement cash reste bloqué sans sa session de caisse active. Les autres paiements utilisent leurs comptes réellement configurés selon le flux.

Une session `CLOSING` ou `PENDING_VALIDATION` n’est jamais une caisse utilisable pour de nouvelles opérations. Chaque caisse utilisée dans les parcours Mobile Money ou Télécom est comptée et soumise séparément en fin de journée, puis suit l’approbation Finance indépendante existante.

## Clôture journalière — `RETAIL_DAILY_CLOSE`

La clôture Retail Core dépend du POS, pas de l’extension Mobile Money.

Elle conserve :

- comptage des coupures cash ;
- théorique depuis fonds d’ouverture + entrées - sorties ;
- floats déclarés lorsqu’ils existent ;
- motif obligatoire pour chaque écart ;
- soumission et validation indépendante ;
- interdiction d’auto-validation ;
- posting Finance des écarts approuvés.

Les devises sont conservées séparément.

## Reporting multi-devise et FX

Le dashboard commercial calcule les agrégats par `currencyCode` au niveau Prisma et ne mélange jamais nominalement les devises.

La plateforme possède également la gouvernance de taux de change Shop et une readiness FX permettant la consolidation historique lorsqu’un taux explicite et la configuration Finance sont disponibles. Une absence de taux ne doit jamais être compensée par une conversion implicite.

Les transferts Mobile Money entre devises utilisent exactement cette source Finance canonique et mémorisent le taux réellement appliqué ; ils ne définissent pas un second référentiel FX Retail.

## RBAC Shop

Le catalogue d’administration `COMMERCE_RETAIL` utilise `RETAIL_PERMISSION_CATALOG` et ne retombe pas sur les permissions Healthcare.

Postes standards actuels :

- `STORE_MANAGER` ;
- `SALES_MANAGER` ;
- `SELLER` ;
- `CASHIER` ;
- `MOBILE_MONEY_AGENT` ;
- `STOCK_KEEPER` ;
- `STOCK_MANAGER` ;
- `PURCHASE_MANAGER` ;
- `RETAIL_CONTROLLER`.

`PURCHASE_MANAGER` possède aussi les permissions fournisseurs/achats `enterprise.suppliers.view`, `enterprise.suppliers.manage` et `enterprise.purchases.manage`.

Les permissions commerciales plus granulaires (price override, discount thresholds, retours, remboursements) appartiennent à l’itération 2.

Pour #307, lecture/preview utilisent `read`, une opération client utilise `submit` et la configuration des wallets, les transferts FX et leurs annulations exigent `manage`.

## Mise en service guidée

Le dashboard Shop expose les contrôles de readiness nécessaires au profil et aux extensions activées : profil, site/dépôt, catalogue, caisse, FX, rôles de contrôle et mappings opérateurs lorsqu’ils sont utilisés.

Pour Mobile Money en RDC, la readiness vérifie désormais explicitement CDF + USD pour chaque opérateur actif. Hors RDC, elle vérifie au moins deux devises configurées par opérateur. Ces états servent à guider l’onboarding et à empêcher la documentation commerciale de masquer une configuration incomplète.

## Offres

### Starter — Shop Essentials

Préparation du catalogue, des clients et documents. Les modules Retail opérationnels restent Business minimum selon le registre actuel.

### Business — Shop Operations

Socle recommandé : sites, stock, fournisseurs/achats, Finance/caisse, POS, clôture et rapports. Mobile Money et Télécom peuvent être activés comme extensions lorsque le commerce en a besoin.

### Enterprise — Shop Scale

Reprend Business et vise une organisation plus large, multisite, davantage d’utilisateurs et de gouvernance. Les évolutions omnicanal, offline et multi-store avancées sont prévues dans l’itération 4.

## Programme Shop 2.0

Le programme de professionnalisation est suivi dans GitHub :

1. **Itération 1/4** — Retail Core, internationalisation, comptabilité POS, performance et QA P0 ;
2. **Itération 2/4** — pricing, fiscalité, promotions, retours et contrôle commercial ;
3. **Itération 3/4** — customer retail, fidélité, paiements, hardware et opérateurs ;
4. **Itération 4/4** — offline, omnicanal, multi-store, country packs et certification globale.

La certification finale sera fondée sur des preuves CI/E2E et une acceptation explicite, pas sur la seule présence des fonctionnalités dans le code.

## Références #307

- `docs/ISSUE_307_MOBILE_MONEY_MULTICURRENCY_ACCOUNTS.md` — contrat détaillé du hotfix multi-devise ;
- issue #307 — implémentation ;
- issue #309 — retrait futur du champ legacy `mobileMoneyFloatAccountId` après preuve du cutover production.
