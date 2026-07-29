# Socle commun ERP des entreprises clientes

## Objectif

Le socle commun ERP fournit les objets transversaux utilisés par toutes les entreprises clientes, quel que soit leur secteur. Les modules sectoriels conservent leurs tables spécialisées et peuvent créer un objet transversal lié pour organiser le travail, la validation, le procurement et la traçabilité.

Depuis le Sprint 6, le socle n'utilise plus `EnterpriseCoreRecord` comme source de vérité pour les nouvelles tâches, demandes, validations et réunions. Le Sprint 7 étend ce principe aux documents, fournisseurs et achats.

Toutes les lectures et mutations sont filtrées par `organizationId`, membership actif, module activé, entitlement et permission métier. Un rôle DTSC global ne contourne jamais le membership d'une entreprise cliente.

## ERP Core v2 — Sprints 6 et 7

### Sprint 6

- `EnterpriseTask` — Tâches & opérations ;
- `EnterpriseRequest` — Demandes internes ;
- `EnterpriseApproval` — Validations ;
- `EnterpriseMeeting` — Réunions & comptes rendus ;
- `EnterpriseMeetingParticipant` — participants structurés ;
- `EnterpriseMeetingDecision` — décisions d'une réunion ;
- `EnterpriseOperationalEvent` et `EnterpriseOperationalComment` — timeline et commentaires communs.

### Sprint 7

- `EnterpriseDocument` — métadonnées documentaires ;
- `EnterpriseDocumentVersion` — fichiers privés versionnés ;
- `EnterpriseDocumentAccess` — accès explicites aux documents restreints ;
- `EnterpriseSupplier` — référentiel fournisseur ;
- `EnterpriseSupplierContact` — interlocuteurs fournisseurs ;
- `EnterprisePurchase` — processus d'acquisition ;
- `EnterprisePurchaseItem` — lignes d'achat ;
- `EnterprisePurchaseReceipt` et `EnterprisePurchaseReceiptItem` — réceptions partielles/complètes.

Documentation détaillée :

- `docs/ENTERPRISE_CORE_V2.md` pour Sprint 6 ;
- `docs/ENTERPRISE_DOCUMENTS_AND_PROCUREMENT.md` pour Sprint 7.

## Source de vérité et Core legacy

| Domaine | Source de vérité |
| --- | --- |
| TASK / OPERATION / ACTION | `EnterpriseTask` |
| INTERNAL_REQUEST | `EnterpriseRequest` |
| VALIDATION | `EnterpriseApproval` |
| MEETING / MINUTES | `EnterpriseMeeting` |
| DOCUMENT | `EnterpriseDocument` |
| SUPPLIER | `EnterpriseSupplier` |
| PURCHASE | `EnterprisePurchase` |
| BUDGET / EXPENSE / REPORT | `EnterpriseCoreRecord` jusqu'au Sprint 8 |
| NOTICE | `EnterpriseCoreRecord` tant qu'aucun domaine dédié ne le remplace |

`EnterpriseCoreRecord` reste présent et lisible. Les anciens enregistrements de domaines désormais dédiés restent visibles comme historique, mais sont read-only. Le serveur refuse toute nouvelle création ou mutation legacy lorsqu'un modèle dédié Sprint 6/7 s'applique.

Aucune migration aveugle n'est effectuée sur les anciens `metadataJson`. Un ancien objet déterministe pourra être backfillé plus tard par une migration contrôlée ; un objet ambigu reste historique afin de ne jamais inventer de relation ou de fichier.

## Tâches & opérations

`EnterpriseTask` distingue créateur, assigné, département, type, priorité, début, échéance, source et éventuelle tâche parente.

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

Une demande self-service utilise toujours `session.userId` comme `requestedByUserId`. Une demande reste distincte d'une `EnterpriseApproval` et d'un `EnterprisePurchase`.

`EnterpriseActivityRequest` est conservé pour l'expérience Activités Entreprise, mais chaque nouvelle demande transversale correspondante crée un `EnterpriseRequest` lié.

## Validations

`EnterpriseApproval` représente une décision sur une cible autorisée. Sprint 7 réutilise le même modèle pour les achats via `targetEntityType = EnterprisePurchase`; aucun `PurchaseApproval` parallèle n'existe.

Règles :

- approbateur membre actif de la même organisation ;
- auto-approbation interdite par défaut ;
- approbateur désigné vérifié côté serveur ;
- cible vérifiée côté serveur et dans la même organisation ;
- rejet avec `decisionComment` obligatoire ;
- décision atomique `PENDING -> APPROVED/REJECTED` avec `revision` ;
- double décision simultanée : une seule réussit, l'autre reçoit `409 Conflict`.

Sprint 6/7 utilisent volontairement une approbation simple à un approbateur désigné. Les chaînes multi-étapes appartiennent au Sprint 9.

## Réunions & comptes rendus

`EnterpriseMeeting` contient directement agenda, participants, mode, lieu/lien, compte rendu et décisions.

```text
SCHEDULED -> IN_PROGRESS -> COMPLETED
SCHEDULED / IN_PROGRESS -> CANCELLED
```

`MINUTES` n'est plus créé comme pseudo-réunion séparée. Une `EnterpriseMeetingDecision` peut générer une `EnterpriseTask` de type `ACTION`, liée par `EnterpriseEntityLink`.

## Documents entreprise

`EnterpriseDocument` représente les métadonnées. Le fichier est stocké séparément dans `EnterpriseDocumentVersion`.

Visibilités :

- `ORGANIZATION` ;
- `DEPARTMENT` ;
- `RESTRICTED`, avec `EnterpriseDocumentAccess`.

Les fichiers utilisent exclusivement le stockage privé Supabase déjà configuré. Le chemin est généré côté serveur sous :

```text
enterprise/{organizationId}/documents/{documentId}/v{version}/...
```

MIME autorisés : PDF, JPEG/PNG/WEBP, DOC/DOCX, XLS/XLSX. Taille maximale actuelle : 10 MiB. Une empreinte SHA-256 est calculée à l'upload.

Le téléchargement exige une revalidation serveur des droits avant émission d'une URL signée temporaire. Aucune URL publique arbitraire n'est acceptée comme source documentaire.

## Fournisseurs

`EnterpriseSupplier` est un tiers métier et ne nécessite pas de compte utilisateur.

Statuts :

```text
PROSPECT -> ACTIVE
ACTIVE -> SUSPENDED / INACTIVE
SUSPENDED -> ACTIVE / INACTIVE
```

Les interlocuteurs multiples utilisent `EnterpriseSupplierContact`. L'anti-doublon est limité à l'organisation via `organizationId + normalizedName`.

Un fournisseur `SUSPENDED` ou `INACTIVE` ne peut pas être utilisé pour une nouvelle soumission/commande normale.

## Achats

`EnterprisePurchase` représente l'acquisition réelle, distincte du besoin exprimé dans `EnterpriseRequest`.

Une commande contient des lignes `EnterprisePurchaseItem`. Les montants sont recalculés côté serveur avec `Prisma.Decimal`; un total envoyé par le frontend n'est jamais une source de vérité.

```text
DRAFT -> PENDING_APPROVAL
PENDING_APPROVAL -> APPROVED / REJECTED
APPROVED -> ORDERED
ORDERED -> PARTIALLY_RECEIVED / RECEIVED
PARTIALLY_RECEIVED -> RECEIVED
RECEIVED -> CLOSED
DRAFT / APPROVED -> CANCELLED
```

La soumission crée une `EnterpriseApproval` liée. La décision Approval et la transition Purchase sont synchronisées transactionnellement.

`EnterprisePurchaseReceipt` et `EnterprisePurchaseReceiptItem` enregistrent les réceptions. Le serveur additionne les quantités déjà reçues et refuse toute sur-réception.

Une réception commune ne modifie jamais automatiquement les stocks PHARMACY, HEALTH_CARE ou d'un autre secteur spécialisé.

## EnterpriseEntityLink

`EnterpriseEntityLink` reste la relation transversale commune. Les relations comprennent notamment :

```text
EnterpriseActivityRequest -> EnterpriseRequest
EnterpriseRequest -> EnterpriseApproval
EnterpriseMeeting -> EnterpriseMeetingDecision
EnterpriseMeetingDecision -> EnterpriseTask
EnterpriseRequest -> EnterprisePurchase
EnterprisePurchase -> EnterpriseApproval
EnterpriseSupplier -> EnterprisePurchase
EnterpriseDocument -> EnterprisePurchase / EnterpriseSupplier
EnterpriseDocument -> EnterpriseTask / EnterpriseRequest / EnterpriseApproval / EnterpriseMeeting
Sector entity -> EnterpriseTask / EnterpriseRequest / EnterprisePurchase
```

La source et la cible doivent exister dans le même `organizationId`. Un lien inter-tenant est refusé et la relation est idempotente.

## Administration et workspaces

Administration Entreprise utilise les tables v2 pour les indicateurs Sprint 6. Les modules Sprint 7 disposent de KPI serveur dans leurs workspaces dédiés :

- Documents : actifs, récents, à expiration, archivés ;
- Fournisseurs : actifs, suspendus, nouveaux ;
- Achats : brouillons, à approuver, commandés, en réception, reçus récemment.

Workspaces dédiés :

- `EnterpriseTasksWorkspace` ;
- `EnterpriseRequestsWorkspace` ;
- `EnterpriseApprovalsWorkspace` ;
- `EnterpriseMeetingsWorkspace` ;
- `EnterpriseDocumentsWorkspace` ;
- `EnterpriseSuppliersWorkspace` ;
- `EnterprisePurchasesWorkspace`.

Ils suivent `Header -> Metrics -> Toolbar -> BusinessList -> Detail -> Context actions`, avec pagination et filtres côté serveur et historique legacy discret en lecture seule.

## Permissions

Les nouveaux domaines réutilisent les contrôles centralisés de membership/module/entitlement et ajoutent une visibilité objet adaptée.

- `OWNER` / `ADMIN_ENTERPRISE` : gestion large selon le module ;
- `MANAGER` : gestion du périmètre autorisé ;
- `MEMBER` : visibilité et mutations limitées aux objets qui le concernent et aux permissions du poste ;
- `GUEST` : lecture limitée, aucune mutation métier sensible.

Le backend reste autoritatif. La présence d'un bouton dans l'UI n'accorde jamais une permission.

## Intégration sectorielle

Les tables PHARMACY et HEALTH_CARE restent les sources métier sectorielles.

PHARMACY conserve notamment ses fournisseurs, commandes, réceptions et mouvements de stock spécialisés. Un objet sectoriel peut être lié à un `EnterprisePurchase` transversal lorsque nécessaire, mais le Core ne remplace jamais le détail sectoriel et ne génère pas automatiquement de mouvement de stock.

HEALTH_CARE conserve ses documents et données cliniques spécialisés. Un document ERP commun ne recopie pas automatiquement des informations patient, diagnostic ou traitement sensibles.

## APIs dédiées

### Sprint 6

```text
/api/enterprise/{organizationId}/tasks
/api/enterprise/{organizationId}/requests
/api/enterprise/{organizationId}/approvals
/api/enterprise/{organizationId}/meetings
```

### Sprint 7 — Documents

```text
GET/POST      /api/enterprise/{organizationId}/documents
GET/PATCH/DELETE /api/enterprise/{organizationId}/documents/{id}
GET/POST      /api/enterprise/{organizationId}/documents/{id}/versions
GET           /api/enterprise/{organizationId}/documents/{id}/download
POST/DELETE   /api/enterprise/{organizationId}/documents/{id}/access
POST          /api/enterprise/{organizationId}/documents/{id}/links
```

### Sprint 7 — Fournisseurs

```text
GET/POST      /api/enterprise/{organizationId}/suppliers
GET/PATCH     /api/enterprise/{organizationId}/suppliers/{id}
POST          /api/enterprise/{organizationId}/suppliers/{id}/contacts
POST          /api/enterprise/{organizationId}/suppliers/{id}/actions
```

### Sprint 7 — Achats

```text
GET/POST      /api/enterprise/{organizationId}/purchases
GET/PATCH     /api/enterprise/{organizationId}/purchases/{id}
POST          /api/enterprise/{organizationId}/purchases/{id}/actions
POST          /api/enterprise/{organizationId}/purchases/{id}/receive
```

Toutes les mutations appliquent same-origin, Zod, `await rateLimit(...)`, contrôle membership/module/permission, audit et `ApiLog`.

## Core legacy

```text
GET  /api/enterprise/{organizationId}/core?moduleCode=...
POST /api/enterprise/{organizationId}/core
PATCH /api/enterprise/{organizationId}/core/{id}
```

Ces routes restent disponibles pour les domaines legacy. Les créations/mutations génériques TASK/REQUEST/APPROVAL/MEETING/DOCUMENT/SUPPLIER/PURCHASE sont explicitement refusées.

## Migration et QA

Migrations dédiées :

```text
prisma/migrations/20260729150000_add_enterprise_core_v2/migration.sql
prisma/migrations/20260729194500_add_enterprise_documents_procurement/migration.sql
```

QA :

```text
pnpm qa:enterprise-core-v2
pnpm qa:enterprise-core-v2-sprint7
pnpm qa:regression
```

La GitHub Quality Gate applique toutes les migrations historiques depuis une PostgreSQL vide et exécute type-check, QA, lint et build.

## Déploiement Vercel

Les branches feature ne doivent pas produire de Preview fonctionnel. Le statut normalisé `Preview intentionally disabled; production deploys only from main.` est attendu et n'est pas un test fonctionnel.

Après merge de `main`, l'unique Production exécute :

```text
pnpm prisma migrate deploy
pnpm build
```

Aucun déploiement manuel n'appartient au workflow normal.

## Limites restantes / prochains sprints

- Sprint 8 : Budgets / Expenses / Reports et intégration `EnterprisePurchase -> EnterpriseExpense -> EnterpriseBudget` ;
- Sprint 9 : Workflow Engine et politiques d'approbation avancées.

Sprint 7 ne crée ni `EnterpriseExpense`, ni débit budgétaire, ni comptabilité générale, ni mutation automatique de stock sectoriel.
