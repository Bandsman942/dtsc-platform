# Socle commun ERP des entreprises clientes

## Objectif

Le socle commun ERP fournit les objets transversaux utilisés par toutes les entreprises clientes, quel que soit leur secteur. Les modules sectoriels conservent leurs tables spécialisées et peuvent créer un objet transversal lié pour organiser le travail, la validation et la traçabilité.

Depuis le Sprint 6, le socle n'utilise plus `EnterpriseCoreRecord` comme source de vérité pour les nouvelles tâches, demandes, validations et réunions. Ces domaines utilisent des modèles dédiés afin d'appliquer leurs propres champs, transitions, permissions, filtres et règles de concurrence.

Toutes les lectures et mutations sont filtrées par `organizationId`, membership actif, module activé, entitlement et permission métier. Un rôle DTSC global ne contourne jamais le membership d'une entreprise cliente.

## ERP Core v2 — Sprint 6

Les domaines opérationnels dédiés sont :

- `EnterpriseTask` — Tâches & opérations ;
- `EnterpriseRequest` — Demandes internes ;
- `EnterpriseApproval` — Validations ;
- `EnterpriseMeeting` — Réunions & comptes rendus ;
- `EnterpriseMeetingParticipant` — participants structurés ;
- `EnterpriseMeetingDecision` — décisions d'une réunion ;
- `EnterpriseOperationalEvent` et `EnterpriseOperationalComment` — timeline et commentaires communs.

La documentation détaillée est disponible dans `docs/ENTERPRISE_CORE_V2.md`.

## Source de vérité et Core legacy

La règle est désormais :

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

`EnterpriseCoreRecord` reste donc présent et lisible. Les anciens enregistrements `TASK`, `OPERATION`, `MEETING`, `MINUTES`, `INTERNAL_REQUEST` et `VALIDATION` restent visibles comme historique, mais ils sont read-only. Le serveur refuse toute nouvelle création ou mutation legacy lorsque le modèle dédié Sprint 6 s'applique.

Aucune migration aveugle n'est effectuée sur les anciens `metadataJson`. Un ancien objet déterministe pourra être backfillé plus tard par une migration contrôlée ; un objet ambigu reste historique afin de ne jamais inventer de relation métier.

## Tâches & opérations

`EnterpriseTask` distingue créateur, assigné, département, type, priorité, début, échéance, source et éventuelle tâche parente.

Machine d'état :

```text
TODO -> IN_PROGRESS
IN_PROGRESS -> BLOCKED
BLOCKED -> IN_PROGRESS
IN_PROGRESS -> DONE
TODO / IN_PROGRESS / BLOCKED -> CANCELLED
```

Les transitions passent par des commandes explicites et sont race-safe. Les modifications utilisent `revision` pour empêcher l'écrasement silencieux d'une version plus récente.

## Demandes internes

`EnterpriseRequest` possède son propre cycle :

```text
DRAFT -> SUBMITTED -> IN_REVIEW -> APPROVED -> FULFILLED
                         +-------> REJECTED
DRAFT / SUBMITTED / IN_REVIEW -> CANCELLED
```

Une demande self-service utilise toujours `session.userId` comme `requestedByUserId`. Une demande reste distincte d'une `EnterpriseApproval`.

`EnterpriseActivityRequest` est conservé pour l'expérience Activités Entreprise, mais chaque nouvelle demande transversale correspondante crée un `EnterpriseRequest` lié. Il n'existe plus deux workflows éditables concurrents.

## Validations

`EnterpriseApproval` représente une décision sur une cible autorisée.

Sprint 6 utilise volontairement une approbation simple à un approbateur désigné : une cible ne peut pas avoir plusieurs validations `PENDING` simultanées. Les chaînes multi-étapes appartiennent au Sprint 9.

Règles :

- approbateur membre actif de la même organisation ;
- auto-approbation interdite par défaut ;
- approbateur désigné vérifié côté serveur ;
- cible vérifiée côté serveur et dans la même organisation ;
- rejet avec `decisionComment` obligatoire ;
- décision atomique `PENDING -> APPROVED/REJECTED` avec `revision` ;
- double décision simultanée : une seule réussit, l'autre reçoit `409 Conflict`.

## Réunions & comptes rendus

`EnterpriseMeeting` contient directement l'agenda, les participants, le mode, le lieu/lien, le compte rendu et les décisions.

Machine d'état :

```text
SCHEDULED -> IN_PROGRESS -> COMPLETED
SCHEDULED / IN_PROGRESS -> CANCELLED
```

`MINUTES` n'est plus créé comme pseudo-réunion séparée. `EnterpriseMeetingParticipant` impose l'unicité `(meetingId, userId)` et tous les participants doivent être des membres actifs de la même organisation.

Une `EnterpriseMeetingDecision` peut générer une `EnterpriseTask` de type `ACTION`. La génération est transactionnelle et liée par `EnterpriseEntityLink`.

## EnterpriseEntityLink

`EnterpriseEntityLink` reste la relation transversale commune. Les liens Sprint 6 couvrent notamment :

```text
EnterpriseActivityRequest -> EnterpriseRequest
EnterpriseRequest -> EnterpriseApproval
EnterpriseMeeting -> EnterpriseMeetingDecision
EnterpriseMeetingDecision -> EnterpriseTask
PharmacyActivityItem -> EnterpriseRequest / EnterpriseTask
Sector entity -> EnterpriseTask
```

La source doit exister dans la même `organizationId` avant création du lien. Un lien inter-tenant est refusé.

## Administration et Activités

Administration Entreprise utilise désormais les tables v2 pour les indicateurs réels :

- tâches ouvertes, en retard et bloquées ;
- demandes ouvertes, soumises et en revue ;
- validations en attente ;
- réunions du jour et à venir.

Documents, budgets et fournisseurs continuent temporairement d'utiliser le Core legacy.

Les modules Sprint 6 ouvrent des workspaces dédiés :

- `EnterpriseTasksWorkspace` ;
- `EnterpriseRequestsWorkspace` ;
- `EnterpriseApprovalsWorkspace` ;
- `EnterpriseMeetingsWorkspace`.

Ils utilisent la logique DTSC `Header -> Metrics -> Toolbar -> BusinessList -> Detail -> Context actions`, avec filtres et pagination côté serveur et historique legacy discret en lecture seule.

## Permissions

Les permissions legacy restent centralisées dans `lib/enterprise/enterprise-core-permissions.ts`. Les nouveaux domaines utilisent `lib/enterprise/core-v2/access.ts` en réutilisant les contrôles de module/entitlement existants.

- `OWNER` / `ADMIN_ENTERPRISE` : visibilité et gestion larges selon le module ;
- `MANAGER` : gestion du périmètre autorisé, sans privilèges propriétaire automatiques ;
- `MEMBER` : objets où il est créateur, demandeur, assigné, participant ou approbateur désigné ;
- `GUEST` : lecture limitée, aucune mutation métier sensible.

Le backend reste autoritatif. La visibilité d'un bouton n'accorde jamais une permission.

## Intégration sectorielle

Les tables PHARMACY et HEALTH_CARE restent les sources métier sectorielles.

PHARMACY utilise le dispatch Sprint 6 :

- demandes de réapprovisionnement, ajustements, avis pharmacien et documents -> `EnterpriseRequest` ;
- ruptures, péremptions, anomalies et actions transversales -> `EnterpriseTask` ;
- rapports caisse et inventaire -> `EnterpriseCoreRecord(REPORT)` jusqu'au Sprint 8.

Une tâche transversale ne recopie pas inutilement les données sectorielles sensibles. Elle conserve un résumé minimal et un lien vers la source autorisée.

HEALTH_CARE peut être une source autorisée pour un objet transversal, mais les données cliniques spécialisées et confidentielles restent dans leurs modèles Santé.

## API

### Sprint 6 dédié

```text
GET/POST   /api/enterprise/{organizationId}/tasks
GET/PATCH  /api/enterprise/{organizationId}/tasks/{id}
POST       /api/enterprise/{organizationId}/tasks/{id}/actions

GET/POST   /api/enterprise/{organizationId}/requests
GET/PATCH  /api/enterprise/{organizationId}/requests/{id}
POST       /api/enterprise/{organizationId}/requests/{id}/actions

GET/POST   /api/enterprise/{organizationId}/approvals
GET        /api/enterprise/{organizationId}/approvals/{id}
POST       /api/enterprise/{organizationId}/approvals/{id}/actions

GET/POST   /api/enterprise/{organizationId}/meetings
GET/PATCH  /api/enterprise/{organizationId}/meetings/{id}
POST       /api/enterprise/{organizationId}/meetings/{id}/actions
POST       /api/enterprise/{organizationId}/meetings/{id}/decisions
POST       /api/enterprise/{organizationId}/meetings/{id}/decisions/{decisionId}/task
```

Les listes utilisent pagination, recherche, filtres et tri côté serveur.

### Core legacy

```text
GET  /api/enterprise/{organizationId}/core?moduleCode=...
POST /api/enterprise/{organizationId}/core
PATCH /api/enterprise/{organizationId}/core/{id}
```

Ces routes restent disponibles pour les domaines legacy. Les créations/mutations Sprint 6 génériques sont explicitement refusées.

Toutes les mutations appliquent same-origin, Zod, `await rateLimit(...)`, contrôle membership/module/permission, `AuditLog` et `ApiLog` selon la sensibilité.

## Migration et QA

La migration additive Sprint 6 est :

```text
prisma/migrations/20260729150000_add_enterprise_core_v2/migration.sql
```

Elle ne supprime ni `EnterpriseCoreRecord` ni ses colonnes.

Le script dédié :

```text
pnpm qa:enterprise-core-v2
```

est inclus dans `pnpm qa:regression` et vérifie modèles dédiés, migration additive, isolation, transitions, sécurité des validations, producteurs migrés, workspaces dédiés et politique Vercel production-only.

## Limites restantes / prochains sprints

- Sprint 7 : Documents / Suppliers / Purchases ;
- Sprint 8 : Budgets / Expenses / Reports ;
- Sprint 9 : Workflow Engine et politiques d'approbation avancées.

Aucun Kanban lourd, Gantt, workflow builder, BPMN ni moteur de reminders complexe n'est introduit au Sprint 6.
