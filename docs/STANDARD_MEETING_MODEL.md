# Modèle standard des réunions

## Autorité canonique

`EnterpriseMeeting` est la source de vérité pour la réunion entreprise. Elle conserve l'organisateur, les dates, le mode, le lieu, le lien d'appel, le département, les participants, le statut, le compte rendu courant et la révision.

## Participants et planification

Les participants sont persistés avec leur rôle et leur réponse. Ils doivent être membres actifs de l'organisation. La détection de conflit compare les réunions qui se chevauchent pour l'organisateur et les participants non déclinés.

Le Calendrier affiche une projection de la réunion par son identifiant canonique et ouvre `/enterprise-modules/MEETINGS?meeting={id}`.

## Ordre du jour

`EnterpriseMeetingAgendaItem` porte : titre, description, responsable, durée, position, statut, auteur et dates. Un élément lié à une action de suivi ne peut plus être supprimé sans traiter ce lien.

## Compte rendu

`EnterpriseMeetingMinutesVersion` conserve chaque version, les présents, les absents, l'auteur, l'état brouillon/publié et la date de publication. L'enregistrement actualise le champ `minutes` de la réunion pour compatibilité, sans supprimer les versions.

## Décisions et actions

Les décisions existantes de réunion sont persistées séparément. Une décision peut créer une véritable tâche par la route dédiée. Le panneau de coordination peut aussi lier une tâche existante avec `EnterpriseMeetingAction`.

Ainsi, une action de suivi référence toujours un `EnterpriseTask` réel ; elle n'est pas un texte isolé dans le compte rendu.

## Appels

Le lien d'appel reste géré par l'infrastructure Collaboration. La réunion ne crée ni salle, ni jeton, ni état d'appel parallèle.

## Accès et audit

L'organisateur ou le gestionnaire autorisé modifie l'ordre du jour, le compte rendu et les liens de tâches. Les participants autorisés consultent la réunion. Les actions sensibles produisent des événements opérationnels et des audits API.

## Limites

- La proposition automatique de créneau et la réservation de salle ne sont pas introduites.
- Les invitations externes et calendriers tiers nécessitent une intégration distincte.
- Le modèle permet de lier ou créer une tâche depuis une décision ; il ne génère pas automatiquement une tâche pour chaque ligne du compte rendu.
