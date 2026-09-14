# ERP Gaming Lounge — architecture et programme

## Statut

- Programme : #638
- Fondation fusionnée : #639
- Postes de jeu fusionnés : #640
- Sessions fusionnées : #641
- Réservations fusionnées : #642
- Lot courant : #643 — tarification, forfaits et calcul serveur
- Secteur canonique : `HOSPITALITY_EVENTS`
- Sous-secteur : `GAMING_LOUNGE`
- Classification du sous-secteur : `PLANNED` jusqu’au lot d’onboarding #646
- Modules fonctionnels isolés en `BETA` : `GAMING_STATIONS`, `GAMING_SESSIONS`, `GAMING_BOOKINGS`, `GAMING_PRICING_PACKAGES`
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
| Facturation/créance | Finance commune / `FINANCE_RECEIVABLES` |
| Paiement | `FINANCE_PAYMENTS` |
| Compte, caisse, banque, Mobile Money | `FINANCE_TREASURY` |
| Rapports | framework `REPORTS` |

Interdictions durables : aucun `GamingAsset`, `GamingCustomer`, `GamingCatalog`, `GamingCurrency`, `GamingPayment`, `GamingCashAccount` ni stock Gaming parallèle. Une réservation Gaming ne possède pas non plus un second `siteId` : le site est dérivé de l’actif canonique du poste.

Toutes les références cross-domain sont revalidées avec le même `organizationId`. Un UUID valide appartenant à un autre tenant est traité comme introuvable.

## Classification

```text
HOSPITALITY_EVENTS
└── GAMING_LOUNGE
```

`GAMING_LOUNGE` reste `PLANNED` pendant #639 à #645. Son passage à `ACTIVE` appartient à #646 et exige runtime, onboarding, permissions, activités, guides, QA et OWNER_E2E de commercial readiness.

## Registre de modules après #643

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

Restent `PLANNED`, `HIDDEN`, `EXPLICIT_DENY` jusqu’à leurs propres lots : `GAMING_DASHBOARD`, `GAMING_CHECKOUT`, `GAMING_DAILY_CLOSE`, `GAMING_TOURNAMENTS`, `GAMING_REPORTS`.

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

Une règle peut cibler :

- tous les postes ou un poste précis ;
- une famille de console ;
- un minimum/maximum de joueurs ;
- une durée fixe ;
- un masque de jours de semaine ;
- une plage horaire, y compris traversant minuit ;
- une période de validité ;
- une priorité explicite.

Modes disponibles :

```text
FIXED_DURATION
PER_MINUTE
PER_HOUR
PACKAGE
```

`FIXED_DURATION` et `PACKAGE` portent un montant forfaitaire pour la durée configurée. `PER_MINUTE` et `PER_HOUR` utilisent un incrément de facturation et un arrondi serveur. Tous les montants sont calculés avec `Prisma.Decimal` et arrondis à deux décimales.

## Résolution déterministe côté serveur

`resolveGamingPricingQuoteTx` est l’autorité tarifaire. Pour un service, un poste, un instant, une durée et un nombre de joueurs, le serveur :

1. recharge le `EnterpriseCatalogItem` same-tenant et vérifie `SERVICE` + `ACTIVE` ;
2. recharge le poste et sa capacité joueurs ;
3. dérive la timezone du `EnterpriseSite` lié à l’`EnterpriseAsset` du poste, avec fallback contrôlé `UTC` ;
4. filtre uniquement les règles `ACTIVE`, non archivées, valides à cet instant ;
5. applique poste, famille de console, groupe de joueurs, jour, plage horaire et durée fixe/forfait ;
6. départage d’abord par `priority` croissante, puis par spécificité décroissante, puis par `code`/`id` pour un résultat stable ;
7. valide la devise par `assertEnterpriseCurrencyActiveTx` du domaine Finance ;
8. calcule le montant côté serveur.

Le serveur ne somme jamais deux devises et ne choisit jamais une devise inventée par le client.

## Snapshot tarifaire immuable de session

Quand une session démarre avec un service catalogue, la résolution tarifaire s’exécute **dans la même transaction** que la création de la session. Sont persistés :

- `pricingRuleId` ;
- `pricingSnapshotJson` ;
- `currency` ;
- `quotedAmount`.

Le snapshot contient notamment code de règle, service, poste, famille de console, joueurs, mode, montant unitaire, incrément, durée demandée, timezone, jour/minute locale, priorité et éventuelle dérogation.

À `END`, `finalAmountFromGamingPricingSnapshot` calcule `finalAmount` depuis `billableSeconds` et le snapshot. Il **ne recharge pas la règle courante**. Modifier ou désactiver un tarif après le démarrage d’une session ne change donc jamais son historique.

Pour un forfait/durée fixe, le montant final reste le montant forfaitaire snapshotté. Pour les modes minute/heure, le montant final utilise le temps réellement facturable et l’incrément figé dans le snapshot.

Un retry idempotent de `START` renvoie la session existante et ne rerésout pas le tarif.

### Conversion Réservation → Session tarifée

Une réservation `CHECKED_IN` ne peut plus être convertie en session sans service tarifable. Le workspace Réservations charge les services actifs du Catalogue, simule le tarif avec le poste, la durée du créneau et `playerCount`, puis n’autorise le démarrage qu’après un aperçu valide.

Au moment de `CONVERT`, le serveur **recalcule** le tarif dans la même transaction `Serializable` qui crée `EnterpriseGamingSession`, écrit la transition `START` et passe la réservation à `CONVERTED`. La session reçoit `bookingId`, `serviceCatalogItemId`, `pricingRuleId`, `pricingSnapshotJson`, `currency` et `quotedAmount`. L’aperçu client n’est donc jamais l’autorité finale.

Le retry conserve les invariants d’idempotence #642 : une réservation ne peut produire qu’une session et la même commande ne duplique ni session ni conversion.

## Dérogations tarifaires

Une dérogation exige simultanément :

- permission `enterprise.gaming.pricing.manage` ;
- montant dérogatoire ;
- motif explicite ;
- service catalogue sélectionné.

Le motif, le montant et l’utilisateur sont conservés dans le snapshot. Le démarrage de session est audité avec la règle, la devise, le montant et l’indicateur de dérogation. Une simulation de dérogation autorisée génère également une trace d’audit.

## Simulation sans vente

`POST /api/enterprise/[organizationId]/gaming/pricing/simulate` applique exactement le moteur de résolution serveur, mais ne crée ni session, ni vente, ni facture, ni paiement, ni mouvement de trésorerie.

La date de simulation est optionnelle. Lorsqu’elle est absente, le serveur utilise l’instant courant ; une valeur vide ne doit jamais être coercée vers le 1er janvier 1970.

Cette simulation est utilisée dans l’administration Pricing, dans le formulaire de démarrage Sessions et dans le dialogue de conversion d’une Réservation `CHECKED_IN`.

## API #643

```text
GET/POST  /api/enterprise/[organizationId]/gaming/pricing
PATCH     /api/enterprise/[organizationId]/gaming/pricing/[ruleId]
POST      /api/enterprise/[organizationId]/gaming/pricing/simulate
```

Les mutations imposent same-origin, Zod, `await rateLimit`, membership, entitlement, permissions, validation cross-domain, `AuditLog` et `ApiLog`.

Activation, désactivation, archivage et dérogation nécessitent `manage`. Création/modification suivent les capacités du module. Le catalogue et les postes sont lus via leurs modules canoniques. La conversion d’une réservation exige, en plus des droits Booking/Session, la lecture de `GAMING_PRICING_PACKAGES` et `CATALOG`.

## UI #643

Le workspace `Tarifs & forfaits Gaming` fournit :

- KPI actifs/brouillons/inactifs ;
- recherche, filtres, pagination ;
- création/modification ;
- activation, désactivation, archivage ;
- sélection paginée des services du catalogue et des postes ;
- devises provenant du référentiel Finance ;
- ciblage durée/jour/créneau/famille/joueurs/priorité ;
- simulation serveur sans vente ;
- dialogs mobile-safe `92dvh` ;
- FR/EN.

Le workspace Sessions ajoute sélection du service, nombre de joueurs, aperçu tarifaire, dérogation conditionnelle et affichage `quotedAmount` / `finalAmount`.

Le workspace Réservations ajoute, au moment de `CHECKED_IN → CONVERTED`, sélection paginée du service Catalogue, aperçu tarifaire serveur et blocage du démarrage tant qu’aucun aperçu valide n’a été obtenu.

## Limite du lot #643

#643 ne crée aucune créance, facture, vente, ligne de paiement, caisse, banque, Mobile Money ni mouvement de trésorerie. Le montant d’une session est un **résultat tarifaire**, pas encore un encaissement. Checkout et Finance appartiennent à #644.

Le moteur Pricing s’applique aux nouvelles sessions qu’elles soient démarrées directement ou converties depuis une réservation. Il ne transforme jamais ce montant en paiement : #644 reste l’unique lot chargé du checkout et des flux Finance communs.

## Programme d’implémentation

- #639 — fondation canonique — fusionné ;
- #640 — postes / Actifs & maintenance — fusionné ;
- #641 — sessions minutées — fusionné ;
- #642 — réservations / joueurs — fusionné ;
- #643 — tarification, forfaits et calcul serveur — lot courant ;
- #644 — checkout, paiements, reçus et clôture ;
- #645 — tournois, maintenance intégrée, reporting et DTSC AI ;
- #646 — onboarding, activités, guides, QA et commercial readiness.

## QA

- `qa-639-gaming-lounge-foundation.mjs` protège classification, sources de vérité, migration additive et fail-closed ;
- `qa-640-gaming-stations-assets.mjs` protège `EnterpriseAsset`, extensibilité >5 et UX Stations ;
- `qa-641-gaming-sessions-engine.mjs` protège timestamps serveur, concurrence, idempotence et `IN_USE` ;
- `qa-642-gaming-bookings.mjs` protège CRM, conflits, conversion et historique Booking ;
- `qa-643-gaming-pricing.mjs` protège catalogue/service canonique, devises Finance, résolution serveur, snapshot, simulation, conversion Booking tarifée, dérogations, UI et absence d’écriture Finance #644.

#643 exige un `OWNER_E2E` avant merge, couvrant au minimum : 30 minutes, 1 heure, forfait 3 h, frontière de créneau, ciblage poste/groupe, priorité déterministe, changement du tarif après démarrage, fin de session depuis le snapshot, conversion d’une réservation avec aperçu tarifaire, devise inactive, dérogation autorisée/refusée, idempotence, mobile/desktop, FR/EN et parc supérieur à cinq postes.

## Rollback

Pour #643 :

- repasser `GAMING_PRICING_PACKAGES` en `PLANNED/HIDDEN/EXPLICIT_DENY` ;
- bloquer création/modification/activation des règles et la simulation ;
- bloquer les nouveaux démarrages tarifés et conversions Booking nécessitant Pricing ;
- conserver les règles existantes et tous les snapshots déjà stockés dans les sessions ;
- ne supprimer aucun service du catalogue, aucune session et aucune migration historique ;
- les sessions déjà tarifées restent auditables et conservent `quotedAmount` / `finalAmount`.

Le reste du domaine Gaming demeure fail-closed jusqu’à ses lots respectifs.
