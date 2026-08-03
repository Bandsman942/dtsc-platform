# Guide utilisateur — Tâches et opérations

## Rôle du module

Le module **Tâches et opérations** suit le travail opérationnel d'une entreprise : création, affectation, échéance, statut, checklist, dépendances et blocages.

## Créer une tâche

Cliquez sur **Nouvelle tâche**, puis renseignez le titre, la description, le type, la priorité, le responsable, le département, la date de début et l'échéance. Une référence source peut être utilisée par les services métier lorsqu'une tâche est générée depuis un autre module.

Le responsable sélectionné doit être membre actif de l'entreprise. Les contrôles de contexte et de permission sont exécutés côté serveur.

## Trouver le travail pertinent

La liste permet de rechercher et de filtrer par statut, priorité, responsable, département et retard. Les résultats sont paginés. Les filtres personnels enregistrés sont privés et ne modifient jamais les droits d'accès.

## Cycle de vie

Selon l'état et vos capacités, vous pouvez :

- démarrer une tâche ;
- la bloquer ;
- la reprendre ;
- la terminer ;
- l'annuler ;
- l'archiver si vous êtes responsable autorisé.

Une tâche terminée reste consultable ; l'archivage est une action distincte.

## Checklist et progression

Dans le détail, ajoutez des éléments de checklist et cochez-les au fur et à mesure. La progression est calculée à partir du nombre d'éléments terminés. Lorsqu'aucune checklist n'existe, le module n'invente pas un pourcentage.

## Dépendances

Vous pouvez indiquer qu'une tâche dépend d'une autre. Le serveur refuse :

- une dépendance vers la même tâche ;
- une relation vers une tâche d'une autre organisation ;
- une relation qui créerait un cycle.

Les dépendances sont persistées et restent visibles dans le détail.

## Blocages

Déclarez un blocage avec un motif et, si nécessaire, un responsable de résolution. La tâche passe à l'état bloqué lorsqu'elle était à faire ou en cours. Pour résoudre le blocage, ajoutez un commentaire de résolution. Lorsque le dernier blocage actif est résolu, la tâche reprend l'état en cours.

## Sous-tâches

Une tâche peut être créée avec une tâche parente. La relation utilise l'identifiant canonique de la tâche, jamais le titre. Chaque sous-tâche conserve son propre statut et son propre responsable.

## Calendrier et notifications

Une tâche datée apparaît dans l'agenda unifié selon vos droits. L'affectation peut produire une notification ouvrant le module de tâches. La fin ou la modification de la tâche actualise sa projection au prochain chargement.

## Accès

Les responsables autorisés peuvent voir toutes les tâches du contexte. Les autres utilisateurs voient les tâches qu'ils ont créées ou qui leur sont assignées. Les actions de coordination sont réservées au créateur, à l'assigné ou à un gestionnaire autorisé.

## Limites

- Le board avancé et le partage de filtres ne sont pas annoncés comme disponibles dans cette itération.
- Le réordonnancement graphique des sous-tâches n'est pas exposé si l'interface ne le propose pas.
- Les documents et commentaires utilisent les modules communs ; leur disponibilité dépend des capacités du contexte.
