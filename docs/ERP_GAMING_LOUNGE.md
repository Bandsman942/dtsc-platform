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

Le snapshot distingue explicitement activité opérationnelle, événements financiers et backlog au moment de la soumission :

- `endedSessionCount` compte les sessions dont `endedAt` tombe dans la journée métier ;
- `paidSessionCount` compte les sessions Gaming distinctes dont le checkout est effectivement `PAID` et possède au moins un paiement client confirmé/réconcilié dont **`paymentDate`** tombe dans la journée, même si la session s’est terminée un jour antérieur ;
- `refundedCheckoutCount` compte les sessions/checkouts distincts effectivement `REFUNDED` avec un remboursement confirmé/réconcilié dont **`paymentDate`** tombe dans la journée ;
- `pendingCheckoutCount` est le backlog observé à la soumission : checkouts encore `INVOICE_PENDING`, `AWAITING_PAYMENT`, `PARTIALLY_PAID` ou `REFUND_PENDING`, rattachés à des sessions terminées avant la fin de la journée métier ;
- les lignes financières sélectionnent les paiements confirmés/réconciliés de la journée par `paymentDate`, puis appliquent le périmètre Gaming/site et le couple déclaré `financialAccountId + methodType`.

Les compteurs et les lignes financières sont calculés dans la même transaction après le verrou de clôture. Ils constituent donc un snapshot cohérent au moment de la soumission. Le backlog n’est pas une reconstruction rétroactive de l’état historique d’une ancienne journée ; il reflète l’état observé quand la clôture est soumise.

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

## Hotfix #690 — verrous Prisma Gaming et feedback d’erreur

Le hotfix #690 corrige une régression Production commune aux réservations, à l’encaissement et à la clôture Gaming. Ces trois parcours utilisaient `$queryRaw` pour exécuter `SELECT pg_advisory_xact_lock(...)`. PostgreSQL renvoie `void` pour cette fonction ; Prisma 6.19.x tentait de désérialiser cette colonne et levait `P2010` avant la mutation métier.

Le contrat corrigé est :

- un advisory lock transactionnel sans résultat utilise `$executeRaw` ;
- les transactions `Serializable`, l’idempotence et les guards de concurrence restent inchangés ;
- aucune migration de schéma n’est nécessaire ;
- la réservation conserve l’erreur inline mais n’émet plus deux fois le même toast global ;
- les erreurs inattendues restent génériques côté client et peuvent inclure une `supportReference` corrélable aux logs, sans exposer de message Prisma, payload ou identifiant tenant ;
- la QA #690 interdit `$queryRaw(...pg_advisory_xact_lock...)` dans le domaine Gaming et exécute réellement un advisory transaction lock via Prisma/PostgreSQL lorsqu’une `DATABASE_URL` de CI est disponible.

Le parcours OWNER_E2E requis après merge reste : réservation → check-in/session → fin de session → checkout/facture → paiement → clôture → rapports, avec Tournois vérifié en non-régression.

## Hotfix #693 — création des lignes de facture au checkout

Après #690, le checkout atteignait enfin la création de la facture Finance mais Prisma rejetait encore le nested create des lignes avec `PrismaClientValidationError: Unknown argument organizationId`.

Le contrat correct est celui déjà utilisé par le service Finance canonique : `organizationId` reste sur `EnterpriseSalesInvoice`, tandis que les objets de `items.create` ne renseignent pas directement les champs relationnels `organizationId` / `salesInvoiceId`. Prisma les propage depuis la relation composite du parent.

#693 ajoute deux preuves complémentaires :

- une QA Prisma/PostgreSQL réelle qui crée une facture avec une ligne imbriquée et vérifie que l’`organizationId` du parent est bien propagé ;
- un E2E API qui prépare deux checkouts Gaming complets jusqu’à `INVOICE_PENDING` / `PENDING_APPROVAL` : un client comptoir walk-in et un client CRM canonique.

L’audit transverse a identifié la même forme de payload dans les convergences Santé et Pharmacie. Elle est suivie séparément par #694 afin que le P0 Gaming reste ciblé et réversible.

## Hotfix #696 — contrat des transitions Session → Checkout

Le hotfix #696 corrige la divergence entre le code Gaming et la contrainte PostgreSQL `EnterpriseGamingSessionTransition_action_check`. La migration historique #641 autorisait uniquement `START`, `PAUSE`, `RESUME`, `EXTEND`, `TRANSFER` et `END`, alors que le workflow Checkout utilise aussi `READY_TO_CHECKOUT`, `CHECKOUT_OPEN`, `CHECKOUT_PAID`, `CHECKOUT_CANCELLED` et `CHECKOUT_REFUNDED`.

La correction est portée par une nouvelle migration additive qui remplace uniquement la contrainte CHECK ; aucune migration historique n’est modifiée. `GAMING_SESSION_ACTIONS` devient la liste canonique de toutes les transitions réellement persistées.

Le seuil de cinq postes reste exclusivement une baseline d’onboarding/commercial readiness (`launchBaseline: 5`). Il ne constitue pas une condition d’autorisation pour une session ou un encaissement.

La QA #696 vérifie la parité code/domaine/migration et lit la contrainte active directement dans PostgreSQL. L’acceptance Gaming renforce aussi le scénario #693 : démarrage réel de session → `END` → promotion `READY_TO_CHECKOUT` → préparation de facture, plus un scénario de compatibilité d’une ancienne session `ENDED` qui doit persister `CHECKOUT_OPEN`.

Les erreurs inattendues de checkout utilisent désormais des messages contextualisés. Une `supportReference` sûre est conservée jusqu’à `ProfessionalApiError` et reste visible dans l’interface sans exposer SQL, stack Prisma, payload ou identifiant tenant.

## Hotfix #698 — convergence Paiements ↔ Gaming et prérequis caisse

Le hotfix #698 corrige la rupture de continuité observée lorsqu’un paiement Gaming en espèces est approuvé dans le workflow commun mais reste impossible à confirmer ou à refléter dans l’encaissement Gaming.

Le contrat métier devient explicite :

- un paiement `CASH` ne peut être préparé depuis Gaming que si le compte financier sélectionné possède une `EnterpriseCashSession` `OPEN` pour le caissier qui initie le paiement ;
- le référentiel des comptes financiers expose `hasOpenCashSessionForCurrentUser` afin que l’UI Gaming masque les comptes Cash non prêts et bloque l’envoi avec un message actionnable ;
- un paiement `APPROVED` reste finalisable depuis Encaissement Gaming ; l’approbation depuis Validations ne coupe plus le parcours ;
- lorsqu’un paiement Gaming est confirmé depuis Paiements professionnels, la convergence est déclenchée immédiatement : allocation à la créance, mise à jour de la facture, puis synchronisation du checkout et de la session ;
- `PAYMENT_CONFIRMED` possède en plus un projecteur inter-modules `GAMING_PAYMENT_CONTINUITY` idempotent servant de filet de sécurité pour les confirmations provenant d’autres chemins Finance ou d’un replay de worker.

Les erreurs Finance `OPEN_CASH_SESSION_REQUIRED`, compte financier manquant/invalide, incompatibilité moyen-compte, paiement non approuvé et auto-confirmation interdite disposent désormais de messages métier spécifiques en FR/EN au lieu du fallback générique « information ou configuration requise ».

L’acceptance #698 couvre deux scénarios : refus d’un paiement Cash avant création lorsqu’aucune caisse n’est ouverte, puis parcours positif Gaming → approbation Finance externe → confirmation Finance → allocation → facture `PAID` → checkout `PAID` → session `PAID` avec transition `CHECKOUT_PAID`.

Le seuil de cinq postes reste uniquement une baseline d’onboarding/commercial readiness et ne participe à aucune règle d’encaissement.


## Hotfix #700 — rattachement paiement Cash ↔ session et récupération historique

Le hotfix #700 ferme le verrou circulaire découvert après #698 entre la clôture de caisse et la confirmation tardive d’un paiement Gaming.

Le contrat devient :

- tout nouveau paiement `CASH` mémorise `cashSessionId` lorsqu’une session `OPEN` compatible existe au moment de sa création ;
- `EnterprisePayment.cashSessionId` est une relation tenant-safe vers `EnterpriseCashSession` avec FK composite `organizationId + id` ;
- une session `PENDING_VALIDATION` n’empêche plus le même caissier d’ouvrir la caisse suivante sur le même compte ; seules une session `OPEN` ou une session réellement `CLOSING` empêchent un doublon ;
- à la confirmation, le moteur vérifie d’abord la session liée ; si elle n’est plus `OPEN`, il recherche une nouvelle session `OPEN` du même compte et du même caissier avant de produire le mouvement de caisse ;
- un paiement historique sans `cashSessionId` est récupéré de la même manière et le rattachement est persisté avant confirmation ;
- toute récupération ou réaffectation avant confirmation crée un `EnterprisePaymentEvent` (`CASH_SESSION_RECOVERED` ou `CASH_SESSION_REBOUND`) afin que l’historique reste auditable ;
- une caisse en attente de validation, en clôture, fermée ou incohérente produit désormais un message métier distinct, au lieu du faux conseil générique « ouvrez une caisse » ;
- la séparation initiateur / approbateur / confirmateur reste inchangée : le hotfix ne crée aucun passe-droit Finance.

La migration `20260929083000_payment_cash_session_binding` est additive. Elle ajoute la relation nullable, son index et sa contrainte, puis rattache uniquement les paiements Cash historiques pour lesquels un unique mouvement de caisse existant fournit déjà une preuve non ambiguë. Les paiements historiques `APPROVED` sans mouvement restent récupérés au moment de la confirmation.

L’acceptance #700 couvre le cas réel : paiement Cash préparé, ancienne caisse passée en `PENDING_VALIDATION`, ouverture d’une nouvelle caisse autorisée, simulation d’un paiement historique sans rattachement, confirmation Finance, mouvement sur la nouvelle session, allocation unique et convergence facture/checkout/session Gaming vers `PAID`.


## Hotfix #704 — récupération Cash cross-caissier et devise canonique

Le hotfix #704 complète #700 pour les paiements historiques dont le caissier d’origine n’est plus celui qui tient la caisse actuellement ouverte.

À la confirmation d’un paiement Cash, Finance résout désormais la session dans cet ordre :

1. session déjà liée si elle est encore `OPEN` ;
2. session `OPEN` du caissier historique sur le même compte ;
3. session `OPEN` du confirmateur sur le même compte ;
4. unique session `OPEN` compatible du même compte.

Si plusieurs sessions compatibles subsistent au dernier niveau, aucune sélection arbitraire n’est effectuée : la confirmation retourne `PAYMENT_CASH_SESSION_AMBIGUOUS`. Le compte financier reste tenant-scoped et sa devise doit toujours correspondre à celle du paiement. La séparation initiateur / confirmateur reste inchangée.

Les récupérations et réaffectations conservent dans `EnterprisePaymentEvent` la session et le caissier précédents lorsqu’ils existent, ainsi que la session et le caissier réellement utilisés.

Côté présentation, la collection `FINANCE_CASH` projette explicitement `currencyCode` depuis le compte financier. Le formatter partagé n’utilise plus `USD` comme fallback silencieux lorsqu’une devise est absente. Une caisse CDF s’affiche donc en CDF aussi bien dans la liste que dans son détail.

Aucune migration Prisma n’est nécessaire. L’acceptance #704 reprend le scénario historique Gaming, ouvre la nouvelle caisse avec un utilisateur autorisé différent de l’initiateur du paiement, confirme le paiement puis vérifie mouvement Cash, allocation, facture, checkout et session Gaming `PAID`, ainsi que la devise CDF exposée par l’API des caisses.

## Hotfix #706 — nested write de clôture Gaming

La clôture Gaming conserve `EnterpriseGamingDailyClose` comme parent tenant-scoped et `EnterpriseGamingDailyCloseLine` comme snapshot de rapprochement par compte, méthode et devise. Le nested create ne fournit plus directement `organizationId` ni `dailyCloseId` sur les lignes : ces deux clés relationnelles sont propagées par Prisma depuis la relation composite du parent.

Le builder de lignes est typé avec `Prisma.EnterpriseGamingDailyCloseLineCreateWithoutDailyCloseInput[]` afin qu’une réintroduction future de clés relationnelles incompatibles soit rejetée dès le type-check. Le serveur continue de recalculer `expectedAmount`, `declaredAmount` et `differenceAmount`; un motif reste obligatoire uniquement lorsque l’écart est non nul.

Les erreurs inattendues de création utilisent `GAMING_DAILY_CLOSE_CREATE_FAILED` avec un message client FR/EN spécifique, une référence support corrélable et aucun détail Prisma/SQL exposé. Aucune migration n’est requise pour #706.

## Hotfix #710 — validateur assigné et détail responsive

La clôture Gaming applique désormais le contrat maker/checker dès la soumission. Le formulaire charge les candidats depuis `/api/enterprise/[organizationId]/approval-candidates?moduleCode=GAMING_DAILY_CLOSE`, exclut le soumissionnaire et exige un `approverUserId` avant création. Le backend revalide ce candidat avec le contrat canonique d’approbation et persiste l’affectation sur `EnterpriseGamingDailyClose`.

Au moment de la décision, la route exige la capacité canonique `approve`, puis le service vérifie que l’acteur est exactement le validateur désigné et qu’il possède toujours cette permission. Le soumissionnaire ne peut pas décider sa propre clôture.

La migration #710 laisse `approverUserId` nullable uniquement pour préserver les clôtures déjà soumises avant le hotfix. Ces enregistrements historiques restent fail-closed, mais leur soumissionnaire peut utiliser l’action `ASSIGN_APPROVER` pour désigner explicitement un validateur sans recréer la clôture ni contourner l’unicité de journée.

Le contrat des motifs distingue désormais les décisions : `VALIDATE` accepte un motif facultatif sans longueur minimale, tandis que `REJECT` exige au moins 8 caractères. Les erreurs Zod brutes ne sont jamais renvoyées dans le toast utilisateur.

Côté présentation, les lignes de rapprochement sont affichées en cartes sur mobile. À partir du breakpoint desktop, le tableau possède une largeur minimale suffisante, des paddings horizontaux et des en-têtes `whitespace-nowrap`, avec scroll horizontal local lorsque nécessaire.
