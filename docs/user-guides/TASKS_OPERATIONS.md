# Guide utilisateur — Tâches et opérations
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Tâches et opérations** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Rôle du module

Le module **Tâches et opérations** permet de planifier, assigner, exécuter et suivre le travail opérationnel dans le contexte actif.

Le bouton **Guide utilisateur** de l’en-tête ouvre la version contextuelle du présent guide dans l’application.

## Créer une tâche ou une opération

Renseignez :

- le titre et le résultat attendu ;
- le responsable ou l’assigné actif ;
- le département ;
- la priorité ;
- les dates ;
- la description ;
- la checklist initiale ;
- les dépendances éventuelles.

Toutes les références sont revérifiées dans la même organisation.

## Vues Liste et Kanban

La vue Liste permet la recherche, les filtres et la pagination.

La vue Kanban regroupe les objets selon leurs statuts réels. Une transition n’est enregistrée que si le serveur confirme que l’utilisateur est le destinataire, l’assigné ou le responsable explicite.

Les superviseurs peuvent consulter un périmètre élargi, mais ne deviennent pas automatiquement responsables de chaque opération.

## Checklist et progression

La progression provient exclusivement des éléments actifs de la checklist :

```text
éléments réalisés ÷ éléments actifs × 100
```

Le responsable peut ajouter, cocher, décocher et retirer les éléments. Chaque réalisation conserve sa date et son auteur.

Une tâche ne peut pas être terminée ou soumise à validation lorsque :

- aucune checklist n’existe ;
- un élément reste non réalisé ;
- la progression calculée est inférieure à 100 %.

## Statuts et historique

Les transitions autorisées dépendent de l’état courant et de la responsabilité enregistrée. Chaque transition conserve :

- l’ancien statut ;
- le nouveau statut ;
- l’acteur ;
- la date ;
- le motif ;
- la progression calculée.

## Dépendances et sous-tâches

Le serveur refuse :

- une dépendance vers la même tâche ;
- une dépendance vers une autre organisation ;
- une dépendance créant un cycle.

Les sous-tâches conservent leur propre responsable, leur checklist et leur statut.

## Blocages

Un blocage exige un motif. Il peut créer un objet de blocage lié à la tâche ou à l’opération.

Le responsable de résolution documente la correction. La résolution du dernier blocage actif permet la reprise du processus lorsque le workflow le prévoit.

## Commentaires et mentions

Les participants autorisés peuvent échanger dans le détail de l’objet. Les mentions cliquables proposent des actions professionnelles sans contourner les permissions de destination.

## Filtres sauvegardés

Les filtres personnels peuvent être enregistrés pour retrouver un périmètre de travail. Un filtre ne change jamais les permissions serveur.

## Calendrier, documents et SLA

Une tâche datée apparaît dans l’agenda unifié selon les droits de l’utilisateur.

Les documents restent gérés dans le module Documents et peuvent être liés à plusieurs objets sans duplication.

Une politique SLA peut être rattachée à une tâche ou une opération. Elle calcule une échéance, un avertissement et un dépassement, sans modifier automatiquement le statut métier.

## Accès et permissions

- Ouvrez le module depuis la navigation du contexte actif.
- Les boutons et actions dépendent du rôle, du poste officiel, des permissions individuelles, du tenant actif et de l’état du module.
- Une action masquée dans l’interface reste également refusée par le serveur lorsqu’elle n’est pas autorisée.
- Sur mobile, utilisez le parcours liste → détail plein écran → formulaire plein écran → retour.

## Statuts, validations et traçabilité

- Les statuts visibles correspondent aux états réellement persistés ; les codes techniques ne sont pas présentés comme libellés métier.
- Les validations, refus, annulations, réouvertures et actions sensibles conservent leur auteur, leur date et, lorsque requis, leur motif.
- Une action répétée avec la même clé métier ne doit pas produire de doublon ni un second impact.

## Sécurité et confidentialité

- Les données sont limitées à l’utilisateur ou à l’organisation autorisée.
- Les références reçues du navigateur sont revérifiées côté serveur dans le même contexte.
- Les documents et informations sensibles utilisent les routes privées et les contrôles d’accès prévus par le module.

## Dépannage

- Actualisez la vue si une opération validée n’apparaît pas immédiatement.
- Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau.
- En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.
