# ERP Gaming Lounge — architecture et programme

## Statut

- Programme : #638
- Fondation fusionnée : #639
- Lot courant : #640 — postes de jeu intégrés aux Actifs & maintenance
- Secteur canonique : `HOSPITALITY_EVENTS`
- Sous-secteur : `GAMING_LOUNGE`
- Classification du sous-secteur : `PLANNED` jusqu’au lot d’onboarding #646
- Premier module fonctionnel : `GAMING_STATIONS` en `BETA` à partir de #640
- Statut commercial global : non `COMMERCIAL_READY`

Le sous-secteur reste volontairement **fail-closed** pour les parcours d’onboarding normaux jusqu’à #646. Les lots intermédiaires peuvent rendre une capacité réelle `BETA` afin de la valider de façon isolée sans prétendre que tout le Gaming Lounge est commercialisable.

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

DTSC Platform ne modélise pas ce métier comme un second Shop ni comme un ensemble de CRUD génériques. Le domaine Gaming complète les domaines ERP communs sans les dupliquer.

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

`GAMING_LOUNGE` reste `PLANNED` pendant les lots #639 à #645. Le helper générique `listBusinessSubtypesForSector()` exclut les sous-secteurs `PLANNED` par défaut ; le sous-secteur ne devient donc pas prématurément sélectionnable dans l’onboarding commercial.

Le passage de la classification à `ACTIVE` appartient à #646 et exige le runtime minimal, l’onboarding, les permissions, les activités, les guides et les preuves QA/OWNER_E2E de commercial readiness.

## Registre de modules après #640

Le registre `lib/enterprise/module-registry-gaming.json` est fusionné dans le registre canonique.

`GAMING_STATIONS` est la seule capacité fonctionnelle du lot #640 :

- `implementationStatus: BETA` ;
- `routeKind: DEDICATED_CORE` ;
- route `/enterprise-modules/GAMING_STATIONS` ;
- workspace `ENTERPRISE_GAMING_STATIONS` ;
- `accessPolicy: POSITION_PERMISSION` ;
- permission prefix `enterprise.gaming.stations.` ;
- dépendances `ASSETS_MAINTENANCE` et `SITES_WAREHOUSES` ;
- plan minimum `BUSINESS` avec abonnement actif.

Les huit autres modules restent strictement `PLANNED`, `HIDDEN`, sans workspace et avec `EXPLICIT_DENY` :

- `GAMING_DASHBOARD` ;
- `GAMING_SESSIONS` ;
- `GAMING_BOOKINGS` ;
- `GAMING_PRICING_PACKAGES` ;
- `GAMING_CHECKOUT` ;
- `GAMING_DAILY_CLOSE` ;
- `GAMING_TOURNAMENTS` ;
- `GAMING_REPORTS`.

La connaissance d’un code module ne donne jamais un droit. Le resolver canonique conserve les contrôles membership, secteur/sous-secteur, module tenant, dépendances, entitlement et permission.

## Parc de postes #640 : extensible, jamais limité à cinq

Le scénario de lancement prévoit cinq PlayStations, mais ce chiffre décrit uniquement le parc initial du premier Gaming Lounge. Il ne constitue **aucune limite produit ni technique**.

Le contrat durable est :

1. une organisation peut ajouter une sixième console puis autant de postes supplémentaires que son exploitation le nécessite ;
2. toutes les stations suivent le même flux : `EnterpriseAsset` canonique → `EnterpriseGamingStationProfile` → board Gaming ;
3. aucun tableau de cinq slots, quota à cinq, `MAX_STATIONS=5` ou validation équivalente n’est autorisé ;
4. la croissance du parc est absorbée par pagination, recherche et filtres serveur bornés ;
5. archiver un profil Gaming ne supprime jamais l’actif ni son historique maintenance ;
6. le nombre de postes n’est pas stocké dans une configuration globale : il correspond au nombre réel de profils actifs du tenant.

Le test OWNER_E2E de #640 doit explicitement créer/associer cinq postes puis ajouter une sixième station sans migration, changement de code ni configuration spéciale.

## `EnterpriseGamingStationProfile`

Le profil Gaming est une **extension** d’un actif commun, pas un actif parallèle. Il persiste uniquement les métadonnées propres à l’exploitation Gaming :

- `stationCode` ;
- nom d’affichage ;
- famille/type de console ;
- nombre maximum de joueurs ;
- ordre d’affichage ;
- état Gaming manuel ;
- notes ;
- révision et archivage.

Le `site`, le numéro de série, la catégorie, l’état physique, les incidents et la maintenance proviennent toujours de `EnterpriseAsset` et de ses domaines canoniques.

La paire `(organizationId, assetId)` est unique : un actif ne peut pas représenter deux postes Gaming dans le même tenant. `stationCode` est également unique dans le tenant.

## État effectif d’un poste

Le statut affiché par le board ne fait pas confiance uniquement au profil Gaming. Il est dérivé côté serveur :

1. actif archivé ou `DISPOSED` → `OUT_OF_SERVICE` ;
2. incident Asset ouvert `HIGH` ou `CRITICAL` → `OUT_OF_SERVICE` ;
3. maintenance Asset `IN_PROGRESS` → `MAINTENANCE` ;
4. sinon le statut Gaming du profil s’applique.

Cela évite qu’un poste soit présenté “Disponible” alors que sa console est réellement en panne ou en maintenance.

Dans #640, les opérateurs peuvent mettre manuellement un poste hors service ou le rendre disponible. `IN_USE` et `RESERVED` sont réservés aux moteurs transactionnels #641 et #642. Une remise à `AVAILABLE` est refusée tant qu’un blocage canonique Asset subsiste.

## Création et sélection des actifs

Le formulaire Gaming ne demande jamais de saisir un `assetId` brut. Il utilise une sélection alimentée par l’API de candidats :

- même `organizationId` ;
- actif non archivé ;
- actif non `DISPOSED` ;
- actif qui n’a jamais déjà été projeté comme station Gaming ;
- recherche et pagination serveur ;
- aucune limite basée sur le nombre initial de PlayStations.

La mutation recharge toujours l’actif côté serveur dans le même tenant avant de créer le profil.

## Incidents et maintenance

#640 ne crée ni `GamingIncident` ni `GamingMaintenance`.

Le bouton **Signaler un incident** appelle la route canonique Asset `/assets/[assetId]/incidents`. Le détail Gaming affiche les blocages issus de `EnterpriseAssetIncident` et `EnterpriseAssetMaintenance`.

L’archivage d’un poste est refusé lorsqu’une session live/en attente ou une réservation confirmée/check-in le référence. Cette protection prépare les lots #641/#642 sans supprimer leur historique.

## Modèles de fondation conservés

Le schéma `prisma/enterprise-gaming.prisma` contient :

- `EnterpriseGamingConfiguration` ;
- `EnterpriseGamingStationProfile` ;
- `EnterpriseGamingBooking` ;
- `EnterpriseGamingPricingRule` ;
- `EnterpriseGamingSession`.

#640 ne nécessite pas de nouvelle table : il consomme le modèle station déjà introduit par #639. La migration de fondation reste additive et son historique n’est pas réécrit.

### Sessions

Les invariants préparés par #639 restent applicables :

1. les timestamps serveur sont l’autorité ;
2. `pausedSeconds` et `billableSeconds` sont validés côté serveur ;
3. `pricingSnapshotJson`, devise et montants expliquent l’historique ;
4. `idempotencyKey` prépare les transitions rejouables ;
5. une réservation ne convertit qu’une session ;
6. l’index `GamingSession_one_live_per_station_key` interdit deux sessions `ACTIVE`/`PAUSED` simultanées sur une station.

Le moteur transactionnel complet appartient à #641.

## Isolation multi-tenant et sécurité

Toutes les entités Gaming portent `organizationId`. Les références cross-domain telles que `assetId`, `businessPartyId` et `serviceCatalogItemId` sont rechargées côté service dans le même tenant ; une clé valide d’une autre organisation est traitée comme introuvable.

Le contrat serveur des stations suit :

```text
session
→ activeOrganizationId
→ membership actif
→ organisation cliente active
→ HOSPITALITY_EVENTS + GAMING_LOUNGE
→ GAMING_STATIONS BETA + module tenant activé
→ dépendances ASSETS_MAINTENANCE / SITES_WAREHOUSES
→ entitlement
→ permission enterprise.gaming.stations.*
→ revalidation Asset same-tenant
→ same-origin sur mutation
→ Zod
→ await rateLimit
→ révision optimiste
→ ApiLog
→ AuditLog
```

Un rôle global DTSC n’accorde aucun accès automatique aux données privées d’un client.

## Finance et devises

Le domaine Gaming ne maintient aucun solde. Les montants à encaisser seront transformés par #644 en objets commerciaux/financiers communs.

Une devise est conservée sur le snapshot de session/tarif pour expliquer l’historique. Des montants de devises différentes ne doivent jamais être additionnés directement sans conversion explicite.

## Programme d’implémentation

- #639 — fondation canonique du sous-secteur et contrat de données — fusionné ;
- #640 — postes de jeu intégrés aux Actifs & maintenance — module `GAMING_STATIONS` BETA ;
- #641 — moteur de sessions minutées, concurrence et occupation ;
- #642 — réservations, joueurs et conversion en session ;
- #643 — tarification, forfaits et calcul serveur ;
- #644 — checkout, paiements, reçus et clôture Gaming ;
- #645 — tournois, maintenance intégrée, reporting et DTSC AI ;
- #646 — onboarding, activités, guides, QA et commercial readiness.

## QA

`qa-639-gaming-lounge-foundation.mjs` continue de protéger :

- classification du sous-secteur ;
- sources de vérité uniques ;
- modèles et migration de fondation ;
- registre canonique ;
- absence de sources Asset/Customer/Catalog/Payment/Cash parallèles ;
- dépendances et absence de cycles.

`qa-640-gaming-stations-assets.mjs` ajoute :

- `GAMING_STATIONS=BETA` et les huit autres modules fail-closed ;
- permission/access/entitlement contract ;
- revalidation `EnterpriseAsset` same-tenant ;
- statut effectif basé sur incidents/maintenance canoniques ;
- API paginées, same-origin/Zod/rate-limit/audit ;
- board dynamique et détail plein écran ;
- incident envoyé à la route Asset existante ;
- interdiction explicite d’un plafond de cinq stations ;
- branchement dans `qa:regression`.

#640 est user-facing et son contrat exige `OWNER_E2E`. Une CI verte ne remplace pas ce scénario propriétaire.

## Rollback

Pour #640 :

- repasser `GAMING_STATIONS` en fail-closed et retirer sa route/workspace ;
- conserver les profils stations déjà créés afin de ne pas effacer l’historique ;
- conserver tous les `EnterpriseAsset`, incidents et maintenances ;
- ne réécrire aucune migration historique.

Le reste du domaine Gaming demeure `PLANNED` jusqu’à ses lots respectifs.
