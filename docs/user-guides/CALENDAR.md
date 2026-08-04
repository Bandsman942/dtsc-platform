# Guide utilisateur — Calendrier interne

## Rôle du module

Le Calendrier interne permet de consulter son agenda personnel, les événements d’équipe autorisés, les invitations en attente, les disponibilités des collaborateurs et les projections de travail provenant des tâches, demandes, validations, réunions, workflows et documents.

Le calendrier respecte trois règles centrales :

1. le créateur d’un événement en reste le responsable ;
2. les autres collaborateurs sont des participants invités ;
3. un événement ne rejoint le calendrier personnel d’un participant qu’après son acceptation.

## Accéder aux vues

Ouvrez **Calendrier interne** depuis la navigation de l’application. Les vues disponibles sont :

- **Mon calendrier** : événements créés par vous, événements dont vous êtes responsable et événements que vous avez acceptés ;
- **Calendrier équipe** : vue autorisée pour les responsables habilités ;
- **Invitations** : événements auxquels vous êtes invité et auxquels vous n’avez pas encore répondu ;
- **Disponibilités** : exploration professionnelle des plages disponibles, exceptions, absences, missions et modes de travail ;
- **Agenda de travail unifié** : projections autorisées provenant des modules sources.

Les rails de filtres sont horizontalement scrollables sur mobile.

## Explorer les disponibilités

Dans **Disponibilités**, utilisez les filtres réellement fonctionnels :

- Aujourd’hui ;
- Cette semaine ;
- Ce mois ;
- Cette année ;
- Date précise, sélectionnée dans le calendrier ;
- Tous les départements ou un département précis ;
- Tous les statuts ou un statut de disponibilité ;
- Vue Liste ;
- Vue Par collaborateur ;
- Vue Par statut.

Le résultat indique le collaborateur, son poste, son département, son statut, son mode de travail, la période, les horaires et les notes disponibles.

Un responsable ne peut que consulter les disponibilités d’équipe autorisées. Chaque collaborateur reste seul autorisé à modifier ses propres disponibilités, sauf règle métier explicite déjà prévue pour les entreprises clientes.

## Créer un événement

Cliquez sur **Nouvel événement** puis renseignez :

- le titre ;
- le type ;
- la date et l’heure de début ;
- la date et l’heure de fin ;
- la priorité ;
- la visibilité ;
- le mode ou le lieu ;
- la description ou l’agenda ;
- les participants à inviter.

Le responsable est automatiquement le créateur connecté. Il n’est pas possible d’imposer un autre collaborateur comme responsable.

Depuis la liste des collaborateurs ou l’aperçu des disponibilités, l’action d’invitation pré-sélectionne le collaborateur comme **participant**, jamais comme responsable.

## Conflits de planning

Avant la création ou la modification, le serveur vérifie les conflits du responsable et de chaque participant :

- chevauchement avec un autre événement ;
- absence ou congé ;
- indisponibilité ;
- mission ou exception opérationnelle ;
- absence de plage disponible couvrant entièrement le créneau.

Un conflit bloquant empêche l’enregistrement ou l’acceptation. Un avertissement peut exiger une confirmation explicite lorsque la permission de dérogation existe.

Les participants refusés ou les invitations encore en attente ne sont pas traités comme des événements acceptés dans leur agenda personnel.

## Accepter ou refuser une invitation

Ouvrez **Invitations** :

- **Accepter** synchronise l’événement dans votre calendrier après une nouvelle vérification des conflits ;
- **Refuser** informe le créateur et n’ajoute pas l’événement à votre calendrier ;
- le créateur conserve l’événement dans son propre calendrier, quelle que soit votre réponse.

## Modifier ou annuler un événement

Seul le créateur responsable peut modifier ou annuler son événement.

Les détails affichent :

- le responsable ;
- les participants et leur réponse ;
- les conflits ;
- la date de création ;
- la date de dernière modification ;
- la checklist de réalisation ;
- la progression calculée automatiquement.

## Checklist et progression

Ajoutez les résultats concrets à réaliser dans la checklist. La progression est calculée automatiquement :

```text
éléments réalisés ÷ éléments actifs × 100
```

Aucun pourcentage arbitraire n’est demandé à l’utilisateur.

## Proposer automatiquement un créneau

Dans **Outils avancés du calendrier**, ouvrez **Proposer un créneau** :

1. choisissez une période de recherche de quatorze jours maximum ;
2. indiquez la durée ;
3. sélectionnez les participants ;
4. définissez les heures ouvrées ;
5. lancez la recherche.

Le moteur local examine les disponibilités et conflits internes et retourne jusqu’à douze créneaux compatibles. Cette fonction ne nécessite aucune clé externe.

## Réserver une ressource

Les ressources peuvent représenter une salle, un véhicule, un équipement, un poste de travail ou une autre ressource interne.

Les utilisateurs autorisés peuvent :

- créer une ressource ;
- consulter ses réservations à venir ;
- la réserver pour un événement dont ils sont le créateur responsable ;
- l’archiver.

Deux réservations confirmées ne peuvent pas se chevaucher sur la même ressource.

## Synchroniser un calendrier externe

La synchronisation Google Calendar ou Microsoft 365 reste désactivée tant que les variables d’environnement OAuth ne sont pas configurées en Production.

Lorsque le fournisseur n’est pas configuré :

- les boutons sont désactivés ;
- une explication métier est affichée ;
- aucune exception n’est générée ;
- aucune fausse synchronisation n’est annoncée.

Lorsque le fournisseur est configuré, chaque utilisateur doit encore donner son consentement. La synchronisation externe ne contourne jamais les invitations, les conflits ou les permissions internes.

## Agenda unifié et objets sources

Une tâche, demande, validation, réunion, workflow ou échéance documentaire reste gérée par son module source. Cliquez sur **Ouvrir la source** pour accéder à l’objet canonique.

Le calendrier n’effectue aucun double-write permanent et déduplique les projections reliées au même objet.

## Fuseau horaire et liens profonds

Les dates sont enregistrées en UTC et affichées dans le fuseau configuré dans le profil utilisateur.

Les notifications peuvent ouvrir :

- `/calendar?event=...` ;
- `/calendar?invitation=...` ;
- le lien profond du module source.

Les permissions sont revérifiées à chaque ouverture.

## Guide intégré dans l’application

Le bouton **Guide utilisateur** du Calendrier ouvre une version contextuelle, recherchable et adaptée aux fonctions réellement déployées.
