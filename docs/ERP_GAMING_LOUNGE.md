# ERP Gaming Lounge — architecture et programme

## Statut

- Programme : #638
- Fondation fusionnée : #639
- Postes de jeu fusionnés : #640
- Sessions fusionnées : #641
- Lot courant : #642 — réservations, joueurs et conversion en session
- Secteur canonique : `HOSPITALITY_EVENTS`
- Sous-secteur : `GAMING_LOUNGE`
- Classification du sous-secteur : `PLANNED` jusqu’au lot d’onboarding #646
- Modules fonctionnels isolés : `GAMING_STATIONS`, `GAMING_SESSIONS` et `GAMING_BOOKINGS` en `BETA`
- Statut commercial global : non `COMMERCIAL_READY`

Le sous-secteur reste volontairement **fail-closed** pour l’onboarding commercial normal jusqu’à #646. Les lots intermédiaires rendent uniquement les capacités réellement implémentées `BETA`, sans promouvoir prématurément l’ensemble du Gaming Lounge.

## Objectif métier

Un Gaming Lounge vend principalement du temps d’utilisation de postes physiques — consoles, écrans et périphériques — et doit gérer : postes de jeu, sessions minutées, réservations, tarifs et forfaits, encaissements, clôtures, tournois, incidents/maintenance, reporting et analyse IA autorisée.

DTSC Platform ne modélise pas ce métier comme un second Shop ni comme un CRUD parallèle. Le domaine Gaming complète les domaines ERP communs et réutilise leurs sources de vérité.

## Sources de vérité

| Besoin | Source canonique |
|---|---|
| Console, TV, manette, onduleur, équipement | `EnterpriseAsset` / `ASSETS_MAINTENANCE` |
| Client/joueur identifié | `EnterpriseBusinessParty` / `CRM_CUSTOMERS` |
| Service vendu et prix de référence | `EnterpriseCatalogItem` / `CATALOG` |
| Site physique | `EnterpriseSite` porté par l’`EnterpriseAsset` du poste |
| Snacks/accessoires physiques | `CATALOG` + `INVENTORY_LOGISTICS` |
| Fournisseurs/achats | `SUPPLIERS_PURCHASES` |
| Facturation/créance | Finance commune / `FINANCE_RECEIVABLES` |
| Paiement | `FINANCE_PAYMENTS` |
| Compte, caisse, banque, Mobile Money | `FINANCE_TREASURY` |
| Rapports | framework `REPORTS` |

Interdictions durables : aucun `GamingAsset`, `GamingCustomer`, `GamingCatalog`, `GamingPayment`, `GamingCashAccount` ni stock Gaming parallèle. Une réservation Gaming ne possède pas non plus un second `siteId` : le site est toujours dérivé de l’actif canonique du poste.

## Classification

```text
HOSPITALITY_EVENTS
└── GAMING_LOUNGE
```

`GAMING_LOUNGE` reste `PLANNED` pendant #639 à #645. Le helper générique d’onboarding continue donc de l’exclure par défaut. Le passage du sous-secteur à `ACTIVE` appartient à #646 et exige runtime minimal, onboarding, permissions, activités, guides et preuves QA/OWNER_E2E de commercial readiness.

## Registre de modules après #642

Le registre `lib/enterprise/module-registry-gaming.json` est fusionné dans le registre canonique.

### `GAMING_STATIONS`

- `implementationStatus: BETA` ;
- route `/enterprise-modules/GAMING_STATIONS` ;
- workspace `ENTERPRISE_GAMING_STATIONS` ;
- `POSITION_PERMISSION` ;
- prefix `enterprise.gaming.stations.` ;
- dépendances `ASSETS_MAINTENANCE` et `SITES_WAREHOUSES` ;
- plan minimum `BUSINESS` avec abonnement actif.

### `GAMING_SESSIONS`

- `implementationStatus: BETA` ;
- route `/enterprise-modules/GAMING_SESSIONS` ;
- workspace `ENTERPRISE_GAMING_SESSIONS` ;
- `POSITION_PERMISSION` ;
- prefix `enterprise.gaming.sessions.` ;
- dépendances `GAMING_STATIONS` et `CATALOG` ;
- plan minimum `BUSINESS` avec abonnement actif.

### `GAMING_BOOKINGS`

- `implementationStatus: BETA` ;
- route `/enterprise-modules/GAMING_BOOKINGS` ;
- workspace `ENTERPRISE_GAMING_BOOKINGS` ;
- `POSITION_PERMISSION` ;
- prefix `enterprise.gaming.bookings.` ;
- dépendances `GAMING_STATIONS`, `GAMING_SESSIONS` et `CRM_CUSTOMERS` ;
- plan minimum `BUSINESS` avec abonnement actif.

Les autres modules restent `PLANNED`, `HIDDEN`, sans workspace et avec `EXPLICIT_DENY` jusqu’à leurs lots respectifs : `GAMING_DASHBOARD`, `GAMING_PRICING_PACKAGES`, `GAMING_CHECKOUT`, `GAMING_DAILY_CLOSE`, `GAMING_TOURNAMENTS`, `GAMING_REPORTS`.

La connaissance d’un code module ne donne jamais un droit : le resolver canonique conserve membership, secteur/sous-secteur, module tenant, dépendances, entitlement et permissions.

## Parc de postes #640 : extensible, jamais limité à cinq

Les cinq PlayStations du scénario initial restent uniquement une baseline commerciale. Aucune limite produit ou technique à cinq n’existe.

Le contrat durable est :

1. une sixième station et les suivantes utilisent exactement le même flux ;
2. chaque station est une extension d’un `EnterpriseAsset` canonique ;
3. aucun tableau de cinq slots, `MAX_STATIONS=5`, quota UI ou validation serveur équivalente n’est autorisé ;
4. pagination, recherche et filtres serveur absorbent la croissance du parc ;
5. archiver un profil Gaming ne supprime jamais l’actif ni son historique maintenance.

`EnterpriseGamingStationProfile` conserve uniquement les métadonnées Gaming : code du poste, nom d’affichage, famille de console, capacité joueurs, ordre, statut manuel, notes, révision et archivage. Le site, numéro de série, catégorie, incidents et maintenance restent dans le domaine Asset.

## #641 — moteur de sessions : autorité temporelle serveur

Le navigateur n’est jamais l’autorité métier du chronomètre. `EnterpriseGamingSession` persiste les **timestamps serveur** qui expliquent la durée :

- `startedAt` ;
- `expectedEndAt` ;
- `pausedAt` quand la session est actuellement en pause ;
- `endedAt` ;
- `pausedSeconds` cumulés ;
- `billableSeconds` figés à la fin ;
- `timingPolicyJson`, snapshot de la règle temporelle appliquée.

Le workspace peut utiliser un intervalle JavaScript uniquement pour **projeter visuellement** les secondes entre deux réponses serveur. Il resynchronise périodiquement les données ; un rechargement, un changement d’onglet ou une horloge locale incorrecte ne change donc pas la durée métier persistée.

La politique #641 supporte le snapshot `pauseBillable`. Par défaut, le temps de pause n’est pas facturable. Lors d’une reprise, le serveur cumule la pause et décale `expectedEndAt` lorsque la pause n’est pas facturable. Le moteur #643 utilisera ces données pour la tarification sans réinventer le temps.

## Machine d’état Sessions #641

```text
WAITING | ACTIVE | PAUSED | ENDED | TO_CHECKOUT | PAID | CANCELLED
```

Transitions opérationnelles : `START`, `PAUSE`, `RESUME`, `EXTEND`, `TRANSFER`, `END`. Une session `ENDED`, `TO_CHECKOUT`, `PAID` ou `CANCELLED` est terminale pour les mutations #641. #644 ajoutera les transitions financières nécessaires sans réécrire l’historique de temps.

## Journal Sessions et idempotence

`EnterpriseGamingSessionTransition` journalise chaque commande avec `organizationId`, session, action, `idempotencyKey`, statut avant/après, acteur, métadonnées et timestamp serveur.

La paire `(organizationId, idempotencyKey)` est unique. Un retry renvoie le résultat déjà produit au lieu de dupliquer une session ou une transition.

## Concurrence Sessions et double occupation

La prévention de double occupation ne repose pas sur React :

1. transactions Prisma en isolation `Serializable` ;
2. index partiel PostgreSQL `GamingSession_one_live_per_station_key` interdisant deux sessions `ACTIVE/PAUSED` sur le même poste ;
3. `revision` + statut attendu pour empêcher les transitions stale.

La session reste la source de vérité de l’occupation et la projection SQL maintient `IN_USE` sur le poste pendant une session live.

## #642 — réservations Gaming : source de vérité légère

`EnterpriseGamingBooking` représente uniquement le contrat métier spécifique à la réservation :

- référence Gaming ;
- poste ;
- créneau `scheduledStartAt` / `scheduledEndAt` ;
- client CRM facultatif ;
- nombre de joueurs ;
- statut et timestamps de cycle de vie ;
- notes ;
- révision et idempotence.

Le modèle **ne duplique pas** :

- le client : `businessPartyId` référence le CRM commun ;
- le site : il est dérivé de `EnterpriseGamingStationProfile.assetId → EnterpriseAsset.site` ;
- la console : elle reste un `EnterpriseAsset` ;
- le paiement/acompte : #642 ne crée aucun `GamingPayment`, aucune caisse et aucune écriture financière.

Un **joueur occasionnel** est représenté par une réservation dont `businessPartyId` est absent. Cela permet de réserver un poste sans créer artificiellement un client CRM. Dès qu’un client est sélectionné, le serveur recharge le `EnterpriseBusinessParty` avec le même `organizationId`, vérifie qu’il est actif et possède un rôle `CUSTOMER` actif.

## Machine d’état Réservations #642

```text
DRAFT → CONFIRMED → CHECKED_IN → CONVERTED
  │          │             │
  └──────────┴─────────────┴→ CANCELLED
             └──────────────→ NO_SHOW
```

Contrat :

- `DRAFT` : créneau préparé, ne bloque pas encore le planning ;
- `CONFIRMED` : réservation ferme, le créneau bloque les autres réservations du même poste ;
- `CHECKED_IN` : arrivée du joueur enregistrée, le créneau reste bloquant ;
- `CONVERTED` : réservation convertie en une seule session ;
- `NO_SHOW` : historique conservé, créneau libéré ;
- `CANCELLED` : historique conservé, créneau libéré.

`NO_SHOW`, `CANCELLED` et `CONVERTED` sont terminaux pour #642.

## Créneaux et garde de conflit #642

Un créneau doit avoir une fin strictement postérieure au début et ne peut pas dépasser **24 heures**, afin de rester compatible avec le contrat du moteur Sessions.

Le conflit n’est jamais décidé uniquement par l’interface. Trois protections se complètent :

1. service transactionnel en isolation `Serializable` ;
2. verrou PostgreSQL transactionnel par `(organizationId, stationId)` avec `pg_advisory_xact_lock` ;
3. trigger DB `EnterpriseGamingBooking_conflict_guard`, qui refuse tout chevauchement entre réservations non archivées `CONFIRMED/CHECKED_IN` du même poste.

Le chevauchement canonique est :

```text
existing.start < new.end
AND existing.end > new.start
```

Deux créneaux adjacents sont donc autorisés, tandis qu’un chevauchement même partiel est refusé. La modification d’une réservation confirmée passe par la même garde. Les mutations utilisent aussi `revision` + statut attendu pour détecter une modification concurrente.

## Journal Réservations et idempotence #642

`EnterpriseGamingBookingTransition` journalise :

- `CREATE` ;
- `UPDATE` ;
- `CONFIRM` ;
- `CHECK_IN` ;
- `NO_SHOW` ;
- `CANCEL` ;
- `CONVERT`.

Chaque commande possède une `idempotencyKey` unique dans l’organisation. Rejouer la même intention ne crée ni deuxième réservation, ni deuxième transition.

## Conversion réservation → session #642

La conversion n’est autorisée qu’après `CHECK_IN` et exige simultanément les droits d’écriture Bookings et de démarrage Sessions.

La conversion se fait dans **une seule transaction** :

1. recharge de la réservation dans le même tenant ;
2. vérification de la révision et du statut `CHECKED_IN` ;
3. revalidation du client CRM éventuel ;
4. verrou du poste ;
5. vérification du poste, de l’actif, des incidents majeurs, de la maintenance et de l’absence de session live ;
6. création d’une `EnterpriseGamingSession` `ACTIVE` avec `bookingId` ;
7. création de la transition Sessions `START` ;
8. passage de la réservation à `CONVERTED` et journalisation `CONVERT`.

L’unicité `(organizationId, bookingId)` sur `EnterpriseGamingSession` garantit qu’une réservation ne peut produire qu’une seule session, y compris sous retry concurrent.

La session créée utilise le temps serveur de la conversion comme `startedAt`. Sa durée initiale reprend la durée du créneau réservé, avec `timingPolicyJson.authority = SERVER` et `source = BOOKING`. #642 ne calcule aucun montant : #643 reste l’autorité future pour la tarification.

## API et sécurité #642

Contrat serveur :

```text
session DTSC
→ activeOrganizationId
→ membership actif
→ HOSPITALITY_EVENTS / GAMING_LOUNGE
→ GAMING_BOOKINGS BETA + module tenant
→ dépendances GAMING_STATIONS / GAMING_SESSIONS / CRM_CUSTOMERS
→ entitlement
→ enterprise.gaming.bookings.*
→ revalidation cross-domain same-tenant
→ same-origin sur mutation
→ Zod
→ await rateLimit
→ transaction Serializable
→ révision + statut attendu
→ idempotence persistée
→ ApiLog + AuditLog
```

Routes #642 :

- `GET/POST /api/enterprise/[organizationId]/gaming/bookings` ;
- `PATCH /api/enterprise/[organizationId]/gaming/bookings/[bookingId]`.

Une conversion exige en plus `enterprise.gaming.sessions.*` via le resolver canonique de `GAMING_SESSIONS`.

Les erreurs métier sont localisées FR/EN : client introuvable, capacité joueurs, créneau invalide, conflit de réservation, poste indisponible, incident, maintenance, session existante, transition invalide, conflit d’idempotence et révision concurrente.

## Workspace Réservations #642

Le workspace dédié fournit :

- KPI brouillons/confirmées/arrivées/converties ;
- recherche et filtres serveur ;
- pagination ;
- vue **Liste** ;
- vue **Calendrier/agenda** groupée par jour à partir des résultats paginés ;
- création et modification ;
- recherche paginée des clients du CRM ;
- option explicite **joueur occasionnel** ;
- détail plein écran avec site dérivé de l’actif et historique des transitions ;
- confirmation, check-in, no-show, annulation et conversion en session ;
- dialogs mobile-safe, feedback succès/erreur et conservation du formulaire en cas d’échec.

La vue agenda n’est qu’une projection d’interface : l’autorité sur les conflits reste le serveur et la base de données. La pagination des postes ne réintroduit aucune limite fixe de cinq consoles.

## Références cross-domain

Toutes les références reçues du client sont revalidées :

- station : même `organizationId`, profil non archivé et actif canonique valide ;
- client : même `organizationId`, `EnterpriseBusinessParty` actif avec rôle `CUSTOMER` ;
- site : jamais fourni par le client pour une réservation, toujours lu depuis l’actif ;
- session : créée dans le même tenant et liée à la réservation par `bookingId`.

Une référence valide appartenant à une autre entreprise est traitée comme introuvable.

## Finance et tarification

#642 ne crée **aucun acompte, paiement, facture, mouvement de trésorerie ou prix final**. Les éventuels acomptes futurs devront utiliser les modules Finance communs. #643 appliquera les règles tarifaires et snapshots de prix ; #644 réalisera checkout, paiements, reçus et clôture.

## Programme d’implémentation

- #639 — fondation canonique du sous-secteur — fusionné ;
- #640 — postes de jeu intégrés aux Actifs & maintenance — fusionné, `GAMING_STATIONS` BETA ;
- #641 — moteur de sessions minutées, concurrence et occupation — fusionné, `GAMING_SESSIONS` BETA ;
- #642 — réservations, joueurs et conversion en session — `GAMING_BOOKINGS` BETA ;
- #643 — tarification, forfaits et calcul serveur ;
- #644 — checkout, paiements, reçus et clôture Gaming ;
- #645 — tournois, maintenance intégrée, reporting et DTSC AI ;
- #646 — onboarding, activités, guides, QA et commercial readiness.

## QA

`qa-639-gaming-lounge-foundation.mjs` protège la classification, le registre canonique, les sources de vérité et la migration de fondation.

`qa-640-gaming-stations-assets.mjs` protège le parc Asset canonique, l’absence de plafond à cinq, les APIs Stations, la sécurité et le workspace.

`qa-641-gaming-sessions-engine.mjs` protège le moteur Sessions, l’autorité temporelle serveur, la concurrence, l’idempotence et la projection `IN_USE` sans figer les lots futurs déjà implémentés.

`qa-642-gaming-bookings.mjs` protège notamment :

- `GAMING_BOOKINGS=BETA` et fail-closed des modules non encore livrés ;
- permissions/access/entitlement ;
- `EnterpriseGamingBookingTransition` et les timestamps de cycle de vie ;
- créneaux valides et durée maximale de 24 h ;
- garde DB de chevauchement et verrou advisory ;
- transactions `Serializable`, révision et idempotence ;
- CRM canonique et joueur occasionnel sans `GamingCustomer` ;
- site dérivé de l’actif, sans `siteId` Gaming parallèle ;
- conversion atomique en une seule session ;
- same-origin/Zod/rate-limit/audit ;
- vues Liste/Calendrier, FR/EN, détail et formulaires mobile-safe ;
- absence de limite fixe de cinq ;
- branchement à `qa:regression`.

#642 est user-facing et exige un `OWNER_E2E` avant merge : réservation avec client CRM, réservation joueur occasionnel, conflit de créneau, modification, check-in, conversion en session, retry idempotent, no-show, annulation, site dérivé de l’actif, mobile/desktop FR/EN clair/sombre et parc supérieur à cinq postes.

## Rollback

Pour #642 :

- repasser `GAMING_BOOKINGS` en `PLANNED/HIDDEN/EXPLICIT_DENY` et retirer route/workspace/API de réservation ;
- bloquer les nouvelles réservations et conversions ;
- conserver toutes les réservations, transitions et sessions déjà créées ;
- conserver les postes, clients CRM et actifs ;
- ne supprimer ni réécrire les migrations historiques ;
- les réservations terminées restent auditables même si le module est désactivé.

Le reste du domaine Gaming demeure fail-closed jusqu’à ses lots respectifs.
