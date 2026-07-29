# ERP Core v2 — Sprint 6

## Objet

Le Sprint 6 introduit des domaines ERP dédiés pour les opérations communes des organisations clientes :

- `EnterpriseTask` — tâches, opérations et actions ;
- `EnterpriseRequest` — demandes internes ;
- `EnterpriseApproval` — décisions de validation ;
- `EnterpriseMeeting` — réunions, participants, comptes rendus et décisions.

`EnterpriseCoreRecord` n'est pas supprimé. Il reste le modèle de compatibilité historique et la source métier temporaire des domaines qui seront migrés dans les Sprints 7 et 8.

## Source de vérité

Pour toute nouvelle création après Sprint 6 :

| Domaine | Source de vérité |
| --- | --- |
| TASK / OPERATION / ACTION | `EnterpriseTask` |
| INTERNAL_REQUEST | `EnterpriseRequest` |
| VALIDATION | `EnterpriseApproval` |
| MEETING / MINUTES | `EnterpriseMeeting` |
| DOCUMENT | `EnterpriseCoreRecord` jusqu'au Sprint 7 |
| SUPPLIER / PURCHASE | `EnterpriseCoreRecord` jusqu'au Sprint 7 |
| BUDGET / EXPENSE / REPORT | `EnterpriseCoreRecord` jusqu'au Sprint 8 |
| NOTICE | `EnterpriseCoreRecord` tant qu'aucun domaine dédié ne le remplace |

Un objet Sprint 6 ne possède jamais un `EnterpriseCoreRecord` éditable en parallèle.

## Compatibilité legacy

Les anciens `EnterpriseCoreRecord` de types `TASK`, `OPERATION`, `MEETING`, `MINUTES`, `INTERNAL_REQUEST` ou `VALIDATION` restent lisibles dans les workspaces dédiés avec une présentation historique discrète.

Ils deviennent read-only :

- aucune nouvelle création générique de ces types ;
- aucune nouvelle mutation de ces anciens objets via la Core API ;
- aucune conversion automatique des enregistrements ambigus ;
- aucune suppression de données historiques.

Les enregistrements clairement déterministes pourront faire l'objet d'un backfill ultérieur contrôlé. Sprint 6 ne devine aucune relation contenue dans un `metadataJson` ambigu.

## Modèles

### EnterpriseTask

Une tâche distingue :

- type (`TASK`, `OPERATION`, `ACTION`) ;
- créateur ;
- assigné ;
- département ;
- priorité ;
- début et échéance ;
- source transversale éventuelle ;
- tâche parente éventuelle ;
- `revision` pour la concurrence optimiste.

Machine d'état :

```text
TODO -> IN_PROGRESS
IN_PROGRESS -> BLOCKED
BLOCKED -> IN_PROGRESS
IN_PROGRESS -> DONE
TODO / IN_PROGRESS / BLOCKED -> CANCELLED
```

L'archivage est une commande distincte et n'est pas un statut métier.

### EnterpriseRequest

Une demande possède son propre cycle, distinct d'une validation :

```text
DRAFT -> SUBMITTED -> IN_REVIEW -> APPROVED -> FULFILLED
                         |             |
                         +-> REJECTED  +-> FULFILLED
DRAFT / SUBMITTED / IN_REVIEW -> CANCELLED
```

Le demandeur d'une demande self-service vient toujours de la session serveur.

`EnterpriseActivityRequest` reste utilisé comme objet de l'interface Activités Entreprise, mais la demande ERP traçable correspondante est désormais un `EnterpriseRequest` lié par `EnterpriseEntityLink`.

### EnterpriseApproval

Une validation représente une décision, pas une demande générique.

États :

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> CANCELLED
```

Règles :

- approbateur actif de la même organisation ;
- approbateur désigné contrôlé côté serveur ;
- auto-approbation interdite par défaut ;
- motif obligatoire lors d'un rejet ;
- cible contrôlée et appartenant à la même organisation ;
- transition atomique `WHERE status = PENDING AND revision = ?` ;
- une décision concurrente provoque `409 Conflict` au lieu d'écraser une décision précédente.

Cibles Sprint 6 autorisées :

- `EnterpriseRequest` ;
- `EnterpriseTask` ;
- `EnterpriseMeeting` ;
- `PharmacyQualityIncident` comme première intégration sectorielle explicitement contrôlée.

### EnterpriseMeeting

Une réunion contient directement :

- organisateur ;
- début / fin ;
- mode (`ONLINE`, `PHYSICAL`, `HYBRID`) ;
- lieu et/ou lien ;
- département ;
- agenda ;
- compte rendu `minutes` ;
- participants structurés ;
- décisions structurées ;
- liens vers les actions générées.

États :

```text
SCHEDULED -> IN_PROGRESS -> COMPLETED
SCHEDULED / IN_PROGRESS -> CANCELLED
```

`MINUTES` n'est plus un pseudo-enregistrement séparé pour les nouvelles réunions.

### EnterpriseMeetingParticipant

Chaque participant :

- appartient à la même organisation ;
- doit être un `OrganizationMember` actif et non supprimé ;
- possède un rôle et un statut de réponse ;
- est unique par `(meetingId, userId)`.

### EnterpriseMeetingDecision

Une décision appartient à une réunion. Elle peut générer une `EnterpriseTask` de type `ACTION`.

La génération est transactionnelle : une décision ne peut pas produire deux tâches simultanément et `EnterpriseEntityLink` matérialise la relation.

## Timeline et commentaires

Les nouveaux domaines utilisent :

- `EnterpriseOperationalEvent` ;
- `EnterpriseOperationalComment`.

Ces tables fournissent une abstraction commune sans transformer `EnterpriseCoreRecord` en source métier.

Les commentaires sont toujours bornés et paginés dans les API. Les timelines ne chargent jamais un historique illimité avec l'objet principal.

## EnterpriseEntityLink

Les relations transversales utilisent `EnterpriseEntityLink` autant que possible :

```text
EnterpriseActivityRequest -> EnterpriseRequest
EnterpriseRequest -> EnterpriseApproval
Meeting -> MeetingDecision
MeetingDecision -> EnterpriseTask
PharmacyActivityItem -> EnterpriseRequest / EnterpriseTask / legacy Report
Sector entity -> EnterpriseTask
```

Avant chaque lien, le serveur vérifie que la source existe dans la même `organizationId`. Aucune relation inter-tenant n'est autorisée.

## APIs dédiées

### Tasks

```text
GET/POST   /api/enterprise/[organizationId]/tasks
GET/PATCH  /api/enterprise/[organizationId]/tasks/[id]
POST       /api/enterprise/[organizationId]/tasks/[id]/actions
```

Filtres serveur : recherche, statut, priorité, assigné, département, échéance/retard, pagination.

### Requests

```text
GET/POST   /api/enterprise/[organizationId]/requests
GET/PATCH  /api/enterprise/[organizationId]/requests/[id]
POST       /api/enterprise/[organizationId]/requests/[id]/actions
```

Filtres serveur : recherche, statut, type, demandeur, département, priorité, période, pagination.

### Approvals

```text
GET/POST   /api/enterprise/[organizationId]/approvals
GET        /api/enterprise/[organizationId]/approvals/[id]
POST       /api/enterprise/[organizationId]/approvals/[id]/actions
```

La vue par défaut est `pending` pour l'approbateur courant. La vue `treated` expose ses décisions déjà prises.

### Meetings

```text
GET/POST   /api/enterprise/[organizationId]/meetings
GET/PATCH  /api/enterprise/[organizationId]/meetings/[id]
POST       /api/enterprise/[organizationId]/meetings/[id]/actions
POST       /api/enterprise/[organizationId]/meetings/[id]/decisions
POST       /api/enterprise/[organizationId]/meetings/[id]/decisions/[decisionId]/task
```

Filtres serveur : à venir, passées, annulées, participant, département, date, recherche, pagination.

### Comments / timeline

```text
GET/POST /api/enterprise/[organizationId]/operational-comments
```

Les lectures et mutations sont toujours vérifiées selon l'objet métier visé.

## Sécurité multi-tenant

Toute API Sprint 6 applique les couches suivantes :

```text
session
-> organizationId demandé
-> OrganizationMember ACTIVE et removedAt = null
-> organization CLIENT active
-> module activé
-> entitlement du plan
-> permission métier
-> visibilité / ownership de l'objet
-> validation Zod
-> same-origin pour les mutations
-> await rateLimit(...)
-> transaction / concurrence si sensible
```

Un rôle DTSC global ne remplace jamais un membership de l'organisation cliente.

## Concurrence

Les entités modifiables utilisent `revision`.

Une mutation contient la révision lue par le client :

```text
UPDATE ...
WHERE id = ?
  AND organizationId = ?
  AND revision = ?
  AND status = état_attendu
```

Si aucune ligne n'est modifiée, l'API renvoie `409 Conflict`. Une modification plus récente n'est jamais écrasée silencieusement.

## Activities Enterprise

La création depuis Activités suit désormais :

```text
EnterpriseActivityRequest
        |
        +-- EnterpriseEntityLink --> EnterpriseRequest
```

Le `requestedByUserId` du nouvel `EnterpriseRequest` est la session authentifiée. `EnterpriseActivityRequest` reste utile au template des blocs d'activité, mais ne maintient pas un second workflow de validation parallèle.

## PHARMACY

Les modèles PHARMACY restent la source sectorielle.

`PharmacyActivityItem` peut produire :

- un `EnterpriseRequest` pour les demandes ;
- un `EnterpriseTask` pour les actions transversales ;
- un `EnterpriseCoreRecord(REPORT)` uniquement parce que Reports reste legacy jusqu'au Sprint 8.

Les données sectorielles détaillées ne sont pas recopiées dans la tâche ou la demande. Le lien source suffit avec un résumé transversal minimal.

## HEALTH_CARE

Les modèles cliniques restent leur propre source de vérité. Les types `HealthPatient`, `HealthAppointment` et `HealthConsultation` sont reconnus comme sources possibles pour un futur objet transversal, mais aucune donnée clinique sensible n'est copiée automatiquement dans le Core v2.

## Administration Entreprise

Les KPI utilisent désormais :

- `EnterpriseTask` pour tâches ouvertes, bloquées et en retard ;
- `EnterpriseRequest` pour demandes ouvertes, soumises et en revue ;
- `EnterpriseApproval` pour validations à traiter ;
- `EnterpriseMeeting` pour réunions du jour et à venir.

Les KPI Documents, Budgets et Fournisseurs continuent temporairement de lire le Core legacy.

## UI

Les modules Sprint 6 sont routés vers quatre workspaces dédiés :

- `EnterpriseTasksWorkspace` ;
- `EnterpriseRequestsWorkspace` ;
- `EnterpriseApprovalsWorkspace` ;
- `EnterpriseMeetingsWorkspace`.

Le design suit le système commun :

```text
Module header
-> Metrics
-> Search / server filters
-> BusinessList
-> Detail
-> Context actions
```

Les longs formulaires utilisent des dialogs hauts/fullscreen mobile compatibles avec les règles VisualViewport/iOS existantes. Les statuts techniques sont traduits avant affichage.

## Notifications

Sprint 6 réutilise les notifications existantes et le Web Push :

- tâche assignée/réassignée ;
- tâche bloquée ;
- demande reçue/affectée/traitée ;
- validation requise ;
- décision d'approbation ;
- invitation de réunion ;
- modification importante ;
- annulation de réunion ;
- tâche créée depuis une décision.

Aucun moteur de cron/reminders n'est ajouté dans ce Sprint.

## Migration Prisma

Migration additive :

```text
prisma/migrations/20260729150000_add_enterprise_core_v2/migration.sql
```

Elle crée les tables, contraintes et indexes sans `DROP TABLE` ni suppression de colonne legacy.

En production, le workflow existant reste :

```text
main
-> Vercel Production
-> prisma migrate deploy
-> pnpm build
```

Aucun `prisma db push` ne fait partie de la stratégie de production.

## QA

Le script :

```text
pnpm qa:enterprise-core-v2
```

vérifie statiquement :

- présence des modèles dédiés ;
- conservation du Core legacy ;
- migration additive ;
- guards tenant/membership ;
- transitions atomiques ;
- sécurité des validations ;
- adaptation Activités/PHARMACY ;
- workspaces dédiés ;
- KPI v2 ;
- politique Vercel production-only.

Il est inclus dans `pnpm qa:regression`.

## Hors scope Sprint 6

Ne sont volontairement pas introduits ici :

- `EnterpriseDocument` ;
- `EnterpriseSupplier` ;
- `EnterprisePurchase` ;
- `EnterpriseBudget` ;
- `EnterpriseExpense` ;
- `EnterpriseReport` ;
- workflow builder / BPMN ;
- moteur générique d'automatisation ;
- Kanban complexe ;
- Gantt ;
- cron avancé de reminders.

La trajectoire reste :

```text
Sprint 6: Tasks / Requests / Approvals / Meetings
Sprint 7: Documents / Suppliers / Purchases
Sprint 8: Budgets / Expenses / Reports
Sprint 9: Workflow Engine
```
