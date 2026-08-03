# Modèle canonique de collaboration standard

## Autorité métier

La collaboration standard repose sur les modèles existants `CollaborationGroup`, `CollaborationGroupMember`, `CollaborationGroupMessage`, `CollaborationGroupCall`, `Announcement` et `AnnouncementComment`. Aucun second moteur de conversations, groupes, utilisateurs, organisations ou notifications n’est créé.

## Contexte

Chaque groupe possède un `contextType` explicite et, lorsque nécessaire, un `organizationId`. Les contextes reconnus sont personnels, organisation cliente, DTSC interne et transversal autorisé. Les groupes transversaux restent limités aux types explicitement allow-listés.

## Conversation directe

Une conversation directe est un `CollaborationGroup` de type `DIRECT`. Sa clé `directKey` est calculée côté serveur à partir du contexte et des deux utilisateurs triés. La contrainte unique garantit la résolution idempotente et empêche deux conversations concurrentes pour la même paire dans le même contexte.

## Participants

`CollaborationGroupMember` porte le rôle `OWNER`, `ADMIN` ou `MEMBER`, le statut, les dates d’entrée/sortie et le dernier message lu. Un participant retiré ou inactif n’est plus autorisé par les services serveur.

## Messages

`CollaborationGroupMessage` porte l’auteur, le groupe, le type, la réponse, le fil, la clé client, l’édition, l’épinglage et la suppression logique. Les réactions, pièces jointes et signalements ont leurs modèles dédiés.

## Suppression et conservation

La suppression d’un message ou commentaire partagé est logique. Le contenu devient un placeholder quand l’historique ou les réponses doivent rester compréhensibles. La suppression physique n’est pas utilisée comme action utilisateur normale.

## Appels

Un appel appartient à un groupe et possède un état serveur, une date d’expiration de sonnerie, une date d’acceptation, une fin et une durée calculée côté serveur. Les participants et événements restent persistés.

## Annonces et commentaires

Une annonce possède une audience et un contexte explicites. Les brouillons sont privés. Les commentaires sont paginés, peuvent répondre, mentionner, réagir, être supprimés logiquement, restaurés et signalés.
