# Guide utilisateur — Réunions

## Rôle du module

Le module **Réunions** couvre la planification, les participants, l'ordre du jour, le compte rendu et les actions de suivi. Une réunion datée apparaît dans le Calendrier selon les droits des participants.

## Créer une réunion

Cliquez sur **Nouvelle réunion** et renseignez :

- le titre et l'objet ;
- la date et l'heure de début et de fin ;
- le mode et le lieu ou lien d'appel ;
- l'organisateur ;
- les participants actifs ;
- le département et la source éventuelle.

Le serveur vérifie l'organisation, les membres, les dates et les permissions. Le moteur calendrier reste responsable de la détection des conflits lorsqu'il est appelé par le parcours de planification.

## Invitations

Les participants sont persistés avec leur statut. Les notifications ouvrent la réunion exacte. L'acceptation, le refus ou la proposition d'un autre créneau ne sont affichés que si le parcours correspondant est réellement disponible.

## Ordre du jour

Dans le détail de la réunion, ajoutez des sujets avec :

- un titre et une description ;
- un responsable facultatif ;
- une durée estimée ;
- une position ;
- un statut de traitement.

Les sujets restent liés à l'identifiant de la réunion et peuvent être utilisés comme origine d'une action de suivi.

## Compte rendu

Enregistrez un compte rendu avec les participants présents, les absents et le contenu. Chaque enregistrement crée une version. Une version publiée conserve l'auteur, la date de publication et son numéro ; elle n'est pas remplacée silencieusement par une nouvelle saisie.

## Décisions

Les décisions métier existantes de la réunion restent historisées. Elles peuvent servir de contexte à une action de suivi, mais ne sont pas converties en tâches sans action explicite.

## Actions de suivi

Utilisez **Créer une action de suivi** pour créer une vraie tâche avec un responsable et une échéance. Le système :

1. crée la tâche dans le module Tâches ;
2. crée un lien réunion → tâche ;
3. conserve éventuellement le sujet d'ordre du jour d'origine ;
4. rend la tâche visible dans le Calendrier lorsqu'elle est datée.

Une action de suivi ne reste donc pas un simple texte dans le compte rendu.

## Appels audio et vidéo

Lorsqu'un lien d'appel est associé, la réunion réutilise l'infrastructure Collaboration déjà déployée. Les droits de rejoindre et l'état réel de l'appel sont contrôlés par ce moteur ; aucun second système d'appel n'est créé.

## Archivage et annulation

Une réunion annulée ou archivée reste consultable selon les règles de conservation. Les actions et comptes rendus déjà produits ne sont pas supprimés par l'annulation.

## Limites

- La proposition automatique de créneaux n'est pas annoncée si le moteur ne la fournit pas.
- Les invités externes et les réponses de calendrier externes ne sont disponibles que si une intégration réelle existe.
- L'édition collaborative simultanée du compte rendu n'est pas garantie ; les versions protègent l'historique.
