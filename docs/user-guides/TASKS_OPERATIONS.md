# Guide utilisateur — Tâches et opérations

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
