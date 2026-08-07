# ERP Retail — Télécom & Mobile Money

## Statut produit

Secteur : `COMMERCE_RETAIL`

Profil métier : `RETAIL_TELCO_MOBILE_MONEY`

Template : Commerce Retail v2

Plan minimal opérationnel : `BUSINESS`

Statut de commercialisation automatisé : `RELEASE_CANDIDATE`

`COMMERCIAL_READY` reste une décision manuelle du propriétaire après l’acceptation réelle du parcours client. La CI ne peut pas promouvoir ce statut automatiquement.

## Sources de vérité

Le Shop s’appuie exclusivement sur les sources ERP Core DTSC :

- `CATALOG` pour les produits, services, forfaits et prix de référence ;
- `SITES_WAREHOUSES` pour les boutiques, dépôts et emplacements ;
- `INVENTORY_LOGISTICS` pour les stocks et mouvements ;
- `SUPPLIERS_PURCHASES` pour fournisseurs, achats et réapprovisionnement ;
- Finance/Trésorerie/Caisse pour les comptes `CASH`, `MOBILE_MONEY`, `BANK` et `CLEARING` ;
- les modèles `EnterpriseRetail*` pour la vérité opérationnelle POS, Mobile Money, Télécom et clôture.

Aucune nouvelle opération Retail n’écrit dans `EnterpriseCoreRecord`. Les anciens modules Commerce (`PRODUCTS`, `SALES`, `CASH_REGISTER`, `STOCK`, `CUSTOMERS`, `SUPPLIERS`, `PURCHASE_ORDERS`, `INVENTORY`, `PROMOTIONS`, `SALES_REPORTS`) restent désactivés ; `PROMOTIONS` ne doit pas être réactivé tant qu’un vrai module promotionnel n’est pas livré.

## Provisionnement automatique du Shop

L’application du template canonique `COMMERCE_RETAIL` synchronise `EnterpriseRetailConfiguration` en profil `RETAIL_TELCO_MOBILE_MONEY` et provisionne les opérateurs sans inventer de compte, float ni solde.

Le provisioning est idempotent et conserve les mappings financiers déjà renseignés.

### Wallets Mobile Money

- `MPESA` — M-Pesa ;
- `ORANGE_MONEY` — Orange Money ;
- `AIRTEL_MONEY` — Airtel Money ;
- `AFRIMONEY` — Afrimoney.

Ils sont de type `MOBILE_MONEY` et utilisent `mobileMoneyFloatAccountId`.

### Opérateurs réseau Télécom

- `VODACOM` — Vodacom ;
- `ORANGE` — Orange ;
- `AIRTEL` — Airtel ;
- `AFRICELL` — Africell.

Ils sont de type `TELCO` et utilisent `telcoFloatAccountId`.

La séparation réseau/wallet est intentionnelle : par exemple Vodacom est l’opérateur réseau tandis que M-Pesa est un wallet Mobile Money. La migration Release Candidate transfère un éventuel ancien mapping Télécom placé sur un wallet vers le réseau correspondant avant de spécialiser les providers.

## Gate de commercialisabilité

Le contrat générique est décrit dans `docs/SECTOR_ONBOARDING_COMMERCIAL_READINESS.md` et piloté par `lib/enterprise/sector-onboarding-readiness.json`.

Pour le Shop, la CI bloque si un des contrats Release Candidate disparaît :

- panier POS multi-articles ;
- protection serveur du prix/remise/taxe ;
- wallets et réseaux Télécom séparés ;
- référence opérateur protégée contre les doublons ;
- normalisation et confirmation du téléphone ;
- caisse et floats résolus automatiquement dans le flux agent ;
- session de caisse visible ;
- RBAC Retail correct ;
- reporting séparé par devise ;
- checklist de mise en service persistante.

Le gate est exécuté sur la base de Quality Gate migrée et sur une base reconstruite depuis zéro.

## Point de vente — `RETAIL_POS`

Le backend supporte jusqu’à 200 lignes et 8 moyens de paiement par ticket. La Release Candidate expose désormais un panier multi-articles dans l’interface Shop : recherche nom/code/SKU, stock disponible par dépôt, quantités, panier, total et encaissement.

Le paiement cash utilise automatiquement la session de caisse ouverte par le collaborateur. Le paiement fractionné reste supporté.

### Protection commerciale du prix

Le serveur charge le prix indicatif du catalogue avant de finaliser le ticket. Une différence de prix, une remise manuelle, une taxe manuelle ou un article sans prix de référence est considérée comme une dérogation commerciale.

Une dérogation :

1. est refusée à un utilisateur sans droit d’administration du module ;
2. exige un motif ;
3. est enregistrée dans l’audit du ticket.

Le frontend ne constitue donc jamais la source d’autorité d’un prix modifié.

### Ticket

Après succès, le ticket affiche numéro, total et lignes et peut être imprimé ou partagé depuis les capacités du navigateur. L’annulation demeure non destructive : `RETURN_IN` pour le stock et contre-mouvements de trésorerie.

## Agence Mobile Money — `MOBILE_MONEY_AGENCY`

L’agent sélectionne un wallet, le type `DEPOSIT`/`WITHDRAWAL`, le téléphone, le principal, les frais/commissions et la référence fournisseur.

Il ne sélectionne plus le compte de float pendant l’opération : le float est résolu depuis `EnterpriseRetailProvider.mobileMoneyFloatAccountId`.

Le compte cash est résolu depuis la session de caisse ouverte par l’agent.

La Release Candidate impose :

- téléphone normalisé ;
- écran de confirmation ;
- référence opérateur obligatoire ;
- protection unique `organizationId + providerCode + externalReference` pour les nouvelles opérations ;
- clé d’idempotence stable pendant une tentative UI ;
- bouton désactivé pendant le traitement.

Effets :

- `DEPOSIT` : cash augmente, float diminue du principal ;
- `WITHDRAWAL` : cash diminue, float augmente du principal ;
- frais et commission restent séparés.

DTSC enregistre et rapproche actuellement l’opération ; il ne déclenche pas encore l’API de l’opérateur.

## Télécom & forfaits — `TELCO_TOPUPS`

Le vendeur choisit l’opérateur réseau, le numéro, l’offre, le prix, le coût fournisseur et le mode d’encaissement.

Le float Télécom est résolu automatiquement depuis le réseau configuré ; il n’est pas choisi manuellement par l’agent.

Une recharge `SUCCESS` exige une référence opérateur. Le téléphone normalisé et le montant sont affichés dans une confirmation finale avant écriture.

Une recharge réussie crédite l’encaissement et débite le float du coût opérateur. Une opération `FAILED` ne débite pas le float.

## Session de caisse

La session active est visible en permanence dans les surfaces opérationnelles Shop. Le bandeau indique le compte, la devise, le fonds d’ouverture, le solde opérationnel et le statut.

Sans caisse active :

- un paiement POS cash est bloqué ;
- une opération Mobile Money est bloquée ;
- les autres paiements peuvent utiliser leurs comptes réellement configurés si le flux le permet.

Une session `PENDING_VALIDATION` n’est pas présentée comme une caisse utilisable.

## Clôture journalière — `RETAIL_DAILY_CLOSE`

La clôture conserve :

- comptage des coupures cash ;
- théorique depuis fonds d’ouverture + entrées - sorties ;
- floats déclarés contre les soldes opérationnels ;
- motif obligatoire pour chaque écart ;
- soumission et validation indépendante ;
- interdiction d’auto-validation ;
- posting Finance des écarts approuvés.

Les devises sont toujours conservées séparément.

## Reporting multi-devise

Le dashboard commercial calcule les agrégats par `currencyCode` au niveau Prisma : ventes, dépôts, retraits, commissions, chiffre Télécom et marge.

Il est interdit de présenter `100 000 CDF + 20 USD` comme `100 020 CDF`. Une consolidation en devise fonctionnelle ne pourra être ajoutée qu’avec un taux de change explicite et une règle comptable définie.

## RBAC Shop

Le catalogue d’administration `COMMERCE_RETAIL` utilise maintenant `RETAIL_PERMISSION_CATALOG` et ne retombe plus sur les permissions Healthcare.

Postes standards :

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

## Mise en service guidée

Le dashboard Shop expose des contrôles persistants : profil actif, site/dépôt, catalogue, caisse, wallet Mobile Money mappé, réseau Télécom mappé et rôles de contrôle.

Ces états servent à guider l’onboarding et à empêcher la documentation commerciale de masquer une configuration incomplète.

## Offres

### Starter — Shop Essentials

Préparation du catalogue, des clients et documents. Les quatre modules Retail opérationnels restent Business minimum.

### Business — Shop Operations

Minimum recommandé pour exploitation réelle : sites, stock, fournisseurs/achats, finance/caisse, POS, Mobile Money, Télécom, clôture et rapports.

### Enterprise — Shop Scale

Reprend Business et vise une organisation plus large, multisite, davantage d’utilisateurs et de gouvernance. Les quatre modules Retail eux-mêmes ne nécessitent pas Enterprise.

## Acceptation propriétaire avant `COMMERCIAL_READY`

L’E2E métier réel doit encore être exécuté par le propriétaire sur un tenant de validation :

1. création/sectorisation et abonnement ;
2. invitation de l’administrateur ;
3. site/dépôt/catalogue/stock ;
4. comptes cash et floats ;
5. mappings wallets et réseaux ;
6. ouverture de caisse ;
7. ticket POS multi-articles et paiement fractionné ;
8. tentative de dérogation prix vendeur puis dérogation responsable ;
9. dépôt et retrait Mobile Money + protection de référence en doublon ;
10. recharge Télécom SUCCESS/FAILED + confirmation du numéro ;
11. test CDF et USD sans somme inter-devise ;
12. clôture et validation par une autre personne ;
13. guides FR/EN ;
14. viewports mobiles 320–414 px et desktop.

La CI prouve les contrats automatisables. Elle ne remplace pas cette acceptation réelle et ne marque pas automatiquement le secteur `COMMERCIAL_READY`.
