# Guide utilisateur — Demandes internes
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Demandes internes** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

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
