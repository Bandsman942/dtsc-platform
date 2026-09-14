# ERP Gaming Lounge — architecture et programme

## Statut

- Programme : #638
- Fondation : #639
- Secteur canonique : `HOSPITALITY_EVENTS`
- Sous-secteur : `GAMING_LOUNGE`
- Statut de classification pendant #639 : `PLANNED`
- Statut commercial : non évalué / non commercialisable pendant #639

Le sous-secteur reste volontairement **fail-closed** pendant la fondation. Il ne doit pas être sélectionnable comme sous-secteur actif ni produire de navigation utilisable tant que les modules minimums n’ont pas leur modèle/service/route/workspace/permission/entitlement/QA réels.

## Objectif métier

Un Gaming Lounge vend principalement du temps d’utilisation de postes physiques — consoles, écrans et périphériques — et doit pouvoir gérer :

- postes de jeu ;
- sessions minutées ;
- réservations ;
- tarifs et forfaits ;
- encaissements et clôtures ;
- tournois/événements ;
- incidents et maintenance ;
- reporting et analyse IA autorisée.

DTSC Platform ne doit pas modéliser ce métier comme un second Shop ni comme un ensemble de CRUD génériques. Le Gaming Lounge complète les domaines ERP communs sans les dupliquer.

## Sources de vérité

| Besoin | Source canonique |
|---|---|
| Console, TV, manette, onduleur, équipement | `EnterpriseAsset` / `ASSETS_MAINTENANCE` |
| Client/joueur identifié | `EnterpriseBusinessParty` / `CRM_CUSTOMERS` |
| Service vendu et prix de référence | `EnterpriseCatalogItem` / `CATALOG` |
| Site physique | `EnterpriseSite` / `SITES_WAREHOUSES` |
| Snacks/accessoires physiques | `CATALOG` + `INVENTORY_LOGISTICS` |
| Fournisseurs/achats | `SUPPLIERS_PURCHASES` |
| Facturation/créance | Finance commune / `FINANCE_RECEIVABLES` |
| Paiement | `FINANCE_PAYMENTS` |
| Compte, caisse, banque, Mobile Money | `FINANCE_TREASURY` |
| Rapports | framework `REPORTS` |

Interdictions : aucun `GamingAsset`, `GamingCustomer`, `GamingCatalog`, `GamingPayment`, `GamingCashAccount` ni stock Gaming parallèle.

## Classification

La classification générique existante est réutilisée :

```text
HOSPITALITY_EVENTS
└── GAMING_LOUNGE
```

Dans #639, `GAMING_LOUNGE` est déclaré `PLANNED`. Le helper générique `listBusinessSubtypesForSector()` exclut les sous-secteurs `PLANNED` par défaut ; il reste donc non sélectionnable dans les parcours normaux.

Le passage à `ACTIVE` appartient au lot #646 et exige que le runtime minimal, l’onboarding, les permissions et les preuves QA/OWNER_E2E soient disponibles.

## Registre de modules

Le registre `lib/enterprise/module-registry-gaming.json` est fusionné dans le registre canonique. Pendant #639, tous les modules suivants restent `PLANNED`, `HIDDEN`, sans workspace et avec `EXPLICIT_DENY` :

- `GAMING_DASHBOARD` ;
- `GAMING_STATIONS` ;
- `GAMING_SESSIONS` ;
- `GAMING_BOOKINGS` ;
- `GAMING_PRICING_PACKAGES` ;
- `GAMING_CHECKOUT` ;
- `GAMING_DAILY_CLOSE` ;
- `GAMING_TOURNAMENTS` ;
- `GAMING_REPORTS`.

Connaître le code d’un module ne donne donc aucun accès. Le contrat d’accès générique renvoie `MODULE_NOT_IMPLEMENTED` tant que le statut n’est pas `ACTIVE` ou `BETA`.

## Modèle de données de fondation

Le schéma multi-fichiers ajoute `prisma/enterprise-gaming.prisma`.

### `EnterpriseGamingConfiguration`

Configuration tenant-scoped du domaine Gaming. Aucun solde, compte ou règle financière parallèle n’y est stocké.

### `EnterpriseGamingStationProfile`

Extension d’un actif commun. Le champ `assetId` référence logiquement un `EnterpriseAsset` et doit être revalidé côté service avec le même `organizationId` avant toute écriture.

La paire `(organizationId, assetId)` est unique : un actif ne peut pas devenir deux stations Gaming dans le même tenant.

Statuts prévus :

- `AVAILABLE` ;
- `IN_USE` ;
- `RESERVED` ;
- `MAINTENANCE` ;
- `OUT_OF_SERVICE`.

### `EnterpriseGamingBooking`

Réservation d’une station sur un créneau. `businessPartyId` reste une référence vers le CRM commun et sera revalidée par le service #642.

La base impose au minimum :

- fin strictement postérieure au début ;
- nombre de joueurs positif ;
- références/idempotency keys uniques dans le tenant.

La détection complète des chevauchements appartient au service transactionnel #642.

### `EnterpriseGamingPricingRule`

Règle spécifique au temps de jeu. `serviceCatalogItemId` doit désigner un service du catalogue commun de la même organisation ; il ne crée pas un catalogue Gaming.

Modes prévus :

- `FIXED_DURATION` ;
- `PER_MINUTE` ;
- `PER_HOUR` ;
- `PACKAGE`.

Le moteur de résolution déterministe et les dérogations commerciales appartiennent à #643.

### `EnterpriseGamingSession`

Objet métier représentant l’utilisation réelle d’une station.

Statuts de fondation :

- `WAITING` ;
- `ACTIVE` ;
- `PAUSED` ;
- `ENDED` ;
- `TO_CHECKOUT` ;
- `PAID` ;
- `CANCELLED`.

Invariants :

1. les timestamps serveur sont l’autorité ; le navigateur ne possède jamais le temps facturable ;
2. `pausedSeconds` et `billableSeconds` sont persistés/validés côté serveur ;
3. `pricingSnapshotJson`, la devise et les montants permettent d’expliquer une session historique sans relire seulement le tarif courant ;
4. `idempotencyKey` prépare les transitions rejouables ;
5. une réservation ne peut convertir qu’une seule session via l’unicité `(organizationId, bookingId)` ;
6. l’index SQL partiel `GamingSession_one_live_per_station_key` interdit deux sessions `ACTIVE`/`PAUSED` non archivées sur la même station.

L’index partiel est un garde-fou de base. Le moteur #641 doit tout de même utiliser une transaction, une clé d’idempotence et des erreurs métier déterministes.

## Isolation multi-tenant

Toutes les entités Gaming portent `organizationId`.

Les relations internes Gaming utilisent des clés composées contenant `organizationId`. Les références cross-domain telles que `assetId`, `businessPartyId` et `serviceCatalogItemId` sont volontairement rechargées côté service avec le même tenant conformément aux règles Prisma DTSC ; une clé valide appartenant à une autre organisation doit être traitée comme introuvable.

Le futur contrat serveur suit :

```text
session
→ activeOrganizationId
→ membership actif
→ organisation cliente active
→ HOSPITALITY_EVENTS + GAMING_LOUNGE
→ module Gaming actif
→ entitlement
→ permission
→ propriété/visibilité de l’objet
→ same-origin
→ Zod
→ await rateLimit
→ transaction/idempotence
→ ApiLog
→ AuditLog
```

Un rôle global DTSC n’accorde aucun accès automatique aux données Gaming privées d’un client.

## Finance et devises

Le domaine Gaming ne maintient aucun solde. Les montants à encaisser seront transformés par #644 en objets commerciaux/financiers communs.

Une devise est conservée sur le snapshot de session/tarif pour expliquer le montant historique. Des montants de devises différentes ne doivent jamais être additionnés directement dans les dashboards ou clôtures.

## Programme d’implémentation

- #639 — fondation canonique du sous-secteur et contrat de données ;
- #640 — postes de jeu intégrés aux Actifs & maintenance ;
- #641 — moteur de sessions minutées, concurrence et occupation ;
- #642 — réservations, joueurs et conversion en session ;
- #643 — tarification, forfaits et calcul serveur ;
- #644 — checkout, paiements, reçus et clôture Gaming ;
- #645 — tournois, maintenance intégrée, reporting et DTSC AI ;
- #646 — onboarding, activités, guides, QA et commercial readiness.

## QA #639

Le contrat ciblé `scripts/qa-639-gaming-lounge-foundation.mjs` vérifie notamment :

- classification `PLANNED` ;
- portée sectorielle/sous-sectorielle ;
- intégration au registre canonique ;
- modules strictement `PLANNED + HIDDEN + EXPLICIT_DENY` ;
- présence des modèles tenant-scoped ;
- absence de sources communes dupliquées ;
- migration additive et index anti double-session live ;
- documentation et branchement dans `qa:regression`.

La CI doit aussi prouver Prisma generate, migrations depuis base vide, type-check, lint, `qa:enterprise-module-registry`, `qa:erp-commercial-readiness`, `qa:erp-i18n`, `qa:regression` et build selon `docs/CONTRIBUTING.md`.

`OWNER_E2E` n’est pas requis pour #639 parce qu’aucune surface utilisateur n’est activée. Il devient requis pour les lots fonctionnels suivants et obligatoire avant `COMMERCIAL_READY`.

## Rollback

#639 n’active aucun parcours client. Un rollback applicatif retire classification/registre/helpers. Si la migration a déjà été appliquée, les tables additives peuvent rester inutilisées jusqu’à correction/reprise ; aucune migration historique n’est réécrite et aucune suppression de données n’est nécessaire.
