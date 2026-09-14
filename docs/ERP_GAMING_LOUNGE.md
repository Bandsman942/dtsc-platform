# ERP Gaming Lounge — architecture et programme

## Statut

- Programme : #638
- Fondation fusionnée : #639
- Postes de jeu fusionnés : #640
- Lot courant : #641 — moteur de sessions minutées, concurrence et occupation
- Secteur canonique : `HOSPITALITY_EVENTS`
- Sous-secteur : `GAMING_LOUNGE`
- Classification du sous-secteur : `PLANNED` jusqu’au lot d’onboarding #646
- Modules fonctionnels isolés : `GAMING_STATIONS` et `GAMING_SESSIONS` en `BETA`
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
| Site physique | `EnterpriseSite` / `SITES_WAREHOUSES` |
| Snacks/accessoires physiques | `CATALOG` + `INVENTORY_LOGISTICS` |
| Fournisseurs/achats | `SUPPLIERS_PURCHASES` |
| Facturation/créance | Finance commune / `FINANCE_RECEIVABLES` |
| Paiement | `FINANCE_PAYMENTS` |
| Compte, caisse, banque, Mobile Money | `FINANCE_TREASURY` |
| Rapports | framework `REPORTS` |

Interdictions durables : aucun `GamingAsset`, `GamingCustomer`, `GamingCatalog`, `GamingPayment`, `GamingCashAccount` ni stock Gaming parallèle.

## Classification

```text
HOSPITALITY_EVENTS
└── GAMING_LOUNGE
```

`GAMING_LOUNGE` reste `PLANNED` pendant #639 à #645. Le helper générique d’onboarding continue donc de l’exclure par défaut. Le passage du sous-secteur à `ACTIVE` appartient à #646 et exige runtime minimal, onboarding, permissions, activités, guides et preuves QA/OWNER_E2E de commercial readiness.

## Registre de modules après #641

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

Les autres modules restent `PLANNED`, `HIDDEN`, sans workspace et avec `EXPLICIT_DENY` jusqu’à leurs lots respectifs : `GAMING_DASHBOARD`, `GAMING_BOOKINGS`, `GAMING_PRICING_PACKAGES`, `GAMING_CHECKOUT`, `GAMING_DAILY_CLOSE`, `GAMING_TOURNAMENTS`, `GAMING_REPORTS`.

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

## Machine d’état #641

Le catalogue de statuts reste :

```text
WAITING | ACTIVE | PAUSED | ENDED | TO_CHECKOUT | PAID | CANCELLED
```

#641 rend opérationnelles les transitions suivantes :

- `START` → crée une session directement `ACTIVE` sur un poste disponible ;
- `PAUSE` : `ACTIVE → PAUSED` et fixe `pausedAt` côté serveur ;
- `RESUME` : `PAUSED → ACTIVE`, cumule la pause et recalcule la fin prévue selon le snapshot ;
- `EXTEND` : ajoute des minutes à `expectedEndAt` sans réécrire le passé ;
- `TRANSFER` : déplace une session live vers un autre poste réellement disponible ;
- `END` : `ACTIVE|PAUSED → ENDED`, fixe `endedAt`, `pausedSeconds` et `billableSeconds`.

Une session `ENDED`, `TO_CHECKOUT`, `PAID` ou `CANCELLED` est terminale pour les mutations #641. #644 ajoutera les transitions financières nécessaires sans réécrire l’historique de temps.

## Journal de transitions et idempotence

#641 ajoute `EnterpriseGamingSessionTransition` comme journal des commandes de session. Chaque entrée conserve :

- `organizationId` ;
- session ;
- action ;
- `idempotencyKey` ;
- statut avant/après ;
- acteur ;
- métadonnées de transition ;
- timestamp serveur.

La paire `(organizationId, idempotencyKey)` est unique. Un retry de démarrage ou de transition renvoie le résultat déjà produit au lieu de dupliquer la session ou l’action. Réutiliser la même clé pour une autre session est un conflit explicite.

Le démarrage conserve également l’`idempotencyKey` sur `EnterpriseGamingSession`, ce qui protège la création elle-même avant même la lecture du journal.

## Concurrence et double occupation

La prévention de double occupation ne repose pas sur un contrôle React.

Trois niveaux se complètent :

1. les mutations utilisent une transaction Prisma en isolation `Serializable` ;
2. l’index partiel de fondation `GamingSession_one_live_per_station_key` interdit en PostgreSQL deux sessions non archivées `ACTIVE/PAUSED` sur `(organizationId, stationId)` ;
3. les mutations utilisent `revision` + statut attendu pour empêcher une transition stale.

Une requête concurrente perdante reçoit une erreur métier `GAMING_SESSION_STATION_BUSY` ou un conflit de révision, jamais une deuxième session valide.

## Projection d’occupation sur les postes

La session reste la source de vérité de l’occupation. Une projection SQL maintient le statut opérationnel du poste :

- insertion d’une session `ACTIVE/PAUSED` → poste `IN_USE` ;
- transfert → ancien poste libéré, nouveau poste `IN_USE` ;
- fin → poste libéré si aucune autre session live ne le référence.

Un garde DB interdit de passer manuellement un poste `IN_USE` vers un autre statut tant qu’une session `ACTIVE/PAUSED` existe encore. La route Stations réalise aussi un contrôle métier préalable afin de retourner un message humain plutôt qu’une erreur SQL.

Les incidents et maintenances Asset gardent leur priorité d’affichage : un actif archivé/sorti, un incident majeur ou une maintenance en cours rend le poste indisponible. Une nouvelle session vérifie ces blocages dans le même tenant avant démarrage ou transfert.

## Références cross-domain

Un démarrage peut référencer un joueur/client identifié et un service de catalogue, mais jamais via une confiance aveugle dans un UUID reçu :

- `businessPartyId` est rechargé avec le même `organizationId`, doit être actif et avoir un rôle `CUSTOMER` actif ;
- `serviceCatalogItemId` est rechargé avec le même `organizationId` et doit être actif ;
- le poste est rechargé dans le même tenant et son actif canonique est vérifié.

Une référence valide appartenant à un autre tenant est traitée comme introuvable.

## API et sécurité #641

Le contrat serveur est :

```text
session DTSC
→ activeOrganizationId
→ membership actif
→ HOSPITALITY_EVENTS / GAMING_LOUNGE
→ GAMING_SESSIONS BETA + module tenant
→ dépendances GAMING_STATIONS / CATALOG
→ entitlement
→ enterprise.gaming.sessions.*
→ revalidation cross-domain same-tenant
→ same-origin sur mutation
→ Zod
→ await rateLimit
→ transaction Serializable
→ révision + statut attendu
→ idempotence persistée
→ ApiLog + AuditLog
```

Routes #641 :

- `GET/POST /api/enterprise/[organizationId]/gaming/sessions` ;
- `PATCH /api/enterprise/[organizationId]/gaming/sessions/[sessionId]`.

Les erreurs métier Gaming sont localisées FR/EN : poste occupé, maintenance, incident, client/service introuvable, session terminale, mauvaise transition et conflit d’idempotence.

## Workspace Sessions

Le workspace dédié fournit :

- KPI sessions actives/en pause/terminées/à encaisser ;
- recherche et filtres serveur ;
- pagination ;
- cartes responsive par session/poste ;
- détail plein écran et historique récent des transitions ;
- démarrage sur poste disponible ;
- pause, reprise, prolongation, transfert et fin ;
- projection visuelle du temps issue de `serverNow` ;
- resynchronisation bornée toutes les 30 secondes ;
- clés d’idempotence générées par intention utilisateur.

La liste des postes disponibles est paginée : le moteur ne réintroduit aucune limite fixe de cinq consoles.

## Finance et tarification

#641 calcule le **temps facturable**, pas le prix final. Il ne crée ni facture, ni paiement, ni mouvement de trésorerie.

#643 appliquera les règles tarifaires et snapshots de prix ; #644 transformera ensuite une session terminée en objets commerciaux/financiers communs. Une session payée/clôturée ne devra jamais être réécrite.

## Programme d’implémentation

- #639 — fondation canonique du sous-secteur — fusionné ;
- #640 — postes de jeu intégrés aux Actifs & maintenance — fusionné, `GAMING_STATIONS` BETA ;
- #641 — moteur de sessions minutées, concurrence et occupation — `GAMING_SESSIONS` BETA ;
- #642 — réservations, joueurs et conversion en session ;
- #643 — tarification, forfaits et calcul serveur ;
- #644 — checkout, paiements, reçus et clôture Gaming ;
- #645 — tournois, maintenance intégrée, reporting et DTSC AI ;
- #646 — onboarding, activités, guides, QA et commercial readiness.

## QA

`qa-639-gaming-lounge-foundation.mjs` protège toujours la classification, le registre canonique, les sources de vérité et la migration de fondation sans figer les futurs lots à `PLANNED`.

`qa-640-gaming-stations-assets.mjs` protège le parc Asset canonique, l’absence de plafond à cinq, les APIs Stations, la sécurité et le workspace.

`qa-641-gaming-sessions-engine.mjs` protège notamment :

- `GAMING_SESSIONS=BETA` et fail-closed des modules non encore livrés ;
- permissions/access/entitlement ;
- `pausedAt`, `timingPolicyJson` et `EnterpriseGamingSessionTransition` ;
- unicité d’idempotence ;
- index DB contre double occupation ;
- transactions `Serializable` ;
- revalidation client/catalogue/poste same-tenant ;
- pause/reprise/prolongation/transfert/fin ;
- calcul du temps facturable serveur ;
- projection `IN_USE` et garde des mutations Stations ;
- same-origin/Zod/rate-limit/audit ;
- workspace FR/EN et projection temporelle ;
- absence de limite fixe de cinq ;
- branchement à `qa:regression`.

#641 est user-facing et exige un `OWNER_E2E` avant merge : cinq postes disponibles, plusieurs sessions simultanées, pause/reprise, prolongation, transfert, fin, retry idempotent et scénario négatif de double démarrage du même poste.

## Rollback

Pour #641 :

- repasser `GAMING_SESSIONS` en `PLANNED/HIDDEN/EXPLICIT_DENY` et retirer route/workspace/API de sessions ;
- bloquer les nouveaux démarrages ;
- conserver toutes les sessions et transitions déjà persistées ;
- conserver les postes et actifs ;
- ne supprimer ni réécrire les migrations historiques ;
- les sessions terminées restent auditables même si le module est désactivé.

Le reste du domaine Gaming demeure fail-closed jusqu’à ses lots respectifs.
