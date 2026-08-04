# Guide utilisateur — Demandes internes

## Rôle du module

Le module **Demandes internes** formalise un besoin adressé à un collaborateur, une équipe ou un responsable de l’organisation active.

Le bouton **Guide utilisateur** ouvre cette aide directement dans l’application.

## Créer une demande

Renseignez le type, le titre, la description, la priorité, le destinataire ou le département, l’échéance et les documents éventuels.

Le destinataire doit être actif dans la même organisation. Toutes les références sont contrôlées côté serveur.

## Vue Liste et Kanban

La vue Liste permet la recherche et les filtres.

La vue Kanban regroupe les demandes selon leur état : à traiter, en cours, en attente d’information, bloquées, résolues ou clôturées.

Le changement de statut est réservé au destinataire explicite, au responsable enregistré ou à une permission individuelle dédiée. Une vue de supervision n’accorde pas automatiquement le droit de traiter la demande.

## Cycle de traitement

Les actions possibles comprennent :

- soumettre ;
- prendre en charge ;
- demander une information ;
- répondre ;
- reprendre ;
- résoudre ;
- clôturer ;
- rouvrir ;
- rejeter ou annuler avec un motif.

Chaque transition est auditée et conserve son acteur, sa date, le statut précédent, le nouveau statut et le motif.

## Checklist et progression

Une demande peut contenir une checklist de résultats attendus. Le destinataire coche les éléments réalisés et la progression est calculée automatiquement.

## Demande d’information

Lorsqu’une information manque, le responsable explique précisément ce qui est attendu. Le demandeur répond dans le même objet. L’historique conserve les deux actions.

## Résolution, clôture et réouverture

**Résolue** signifie qu’une solution a été fournie. **Clôturée** signifie que le processus est terminé.

Une réouverture crée un nouvel événement d’historique ; elle ne supprime pas la résolution précédente.

## Commentaires, mentions et documents

Les utilisateurs autorisés peuvent commenter et mentionner des collaborateurs. Les mentions cliquables proposent des actions professionnelles soumises aux permissions de destination.

Les documents utilisent le stockage privé et versionné du module Documents.

## SLA avancé

Une politique SLA réelle peut être rattachée à la demande. Elle définit :

- une durée cible ;
- un délai d’avertissement ;
- les statuts de départ et d’arrêt ;
- les acteurs d’escalade éventuels.

Le SLA calcule les états RUNNING, WARNING et BREACHED. Il ne modifie pas automatiquement le statut métier de la demande.

## Notifications et liens profonds

Les affectations, réponses, mentions, résolutions et réouvertures peuvent produire une notification ouvrant la demande exacte. Les permissions sont revérifiées à l’ouverture.
