# ERP Gaming Lounge — architecture et programme

## Statut

- Programme : #638
- Fondation fusionnée : #639
- Postes de jeu fusionnés : #640
- Sessions fusionnées : #641
- Réservations fusionnées : #642
- Tarification fusionnée : #643
- Lot courant : #644 — checkout, paiements, reçus et clôture Gaming
- Secteur canonique : `HOSPITALITY_EVENTS`
- Sous-secteur : `GAMING_LOUNGE`
- Classification du sous-secteur : `PLANNED` jusqu’au lot d’onboarding #646
- Modules fonctionnels isolés en `BETA` : `GAMING_STATIONS`, `GAMING_SESSIONS`, `GAMING_BOOKINGS`, `GAMING_PRICING_PACKAGES`, `GAMING_CHECKOUT`, `GAMING_DAILY_CLOSE`
- Statut commercial global : non `COMMERCIAL_READY`

Le sous-secteur reste **fail-closed** pour l’onboarding commercial normal jusqu’à #646. Chaque lot ne promeut en `BETA` que le module réellement implémenté et prouvé.

## Objectif métier

Un Gaming Lounge vend principalement du temps d’utilisation de postes physiques — consoles, écrans et périphériques — et doit gérer postes, sessions minutées, réservations, tarifs/forfaits, encaissements, clôtures, tournois, maintenance, reporting et IA autorisée.

DTSC Platform ne modélise pas ce métier comme un second Shop ni comme un ERP parallèle. Gaming spécialise les domaines communs déjà présents.

## Sources de vérité

| Besoin | Source canonique |
|---|---|
| Console, TV, manette, onduleur, équipement | `EnterpriseAsset` / `ASSETS_MAINTENANCE` |
| Client/joueur identifié | `EnterpriseBusinessParty` / `CRM_CUSTOMERS` |
| Service vendu / offre commerciale | `EnterpriseCatalogItem` / `CATALOG` |
| Prix de référence commercial | `EnterpriseCatalogPrice` / `CATALOG` |
| Devise autorisée | `EnterpriseCurrency` + service Finance canonique |
| Site physique et timezone | `EnterpriseSite` porté par l’`EnterpriseAsset` du poste |
| Facture client | `EnterpriseSalesInvoice` / `FINANCE_RECEIVABLES` |
| Créance | `EnterpriseReceivable` / `FINANCE_RECEIVABLES` |
| Paiement / remboursement | `EnterprisePayment` / `FINANCE_PAYMENTS` |
| Allocation paiement-créance | `EnterprisePaymentAllocation` / `FINANCE_PAYMENTS` |
| Compte, caisse, banque, Mobile Money | `EnterpriseFinancialAccount` / `FINANCE_TREASURY` |
| Session de caisse | `EnterpriseCashSession` / `FINANCE_CASH` |
| Mouvement réel de trésorerie | `EnterpriseTreasuryTransaction` / Finance commune |
| Stock de snacks/accessoires | `EnterpriseInventoryItem` + mouvements Inventory communs |
| Rapports | framework `REPORTS` |

Interdictions durables : aucun `GamingAsset`, `GamingCustomer`, `GamingCatalog`, `GamingCurrency`, `GamingPayment`, `GamingCashAccount`, `GamingInvoice` ni stock Gaming parallèle. Une réservation Gaming ne possède pas non plus un second `siteId` : le site est dérivé de l’actif canonique du poste.

Toutes les références cross-domain sont revalidées avec le même `organizationId`. Un UUID valide appartenant à un autre tenant est traité comme introuvable.

## Classification

```text
HOSPITALITY_EVENTS
└── GAMING_LOUNGE
```

`GAMING_LOUNGE` reste `PLANNED` pendant #639 à #645. Son passage à `ACTIVE` appartient à #646 et exige runtime, onboarding, permissions, activités, guides, QA et OWNER_E2E de commercial readiness.

## Registre de modules après #644

### `GAMING_STATIONS`
- `BETA`, route `/enterprise-modules/GAMING_STATIONS` ;
- workspace `ENTERPRISE_GAMING_STATIONS` ;
- permission prefix `enterprise.gaming.stations.` ;
- dépendances `ASSETS_MAINTENANCE`, `SITES_WAREHOUSES`.

### `GAMING_SESSIONS`
- `BETA`, route `/enterprise-modules/GAMING_SESSIONS` ;
- workspace `ENTERPRISE_GAMING_SESSIONS` ;
- permission prefix `enterprise.gaming.sessions.` ;
- dépendances `GAMING_STATIONS`, `CATALOG`.

### `GAMING_BOOKINGS`
- `BETA`, route `/enterprise-modules/GAMING_BOOKINGS` ;
- workspace `ENTERPRISE_GAMING_BOOKINGS` ;
- permission prefix `enterprise.gaming.bookings.` ;
- dépendances `GAMING_STATIONS`, `GAMING_SESSIONS`, `CRM_CUSTOMERS`.

### `GAMING_PRICING_PACKAGES`
- `BETA`, route `/enterprise-modules/GAMING_PRICING_PACKAGES` ;
- workspace `ENTERPRISE_GAMING_PRICING_PACKAGES` ;
- permission prefix `enterprise.gaming.pricing.` ;
- dépendances `CATALOG`, `GAMING_STATIONS`, `GAMING_SESSIONS` ;
- plan minimum `BUSINESS`, abonnement actif, `POSITION_PERMISSION`.

### `GAMING_CHECKOUT`
- `BETA`, route `/enterprise-modules/GAMING_CHECKOUT` ;
- workspace `ENTERPRISE_GAMING_CHECKOUT` ;
- permission prefix `enterprise.gaming.checkout.` ;
- dépendances `GAMING_SESSIONS`, `FINANCE_RECEIVABLES`, `FINANCE_PAYMENTS`, `FINANCE_TREASURY`, `CATALOG` ;
- plan minimum `BUSINESS`, abonnement actif, `POSITION_PERMISSION`.

### `GAMING_DAILY_CLOSE`
- `BETA`, route `/enterprise-modules/GAMING_DAILY_CLOSE` ;
- workspace `ENTERPRISE_GAMING_DAILY_CLOSE` ;
- permission prefix `enterprise.gaming.close.` ;
- dépendances `GAMING_CHECKOUT`, `FINANCE_TREASURY`, `FINANCE_CASH` ;
- plan minimum `BUSINESS`, abonnement actif, `POSITION_PERMISSION`.

Restent `PLANNED`, `HIDDEN`, `EXPLICIT_DENY` jusqu’à leurs propres lots : `GAMING_DASHBOARD`, `GAMING_TOURNAMENTS`, `GAMING_REPORTS`.

## #640 — parc extensible, jamais limité à cinq

Les cinq PlayStations du scénario initial ne sont qu’une baseline commerciale. Aucune limite technique ou produit à cinq n’existe. Une sixième console et les suivantes utilisent le même flux, la même pagination et les mêmes contrats.

`EnterpriseGamingStationProfile` ne conserve que les métadonnées Gaming. Le matériel, le site, le numéro de série, les incidents et la maintenance restent dans `EnterpriseAsset` et ses modèles associés.

## #641 — Sessions : autorité temporelle serveur

Le navigateur n’est jamais l’autorité métier du chronomètre. `EnterpriseGamingSession` persiste les **timestamps serveur** : `startedAt`, `expectedEndAt`, `pausedAt`, `endedAt`, `pausedSeconds`, `billableSeconds` et `timingPolicyJson`.

Le client peut projeter visuellement les secondes avec un intervalle local, mais resynchronise avec le serveur. La session reste la source de vérité de l’occupation. La projection DB maintient le poste `IN_USE` tant qu’une session est `ACTIVE` ou `PAUSED`.

`EnterpriseGamingSessionTransition` journalise `START`, `PAUSE`, `RESUME`, `EXTEND`, `TRANSFER`, `END` avec une `idempotencyKey` unique par organisation. Les transactions `Serializable`, la révision optimiste et l’index `GamingSession_one_live_per_station_key` protègent concurrence et idempotence.

## #642 — Réservations : CRM et actifs canoniques

`GAMING_BOOKINGS` repose sur `EnterpriseGamingBooking` et `EnterpriseGamingBookingTransition`.

Une réservation contient poste, créneau, client CRM facultatif, nombre de joueurs, notes, statut et révision. Un **joueur occasionnel** est représenté par `businessPartyId = null`; aucun `GamingCustomer` n’est créé. Si un client est fourni, il doit être un `EnterpriseBusinessParty` actif avec rôle `CUSTOMER` dans le même tenant.

Le site est toujours lu depuis `EnterpriseGamingStationProfile.assetId → EnterpriseAsset.site`. Le conflit de réservation est protégé par transaction `Serializable`, `pg_advisory_xact_lock` et trigger DB. Les créneaux adjacents sont autorisés, les chevauchements `CONFIRMED/CHECKED_IN` sont refusés.

La machine d’état #642 est :

```text
DRAFT → CONFIRMED → CHECKED_IN → CONVERTED
  │          │             │
  └──────────┴─────────────┴→ CANCELLED
             └──────────────→ NO_SHOW
```

La conversion réservation → session est atomique et l’unicité `(organizationId, bookingId)` empêche deux sessions pour une même réservation. Depuis #643, cette conversion exige aussi un service du Catalogue et passe par le même moteur tarifaire serveur avant de créer la session.

## #643 — Tarifs et forfaits : pas de catalogue parallèle

Le service vendu reste un `EnterpriseCatalogItem` actif avec `itemType = SERVICE`. `EnterpriseGamingPricingRule` ne remplace pas le catalogue : il porte seulement les conditions spécifiques au Gaming Lounge.

Une règle peut cibler : tous les postes ou un poste précis, une famille de console, un minimum/maximum de joueurs, une durée fixe, un masque de jours, une plage horaire y compris traversant minuit, une période de validité et une priorité explicite.

Modes disponibles : `FIXED_DURATION`, `PER_MINUTE`, `PER_HOUR`, `PACKAGE`.

`FIXED_DURATION` et `PACKAGE` portent un montant forfaitaire pour la durée configurée. `PER_MINUTE` et `PER_HOUR` utilisent un incrément de facturation et un arrondi serveur. Tous les montants sont calculés avec `Prisma.Decimal`.

### Résolution déterministe côté serveur

`resolveGamingPricingQuoteTx` est l’autorité tarifaire. Le serveur recharge le service et le poste same-tenant, dérive la timezone du site, filtre les règles `ACTIVE`, applique poste/famille/joueurs/jour/créneau/durée, départage par priorité puis spécificité, valide la devise Finance et calcule le montant. Il ne somme jamais deux devises et ne choisit jamais une devise inventée par le client.

### Snapshot tarifaire immuable

Quand une session démarre, la résolution tarifaire s’exécute dans la même transaction. Sont persistés `pricingRuleId`, `pricingSnapshotJson`, `currency` et `quotedAmount`. À `END`, `finalAmountFromGamingPricingSnapshot` calcule `finalAmount` depuis le snapshot et `billableSeconds`, sans relire la règle courante.

La conversion réservation → session utilise le même moteur côté serveur. Le retry de `START` ou de conversion ne rerésout pas le tarif et ne duplique pas la session.

### Dérogations tarifaires

Une dérogation exige `enterprise.gaming.pricing.manage`, un montant et un motif explicite. Montant, motif et acteur sont conservés dans le snapshot et audités.

### Simulation sans vente

`POST /api/enterprise/[organizationId]/gaming/pricing/simulate` applique le moteur sans créer session, vente, facture, paiement ou mouvement de trésorerie.

## #644 — Checkout : la Finance commune reste l’autorité

Une session tarifée terminée et possédant un `finalAmount` positif passe de `ENDED` à `TO_CHECKOUT` via `promoteEndedGamingSessionToCheckout`. Cette promotion est verrouillée, idempotente et journalisée par une transition `READY_TO_CHECKOUT`. Les anciennes sessions `ENDED` restent acceptées par le checkout pour compatibilité historique.

`EnterpriseGamingCheckout` n’est **pas** une facture ni une caisse : il ne contient que le lien opérationnel Gaming entre `sessionId` et `salesInvoiceId`, son état, sa clé d’idempotence et les métadonnées de remboursement.

Le workflow normal est :

```text
Session TO_CHECKOUT
  → EnterpriseSalesInvoice PENDING_APPROVAL
  → validation Finance indépendante
  → facture ISSUED + EnterpriseReceivable
  → un ou plusieurs EnterprisePayment
  → confirmation + EnterprisePaymentAllocation
  → invoice/checkout/session PAID
  → reçu Gaming réconcilié
```

Les états du checkout sont :

```text
INVOICE_PENDING
  → AWAITING_PAYMENT
  → PARTIALLY_PAID
  → PAID
  → REFUND_PENDING
  → REFUNDED

INVOICE_PENDING → CANCELLED
```

### Client identifié ou walk-in

Si la session référence un client, il doit rester un `EnterpriseBusinessParty` actif avec rôle `CUSTOMER`. Une session anonyme utilise un **tiers système canonique** `SYSTEM:GAMING:WALK_IN_CUSTOMER` sans donnée personnelle, nécessaire uniquement comme contrepartie comptable. Aucun `GamingCustomer` parallèle n’est créé.

### Facture et paiement exactement une fois

La préparation du checkout utilise transaction `Serializable`, verrou de session, unicité par session et `idempotencyKey`. Un retry renvoie le checkout existant au lieu de créer une seconde facture.

La facture est une `EnterpriseSalesInvoice` commune soumise au workflow d’approbation Finance. L’émission produit la créance commune. Les paiements utilisent exclusivement `createEnterprisePayment`, le workflow d’approbation Paiements, `transitionEnterprisePayment` et `allocateEnterprisePayment`.

Les paiements fractionnés sont autorisés. Avant de créer un nouveau paiement, le serveur soustrait du solde disponible les paiements déjà préparés ou confirmés afin qu’un double clic ou deux moyens de paiement concurrents ne puissent pas dépasser la créance. La clé stable `gaming-checkout:<checkoutId>:payment:<idempotencyKey>` protège les retries.

Cash, Mobile Money, banque, carte, chèque et autres moyens respectent les validations Finance existantes. Un compte financier doit être actif et de devise compatible. Un paiement CASH exige une session de caisse ouverte selon les règles Finance.

### Reçu Gaming réconcilié

Le reçu n’est pas un document financier parallèle. `getGamingCheckoutReceipt` projette : session, facture, lignes de facture, allocations confirmées, paiements confirmés/réconciliés, remboursements et avoirs. Les montants encaissés sont donc toujours traçables jusqu’à `EnterprisePayment` et `EnterprisePaymentAllocation`.

## #644 — Snacks, accessoires et Inventory commun

Le temps de jeu est la ligne `SERVICE` de la session et **ne décrémente jamais le stock**.

Des produits physiques du Catalogue peuvent être ajoutés au même checkout. Le serveur exige un `EnterpriseCatalogPrice` de vente actif dans la devise de la session. Pour un produit `trackInventory = true`, il exige un `EnterpriseInventoryItem` actif et un entrepôt canonique ; si le poste est rattaché à un site, l’entrepôt doit appartenir au même site.

La sortie utilise `applyStockMovementTx` avec :

- `movementType = SALE_FULFILLMENT` ;
- `direction = OUT` ;
- `sourceEntityType = EnterpriseGamingCheckout` ;
- une clé d’idempotence stable par ligne.

Le checkout ne choisit jamais silencieusement un lot. Si `lotTracking = true`, le flux est refusé tant qu’aucun choix explicite de lot n’est supporté par le contrat.

Une annulation avant émission ou un remboursement confirmé crée le mouvement inverse `RETURN_IN` dans Inventory, sans modifier silencieusement l’historique de la sortie initiale.

## #644 — Annulation et remboursement inverse

Une annulation directe n’est autorisée que tant que la facture n’a pas été émise. Elle annule l’approbation/facture en attente, restitue les produits suivis en stock et marque checkout/session `CANCELLED`.

Une opération déjà payée passe par le workflow de remboursement :

1. un `EnterprisePayment` sortant `REFUND` est créé et soumis à un approbateur indépendant ;
2. les allocations client confirmées sont inversées ;
3. les écritures d’allocation sont contrepassées par `reverseJournalEntryTx` avec autorisation `DOMAIN_INVERSE` ;
4. un avoir client exact est construit depuis les **montants historiques** des lignes de la facture puis comptabilisé ;
5. le remboursement est confirmé dans Finance, produit `EnterpriseTreasuryTransaction` sortant et, pour Cash, le mouvement de caisse correspondant ;
6. le posting `CUSTOMER_REFUND_CONFIRMED` est exécuté par le registre comptable ;
7. les produits physiques sont restockés ;
8. le checkout passe à `REFUNDED`.

Le demandeur du remboursement ne peut pas l’approuver lui-même. Le chemin Gaming n’écrit jamais directement une seconde trésorerie ou une seconde comptabilité.

## #644 — Clôture journalière Gaming

`EnterpriseGamingDailyClose` et `EnterpriseGamingDailyCloseLine` sont des **snapshots opérationnels de rapprochement**. Ils ne remplacent ni `EnterpriseCashSession`, ni les comptes financiers, ni les paiements.

La journée métier est calculée avec la timezone du `EnterpriseSite`. La date sélectionnée est transformée en bornes UTC correspondant à minuit → minuit local. Sans site, le fallback contrôlé est `UTC`.

Deux axes temporels sont volontairement distincts :

- les compteurs `endedSessionCount`, `paidSessionCount`, `pendingCheckoutCount`, `refundedCheckoutCount` décrivent les sessions dont `endedAt` tombe dans cette journée métier ;
- les lignes financières sélectionnent les `EnterprisePayment` dont **`paymentDate`** tombe dans cette journée, même si la session a été terminée un jour antérieur.

Cette séparation garantit qu’un paiement tardif ou un remboursement effectué aujourd’hui pour un checkout d’hier apparaît dans la clôture financière d’aujourd’hui.

Pour chaque couple `financialAccountId + methodType`, une ligne conserve :

- la `currencyCode` du compte ;
- le nombre et montant des encaissements entrants ;
- le nombre et montant des remboursements sortants ;
- `expectedAmount = inboundAmount - refundAmount` ;
- le montant déclaré ;
- l’écart ;
- le motif d’écart ;
- la session de caisse réelle lorsqu’elle est univoque.

Aucune conversion FX n’est effectuée et aucun total cross-currency n’est produit. CDF, USD ou toute autre devise restent sur des lignes séparées.

Tout écart non nul exige un motif. La personne qui soumet une clôture ne peut pas la valider elle-même. Les statuts sont `SUBMITTED`, `VALIDATED`, `REJECTED`.

La concurrence est protégée à deux niveaux : verrou advisory par organisation/site/journée et index partiels uniques `GamingDailyClose_org_date_global_active_key` / `GamingDailyClose_org_date_site_active_key`. Une même journée ne peut donc pas recevoir deux clôtures actives concurrentes pour le même périmètre.

## API #644

```text
GET/POST  /api/enterprise/[organizationId]/gaming/checkouts
GET/PATCH /api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]
GET       /api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/receipt
GET/POST  /api/enterprise/[organizationId]/gaming/daily-closes
GET/PATCH /api/enterprise/[organizationId]/gaming/daily-closes/[closeId]
```

Toutes les mutations imposent same-origin, Zod, `await rateLimit`, membership, entitlement, permissions Gaming, permissions des modules Finance/Inventory réellement touchés, `AuditLog` et `ApiLog`.

Le module Gaming ne contourne pas Finance : approuver/émettre une facture exige les capacités `FINANCE_RECEIVABLES`, créer/soumettre/approuver/confirmer un paiement exige `FINANCE_PAYMENTS`, et la clôture exige la lecture des domaines Paiements/Trésorerie/Caisse. Un remboursement comportant des produits physiques exige également l’écriture Inventory.

## UI #644

`Encaissement Gaming` fournit :

- liste, filtres, KPI et pagination ;
- sélection d’une session `TO_CHECKOUT` ou historique `ENDED` facturable ;
- approbateur Finance de facture ;
- produits physiques optionnels du Catalogue et entrepôt commun ;
- validation/émission facture ;
- paiements fractionnés ;
- sélection des comptes financiers réels ;
- approbateurs Paiements ;
- reçu réconcilié ;
- annulation avant émission ;
- demande et approbation de remboursement ;
- dialogs mobile-safe `92dvh` ;
- FR/EN.

`Clôture Gaming` fournit :

- liste, filtres, KPI et pagination ;
- choix journée/site ;
- déclarations par compte financier et moyen de paiement ;
- affichage séparé par devise ;
- entrant, remboursements, attendu, déclaré, écart ;
- validation/rejet indépendant ;
- détail plein écran ;
- dialogs mobile-safe `92dvh` ;
- FR/EN.

## Persistance et migration #644

Migration additive :

```text
prisma/migrations/20260915011000_gaming_checkout_daily_close/migration.sql
```

Elle ajoute uniquement `EnterpriseGamingCheckout`, `EnterpriseGamingDailyClose`, `EnterpriseGamingDailyCloseLine`, leurs index, contraintes d’état, FK Gaming nécessaires et guards d’unicité de clôture. Elle ne modifie ni ne remplace les tables Finance/Inventory existantes.

## Programme d’implémentation

- #639 — fondation canonique — fusionné ;
- #640 — postes / Actifs & maintenance — fusionné ;
- #641 — sessions minutées — fusionné ;
- #642 — réservations / joueurs — fusionné ;
- #643 — tarification, forfaits et calcul serveur — fusionné ;
- #644 — checkout, paiements, reçus et clôture — lot courant ;
- #645 — tournois, maintenance intégrée, reporting et DTSC AI ;
- #646 — onboarding, activités, guides, QA et commercial readiness.

## QA

- `qa-639-gaming-lounge-foundation.mjs` protège classification, sources de vérité, migration additive et fail-closed ;
- `qa-640-gaming-stations-assets.mjs` protège `EnterpriseAsset`, extensibilité >5 et UX Stations ;
- `qa-641-gaming-sessions-engine.mjs` protège timestamps serveur, concurrence, idempotence et `IN_USE` ;
- `qa-642-gaming-bookings.mjs` protège CRM, conflits, conversion et historique Booking ;
- `qa-643-gaming-pricing.mjs` protège catalogue/service canonique, devises Finance, résolution serveur, snapshot et simulation ;
- `qa-644-gaming-checkout-daily-close.mjs` protège Finance/Inventory canoniques, idempotence, paiements fractionnés, reçu, inverses remboursement, timezone, `paymentDate`, séparation des devises, clôture maker/checker, APIs, UI et absence de caisse Gaming parallèle.

#644 exige un `OWNER_E2E` avant merge couvrant au minimum : END → `TO_CHECKOUT`, checkout/retry, client CRM et walk-in, Cash, Mobile Money, paiement fractionné, dépassement interdit, reçu, Inventory physique, annulation, remboursement/inverses, paiement tardif, timezone de site, clôture par devise, écart motivé, validation indépendante, mobile/desktop, FR/EN et parc supérieur à cinq postes.

## Rollback

Pour #644 :

- repasser `GAMING_CHECKOUT` et `GAMING_DAILY_CLOSE` en `PLANNED/HIDDEN/EXPLICIT_DENY` ;
- bloquer les nouveaux checkouts, paiements déclenchés depuis Gaming et nouvelles clôtures ;
- conserver toutes les factures, créances, paiements, allocations, mouvements de trésorerie, avoirs, écritures comptables et mouvements Inventory déjà confirmés ;
- conserver les snapshots `EnterpriseGamingCheckout` / `EnterpriseGamingDailyClose` pour audit ;
- ne supprimer aucune migration ni donnée financière historique.

Le reste du domaine Gaming demeure fail-closed jusqu’à ses lots respectifs.