# DTSC Work Schedule — Sprint 3

## Scope

Ce document décrit le planning de travail interne `DTSC_INTERNAL` du Sprint 3. Il ne crée ni temps travaillé, ni timesheet, ni validation COO de prestation, ni calcul de paie.

La vérité métier est :

`planning hebdomadaire + exceptions/absences -> disponibilité effective`

et jamais :

`disponibilité = travail effectué`.

## Modèle de compatibilité

Pour limiter le risque de migration sur le calendrier partagé avec les entreprises clientes, le Sprint 3 conserve physiquement `CollaboratorAvailability` mais impose une séparation métier stricte côté service et API.

### Disponibilité hebdomadaire

Une disponibilité habituelle DTSC est reconnue uniquement si :

- `organizationId = dtsc-internal` ;
- `recurrenceType = Hebdomadaire` ;
- `specificDate = null` ;
- `availabilityStatus = Disponible` ;
- `dayOfWeek` est renseigné.

`locationMode` décrit le mode de travail (`Site DTSC`, `Télétravail`, `Hybride`, `Non défini`) et n'est plus utilisé comme statut de disponibilité.

`recurrenceStart` et `recurrenceUntil` jouent le rôle de `effectiveFrom` / `effectiveUntil` afin de préserver l'historique lors des changements futurs.

### Exception / absence

Une exception datée DTSC est reconnue si :

- `recurrenceType = Aucune` ;
- `specificDate` est renseigné ;
- `recurrenceStart` et `recurrenceUntil` portent la période date-heure réelle.

Types contrôlés : `ABSENCE`, `LEAVE`, `SICKNESS`, `PERSONAL_ABSENCE`, `ADMINISTRATIVE_ABSENCE`, `MISSION`, `TRAINING`, `REMOTE_WORK`, `EXTRA_AVAILABILITY`, `UNAVAILABLE`, `OTHER`.

Le champ `notes` sert de motif facultatif. Les vues d'équipe masquent le motif détaillé sauf pour le propriétaire du planning, HR & CFO et l'administration technique autorisée.

## Permissions

Pour `DTSC_INTERNAL` :

- chaque collaborateur crée, modifie et supprime uniquement son propre planning ;
- CEO, COO et HR & CFO peuvent disposer d'une vue équipe selon le contexte existant ;
- la visibilité ne confère jamais l'écriture ;
- une tentative de modification croisée est refusée côté API et auditée avec `WORK_SCHEDULE_CROSS_USER_WRITE_DENIED` ;
- les règles `ORGANIZATION` existantes restent sur le comportement calendrier historique.

Le `collaboratorId` d'écriture DTSC est toujours résolu depuis `session.userId -> HrcfoEmployee -> employee.id`. Les payloads du nouveau self-service n'acceptent pas de cible collaborateur arbitraire.

## APIs

- `GET/POST /api/calendar/availabilities` : disponibilité hebdomadaire DTSC en self-service ; comportement historique préservé pour `ORGANIZATION`.
- `PATCH/DELETE /api/calendar/availabilities/:id` : édition propriétaire, overlap serveur et versionnement temporel.
- `GET/POST /api/calendar/exceptions` : absences et exceptions DTSC.
- `PATCH/DELETE /api/calendar/exceptions/:id` : édition propriétaire, historique passé verrouillé.

Les mutations conservent same-origin, validation Zod, rate limit, audit et isolation par organisation.

## Chevauchements

Deux plages hebdomadaires du même collaborateur, du même jour et dont les périodes d'effet se recouvrent ne peuvent pas se chevaucher en heures. Les plages adjacentes restent autorisées ; aucune fusion silencieuse n'est appliquée.

## Historique

Une plage déjà entrée en vigueur n'est pas réécrite silencieusement. Une modification crée un successeur et borne la ligne précédente. Une suppression d'une plage déjà active clôt sa période d'effet. Les exceptions entièrement passées sont en lecture seule.

## Resolver de disponibilité effective

`lib/work-schedule.ts` résout les conflits dans cet ordre :

1. absence / congé / maladie / indisponibilité explicite -> conflit bloquant ;
2. mission / formation -> avertissement ;
3. disponibilité exceptionnelle -> peut étendre le planning habituel ;
4. disponibilité hebdomadaire -> couverture normale ;
5. absence de couverture -> information `Hors disponibilité déclarée`.

Les chevauchements d'événements existants restent des avertissements.

Une absence partielle n'annule que le créneau qu'elle recouvre. Une période multi-jours est comparée directement à la plage date-heure de l'événement.

## Timezone

Les plages hebdomadaires sont des heures locales de planning. Le resolver récupère la timezone utilisateur et utilise `Intl.DateTimeFormat(..., { timeZone })` pour déterminer le jour et l'heure locale d'un événement. Si la timezone enregistrée est invalide, le fallback est UTC.

Les exceptions sont stockées en `DateTime` UTC ; l'UI utilise `datetime-local` et sérialise en ISO avant l'appel API. Cette règle évite les conversions serveur naïves qui peuvent déplacer un lundi vers le dimanche.

## Notifications

Les changements ordinaires de disponibilité hebdomadaire ne déclenchent pas de push responsable.

Une absence significative (au moins 4 heures) notifie COO et HR & CFO. Une mission ou formation proche (moins de 48 heures) peut notifier le COO. Le push n'inclut jamais le motif sensible.

## UX

`Calendrier -> Mon planning` sépare :

- Disponibilités habituelles ;
- Exceptions ;
- Absences ;
- Disponibilités de l'équipe en lecture seule pour les responsables autorisés.

La vue affiche les heures hebdomadaires déclarées, le nombre de jours et le nombre de plages sans imposer 40 h, 5 jours ou 8 h/jour. La copie d'une plage vers d'autres jours est disponible sans fusion automatique.

## Migration

`20260729090000_dtsc_work_schedule_semantics` :

- normalise les anciennes disponibilités hebdomadaires `Télétravail` / `Sur site` vers `Disponible + locationMode` ;
- complète les plages date-heure des anciennes exceptions ponctuelles lorsque la donnée est sûre ;
- ajoute des indexes partiels adaptés au resolver ;
- conserve volontairement les anciennes récurrences ambiguës (par exemple une `Mission` hebdomadaire) au lieu de les convertir aveuglément.

Aucune donnée historique n'est supprimée.

## Sprint 4 readiness

Le Sprint 4 pourra comparer une prestation réellement déclarée à la disponibilité effective calculée ici. Aucun modèle `Timesheet`, `TimeEntry`, `ClockIn`, `WorkSession` ou équivalent n'est créé dans ce Sprint.

Le Sprint 5 devra consommer uniquement les prestations validées, jamais les disponibilités directement.
