# DTSC Work Schedule — Sprint 3

## Objectif

Le Sprint 3 sépare explicitement le **planning attendu** du **travail réellement effectué**.

La chaîne métier est :

```text
Disponibilité hebdomadaire habituelle
        +
Exceptions / absences datées
        ↓
Disponibilité effective pour une date et un créneau
```

Cette donnée est uniquement une donnée de planification. Elle ne crée jamais de prestation, de temps travaillé, de retenue, de prime, de bulletin ou de paie.

Les futurs flux restent :

```text
Disponibilité effective
        ↓
Sprint 4 — prestation réellement déclarée
        ↓
validation COO / contre-validation appropriée
        ↓
Sprint 5 — traitement HR & CFO
        ↓
paie
```

## Périmètre

La nouvelle politique décrite ici s'applique d'abord à `DTSC_INTERNAL`.

Les entreprises clientes `ORGANIZATION` continuent à utiliser le comportement historique de `CollaboratorAvailability` afin d'éviter de réinterpréter arbitrairement leurs données. Une évolution sectorielle ultérieure pourra migrer leur planning avec ses propres règles métier.

## Stockage physique et séparation métier

Le Sprint 3 conserve volontairement la table Prisma `CollaboratorAvailability` afin de ne pas déplacer ou perdre des données historiques ambiguës.

La séparation est assurée par des contrats stricts de service/API/UI :

### Disponibilité hebdomadaire DTSC

Représentation canonique :

```text
recurrenceType     = Hebdomadaire
availabilityStatus = Disponible
specificDate       = null
dayOfWeek          = 0..6
recurrenceStart    = effectiveFrom
recurrenceUntil    = effectiveUntil
startTime/endTime  = heures locales de planning
locationMode       = où/comment la personne prévoit de travailler
```

Une disponibilité habituelle ne porte pas un statut `Absent`, `Congé`, `Mission` ou `Télétravail`. Le mode de travail est porté par `locationMode`.

### Exception / absence DTSC

Représentation canonique :

```text
recurrenceType  = Aucune
specificDate    = date de début
recurrenceUntil = date de fin
startTime       = début du premier jour
endTime         = fin du dernier jour
availabilityStatus = libellé contrôlé correspondant au type d'exception
```

Types métier contrôlés :

- `ABSENCE`
- `LEAVE`
- `SICKNESS`
- `MISSION`
- `TRAINING`
- `REMOTE_WORK`
- `EXTRA_AVAILABILITY`
- `UNAVAILABLE`
- `OTHER`

Les absences constituent un sous-ensemble fonctionnel des exceptions datées, avec une UX séparée.

## Pourquoi aucune migration destructive des anciennes lignes

L'ancien modèle mélangeait notamment :

- Disponible ;
- Télétravail ;
- Sur site ;
- Absent ;
- Congé ;
- Indisponible ;
- Mission.

Une conversion automatique serait dangereuse. Une `Mission` récurrente n'est pas nécessairement équivalente à une mission ponctuelle ; une ancienne ligne `Télétravail` peut représenter un mode récurrent ou un changement daté.

La migration `20260729011500_sprint03_work_schedule_boundaries` est donc non destructive : elle normalise uniquement `recurrenceInterval` si une ancienne donnée contient une valeur invalide et laisse le resolver de compatibilité interpréter les anciennes lignes.

## Permissions

### Écriture DTSC

Règle absolue :

```text
write target = session.userId → HrcfoEmployee.id
```

Le `collaboratorId` envoyé par le navigateur n'est jamais une autorité.

Toute tentative de POST/PATCH/DELETE visant un autre `HrcfoEmployee` est refusée côté serveur, y compris pour :

- CEO ;
- COO ;
- HR & CFO ;
- ADMIN dans le workflow métier normal.

Chaque responsable gère son propre planning selon la même règle.

### Lecture DTSC

- collaborateur ordinaire : son propre planning ;
- CEO : visibilité organisationnelle ;
- COO : visibilité opérationnelle organisationnelle ;
- HR & CFO : visibilité organisationnelle nécessaire aux responsabilités RH ;
- autres rôles : leur propre planning sauf règle explicite supplémentaire.

La permission de lecture n'accorde jamais la propriété d'écriture.

### Entreprises clientes

Les règles historiques `ORGANIZATION` sont conservées dans ce Sprint. Le durcissement self-service DTSC ne doit pas réinterpréter les permissions de leurs calendriers.

## Historique et modification rétroactive

Les données passées sont protégées.

Pour une disponibilité habituelle déjà active dans le passé, une modification future ne réécrit pas la ligne historique :

1. l'ancienne version est clôturée à la veille de la nouvelle date d'effet ;
2. une nouvelle ligne prend effet à la date choisie ;
3. l'audit enregistre le lien avec la version précédente.

Une version entièrement passée devient en lecture seule.

Pour une exception/absence datée déjà passée, PATCH et DELETE sont refusés dans le workflow self-service. Un éventuel workflow de correction historique est hors Sprint 3.

## Validation des plages

Les contrats Zod imposent :

- `HH:mm` valide ;
- heure de début strictement antérieure à l'heure de fin sur une même journée ;
- jour de semaine entre 0 et 6 ;
- date de fin postérieure ou égale à la date de début ;
- types et `locationMode` contrôlés ;
- longueur du motif/note bornée ;
- payloads stricts sans propriétés inattendues.

Les disponibilités hebdomadaires qui se chevauchent sur la même période d'effet sont rejetées. Les plages adjacentes restent acceptées et ne sont pas fusionnées automatiquement.

## Absence partielle et multi-jours

Une absence peut être :

```text
08:00 → 12:00
```

ou couvrir plusieurs jours :

```text
2026-08-03 08:00
→
2026-08-07 17:00
```

Le resolver développe la période par journée. Le premier et le dernier jour conservent leurs heures partielles ; les journées intermédiaires couvrent la journée entière.

## Resolver de disponibilité effective

Source : `lib/work-schedule.ts`.

Pour chaque journée du créneau demandé :

1. charger les plages hebdomadaires applicables ;
2. ajouter les disponibilités exceptionnelles ;
3. appliquer les absences/indisponibilités comme blocages ;
4. conserver mission/formation comme avertissements opérationnels ;
5. appliquer le fallback de compatibilité aux anciennes lignes ;
6. produire l'état effectif utilisé par `detectCalendarConflicts()`.

Priorité fonctionnelle :

```text
Absence / indisponibilité bloquante
        >
Exception spécifique
        >
Disponibilité hebdomadaire
```

Une disponibilité supplémentaire peut étendre la semaine habituelle.

## Niveaux de conflit calendrier

### Bloquant

- absence ;
- congé ;
- maladie ;
- indisponibilité explicite.

### Avertissement

- mission ;
- formation ;
- chevauchement avec un autre événement.

### Information

- événement hors disponibilité déclarée lorsque le collaborateur a configuré un planning.

L'absence de planning ne bloque pas automatiquement la création d'un événement.

## Timezone

Les heures hebdomadaires sont des **heures locales de planning**.

Les événements datés restent stockés en `DateTime` selon les conventions existantes, puis le resolver les projette dans la timezone du collaborateur avec `Intl.DateTimeFormat(..., { timeZone })` avant de comparer jour et minutes locales.

`Africa/Kinshasa` est uniquement le fallback lorsque aucune préférence utilisateur n'est disponible ; il n'est pas codé comme unique timezone autorisée.

## Projection calendrier

Le Sprint 3 adopte une projection calculée : la source métier reste `CollaboratorAvailability` avec ses contrats hebdomadaires/exceptions. Aucun événement manuel dupliqué n'est créé automatiquement pour une absence.

Cela évite une double source de vérité non synchronisée. Le calendrier et le détecteur de conflits lisent directement le planning effectif.

Les événements manuels existants — réunion, tâche, appel, deadline, etc. — restent inchangés.

## Confidentialité

Le type opérationnel d'une absence peut être visible dans la vue équipe. Le motif détaillé est :

- visible par l'auteur ;
- visible par HR & CFO dans la lecture RH ;
- masqué dans les vues opérationnelles CEO/COO ;
- absent des notifications Web Push.

Un motif médical détaillé ne doit jamais être copié dans une notification d'écran verrouillé.

## Notifications

Politique Sprint 3 :

- changement ordinaire de disponibilité hebdomadaire : pas de push responsable ;
- absence/congé/maladie/indisponibilité significative : notification COO + HR & CFO ;
- mission/formation : notification COO ;
- disponibilité supplémentaire ou télétravail exceptionnel : pas de push systématique.

Les notifications passent par `notifyUsers`, donc la distribution Web Push existante reste centralisée.

## API

### Planning personnel

```text
GET /api/calendar/my-schedule
```

Retourne planning hebdomadaire, exceptions, résumé et politique active.

### Disponibilités hebdomadaires

```text
POST   /api/calendar/availabilities
PATCH  /api/calendar/availabilities/:id
DELETE /api/calendar/availabilities/:id
```

Les routes historiques sont conservées pour compatibilité. En `DTSC_INTERNAL`, les nouveaux payloads stricts représentent uniquement une disponibilité habituelle ; l'ancien formulaire reste toléré en mode de compatibilité mais ne peut écrire que sur le collaborateur de la session.

### Exceptions et absences

```text
GET    /api/calendar/exceptions
POST   /api/calendar/exceptions
GET    /api/calendar/exceptions/:id
PATCH  /api/calendar/exceptions/:id
DELETE /api/calendar/exceptions/:id
```

Ces routes sont réservées à `DTSC_INTERNAL` dans ce Sprint.

Toutes les mutations conservent :

- session ;
- same-origin ;
- rate limit ;
- Zod strict ;
- contrôle organisation ;
- contrôle propriétaire ;
- audit.

## Audit

Nouvelles actions :

```text
WORK_AVAILABILITY_CREATED
WORK_AVAILABILITY_UPDATED
WORK_AVAILABILITY_DELETED
WORK_SCHEDULE_EXCEPTION_CREATED
WORK_SCHEDULE_EXCEPTION_UPDATED
WORK_SCHEDULE_EXCEPTION_DELETED
```

Les anciennes actions `INTERNAL_CALENDAR_AVAILABILITY_*` restent utilisées uniquement par le chemin de compatibilité historique.

## UX

Le calendrier DTSC expose un workspace `Mon planning` avec :

- indicateurs hebdomadaires ;
- Disponibilités habituelles ;
- Exceptions ;
- Absences ;
- Disponibilités de l'équipe pour les responsables autorisés.

La vue équipe est explicitement en lecture seule.

Les formulaires utilisent des dialogues plein écran utile / grande hauteur, les primitives workspace existantes et le contrat visuel :

```text
module → section → liste → détail/action
```

Le composant conserve les garde-fous de viewport/safe-area déjà présents dans les primitives communes iOS.

## Résumé hebdomadaire

Le nombre d'heures affiché correspond à la somme des plages habituelles actives de la semaine. Il n'impose aucune norme de 40 h / 5 jours.

`HrcfoEmployee` ne contient actuellement pas de contrainte contractuelle structurée de type `weeklyHours` ou `minimumHours`. Le Sprint 3 n'en invente donc pas. La couche `lib/work-schedule.ts` constitue le point d'extension futur pour ces politiques.

## Performance

Les requêtes de planning sont bornées (`take`) et les vues équipe ne chargent pas tout l'historique sans limite.

Le modèle dispose déjà d'indexes sur :

- organisation + collaborateur + jour ;
- organisation + collaborateur + date spécifique ;
- organisation + collaborateur + récurrence/date de début ;
- collaborateur + date/jour.

Le Sprint 3 n'ajoute pas de nouvel index SQL non représenté dans Prisma afin d'éviter un drift de schéma.

## Compatibilité des anciennes données

Le resolver conserve un fallback pour :

- lignes datées historiques ;
- récurrences `Hebdomadaire`, `Quotidienne`, `Mensuelle` ;
- anciens statuts `Disponible`, `Télétravail`, `Sur site`, `Absent`, `Congé`, `Indisponible`, `Mission`.

Cette compatibilité permet une transition sans suppression de données. Une migration métier explicite pourra être conçue plus tard après inventaire réel des lignes de production.

## Sécurité à tester

Cas obligatoires :

```text
CEO     → PATCH disponibilité COO      = 403
COO     → DELETE disponibilité LA      = 403
HR_CFO  → POST disponibilité CTO       = 403
CTO     → modification de sa donnée    = succès
COO     → modification de sa donnée    = succès
```

Lecture :

```text
CEO     → vue organisationnelle autorisée
COO     → vue équipe opérationnelle autorisée
HR_CFO  → vue RH autorisée
collaborateur ordinaire → principalement son propre planning
```

Multi-tenant : les IDs d'organisation et de collaborateur ne doivent jamais permettre de sortir de l'organisation active.

## Scénarios resolver

### A — disponible

```text
Lundi 08:00–17:00
Réunion 10:00–11:00
→ autorisée
```

### B — absence partielle

```text
Lundi 08:00–17:00
Absence 08:00–12:00
Réunion 10:00
→ conflit bloquant

Disponibilité effective
→ 12:00–17:00
```

### C — hors disponibilité

```text
Disponibilité 08:00–12:00
Réunion 15:00
→ information hors disponibilité
```

### D — disponibilité supplémentaire

```text
Disponibilité exceptionnelle 18:00–20:00
Réunion 19:00
→ créneau couvert
```

## Hors périmètre

Le Sprint 3 ne crée pas :

- `Timesheet` ;
- `TimeEntry` ;
- `ClockIn` / `ClockOut` ;
- `WorkSession` ;
- `LeaveBalance` / accrual ;
- workflow d'approbation RH de congés ;
- validation COO des prestations ;
- calcul de rémunération ;
- lien planning → paie.

Ces sujets restent réservés aux Sprints 4 et 5 selon leur périmètre respectif.
