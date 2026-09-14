# Changelog — Gaming Stations #640

Parent : #638
Issue : #640

## Ajouté

- Module `GAMING_STATIONS` rendu `BETA` avec route dédiée, workspace réel et permissions `enterprise.gaming.stations.*`.
- Board responsive des postes de jeu, recherche/filtres serveur, pagination, détail plein écran et actions métier.
- Création d’un poste à partir d’un `EnterpriseAsset` existant de la même organisation.
- Sélecteur d’actifs candidats paginé et filtré côté serveur.
- Actions de modification, mise hors service, remise disponible et archivage avec révision optimiste.
- Signalement d’incident directement dans le domaine canonique Actifs & maintenance.

## Extensibilité

- Les cinq PlayStations du scénario initial ne sont pas une limite.
- Une sixième station et les suivantes utilisent exactement le même flux de création que les premières.
- Aucun slot fixe, quota à cinq ou constante `MAX_STATIONS=5` n’est introduit.
- Le parc croît par pagination et recherche bornées plutôt que par chargement illimité en mémoire.

## Sécurisé

- `organizationId` reste vérifié sur chaque profil et chaque actif référencé.
- Les mutations conservent same-origin, Zod, rate limit, permissions, entitlement, audit et API log.
- Un incident majeur ou une maintenance en cours rend le poste indisponible même si le profil Gaming était marqué disponible.
- La remise disponible est refusée tant que le blocage canonique de l’actif existe.
- L’archivage est refusé si une session live/en attente ou une réservation active référence le poste.

## Sources de vérité

- Aucun `GamingAsset`, `GamingIncident` ou `GamingMaintenance` n’est créé.
- Console, site, catégorie, numéro de série, état physique, incidents et maintenances restent portés par `EnterpriseAsset` et ses modèles associés.
- `EnterpriseGamingStationProfile` ne conserve que les métadonnées propres au fonctionnement du poste dans le Gaming Lounge.

## Qualité

- `scripts/qa-640-gaming-stations-assets.mjs` protège le registre BETA, l’isolation tenant, les APIs, l’UX dynamique, la pagination, les sources de vérité et l’absence de plafond à cinq postes.
- La QA #639 est mise à jour pour exiger l’évolution contrôlée de `GAMING_STATIONS` tout en gardant les huit autres modules Gaming fail-closed.
- Le test #640 est raccordé à `qa:regression`.

## Maturité

- `GAMING_STATIONS` est `BETA`, pas `COMMERCIAL_READY`.
- `GAMING_LOUNGE` reste `PLANNED` dans l’onboarding normal jusqu’à #646.
- `OWNER_E2E` reste obligatoire avant fusion de #640 : associer cinq postes, ajouter une sixième station, signaler un incident puis remettre le poste disponible après résolution du blocage.

## Rollback

- Repasser `GAMING_STATIONS` en fail-closed et retirer la route/workspace applicatifs.
- Conserver les profils Gaming et tous les actifs/historiques Asset ; aucun rollback destructif n’est requis.
