# Modèle des activités et tâches standards

## Séparation des responsabilités

- `EnterpriseActivityRequest` conserve le formulaire et le bloc sectoriel par lequel un membre sollicite l'administration de son entreprise.
- `EnterpriseRequest` porte le cycle professionnel de traitement d'une demande interne.
- `EnterpriseTask` porte l'exécution d'un travail assigné.
- Les objets COO historiques restent canoniques dans le contexte DTSC interne tant qu'une convergence explicite n'est pas réalisée.

Une activité ne devient pas automatiquement une tâche. Une tâche ou une demande liée est créée par un service explicite et conserve la référence source complète.

## Tâche canonique

Une tâche contient le contexte entreprise, le créateur, l'assigné, le département, les dates, la priorité, le statut, une révision et une référence source éventuelle.

Extensions de l'itération 4 :

- checklist ordonnée ;
- dépendances dirigées avec refus des cycles ;
- blocages historisés ;
- sous-tâches par `parentTaskId` ;
- progression calculée à partir de la checklist ;
- filtres personnels persistés.

## Progression

La progression n'est retournée que lorsqu'une checklist existe. Elle correspond au ratio des éléments terminés. Les statuts et les sous-tâches restent des informations séparées ; aucun pourcentage arbitraire n'est dérivé d'un simple statut.

## Dépendances

Une dépendance relie un prédécesseur et un successeur de la même organisation. Les contrôles refusent une auto-référence, une tâche inexistante, une relation inter-tenant et tout chemin qui fermerait un cycle.

## Blocages

Un blocage contient un motif, l'auteur, le responsable éventuel, l'état, les dates et le commentaire de résolution. La résolution du dernier blocage actif peut remettre une tâche bloquée en cours, sans effacer l'historique.

## Calendrier

Une tâche datée est projetée dans l'agenda unifié par son identifiant canonique. La modification reste dans le module Tâches.

## Limites

- Les activités DTSC historiques et les activités entreprise ne partagent pas encore un unique modèle de stockage.
- Le board avancé et le réordonnancement graphique des sous-tâches ne sont pas déclarés disponibles.
- Les filtres enregistrés restent privés ; aucun partage n'est activé sans modèle d'autorisation distinct.
