# Enterprise Documents & Procurement — Sprint 7

## 1. Objectif

Sprint 7 poursuit ERP Core v2 après les sources Sprint 6 `EnterpriseTask`, `EnterpriseRequest`, `EnterpriseApproval` et `EnterpriseMeeting`.

Les nouvelles sources de vérité communes pour les organisations clientes sont :

- `EnterpriseDocument` ;
- `EnterpriseSupplier` ;
- `EnterprisePurchase`.

`EnterpriseCoreRecord` reste disponible pour les historiques et pour les domaines non encore migrés du Sprint 8 (`REPORT`, `BUDGET`, `EXPENSE`, `NOTICE`). Les nouvelles créations `DOCUMENT`, `SUPPLIER` et `PURCHASE` ne doivent plus y être écrites lorsqu’un modèle dédié s’applique.

## 2. Frontière métier

La chaîne commune cible est :

```text
EnterpriseRequest
       ↓
EnterpriseApproval
       ↓
EnterprisePurchase
       ↓
EnterpriseSupplier
       ↓
Commande
       ↓
EnterprisePurchaseReceipt
       ↓
EnterpriseDocument
```

Sprint 7 s’arrête au procurement, à la commande, à la réception et aux justificatifs. Il ne crée pas de dépense comptable ni d’impact budgétaire commun.

```text
EnterprisePurchase
       ↓
Sprint 8 : EnterpriseExpense
       ↓
Sprint 8 : EnterpriseBudget
```

## 3. EnterpriseDocument

`EnterpriseDocument` représente les métadonnées documentaires et non le fichier binaire lui-même. Il contient notamment le type, la catégorie, le statut, la visibilité, le propriétaire, le département, la version courante, l’échéance et la référence métier source.

Les statuts du Sprint 7 sont volontairement simples :

- `DRAFT` ;
- `ACTIVE` ;
- `ARCHIVED`.

L’expiration peut être déduite de `expiresAt` sans construire un workflow documentaire complet.

### 3.1 Visibilité

Trois niveaux sont supportés :

- `ORGANIZATION` : visible aux membres autorisés du module ;
- `DEPARTMENT` : visible dans le département concerné et aux responsables autorisés ;
- `RESTRICTED` : accès explicite via `EnterpriseDocumentAccess`.

Les administrateurs DTSC globaux ne contournent jamais le membership d’une organisation cliente.

### 3.2 Versions

Chaque fichier appartient à `EnterpriseDocumentVersion` avec :

- `versionNumber` ;
- nom du fichier ;
- type MIME ;
- taille ;
- fournisseur de stockage ;
- bucket ;
- chemin privé ;
- SHA-256 ;
- utilisateur ayant téléversé la version.

La contrainte `(organizationId, documentId, versionNumber)` garantit l’unicité. L’ajout d’une version utilise `revision` et `currentVersion` pour empêcher deux uploads concurrents de produire la même version logique.

## 4. Stockage privé

Sprint 7 réutilise le stockage Supabase privé déjà présent dans DTSC Platform.

Les chemins sont générés côté serveur :

```text
enterprise/{organizationId}/documents/{documentId}/v{version}/{uuid}-{safeFileName}
```

Le navigateur ne choisit jamais le bucket, `organizationId` ou `storagePath`.

Allow-list actuelle alignée sur les usages existants de DTSC :

- PDF ;
- JPEG / PNG / WEBP ;
- DOC / DOCX ;
- XLS / XLSX.

Taille maximale : 10 MiB.

Aucun exécutable n’est accepté. Les fichiers reçoivent une empreinte SHA-256 lors de l’upload.

### 4.1 Téléchargement

La route de téléchargement revalide :

1. session ;
2. organisation active ;
3. membership actif ;
4. module Documents ;
5. visibilité objet ;
6. droit de téléchargement pour un document `RESTRICTED` ;
7. bucket et préfixe de chemin.

Elle génère ensuite une URL signée temporaire, actuellement valable 120 secondes. Aucune URL publique permanente n’est utilisée.

## 5. EnterpriseSupplier

`EnterpriseSupplier` est un tiers métier indépendant des comptes DTSC.

Il peut comporter :

- raison sociale / nom usuel ;
- catégorie et type ;
- email / téléphone / site ;
- adresse / ville / pays ;
- identifiants fiscaux ou d’enregistrement lorsque disponibles ;
- notes ;
- contacts structurés.

Les contacts multiples sont représentés par `EnterpriseSupplierContact`, avec un contact principal éventuel.

### 5.1 Statuts fournisseur

- `PROSPECT` ;
- `ACTIVE` ;
- `SUSPENDED` ;
- `INACTIVE`.

Un fournisseur suspendu ou inactif ne peut pas être utilisé pour soumettre/commander un nouvel achat normal.

### 5.2 Anti-doublon

Le nom est normalisé dans `normalizedName`. L’unicité est limitée à l’organisation :

```text
organizationId + normalizedName
```

Il n’existe aucune contrainte globale entre deux entreprises clientes différentes.

## 6. EnterprisePurchase

`EnterprisePurchase` représente le processus réel d’acquisition, pas la demande interne qui exprime le besoin.

Principaux champs :

- référence serveur ;
- titre / description ;
- statut / priorité ;
- fournisseur ;
- demandeur / acheteur / département ;
- demande source ;
- devise ;
- montants recalculés ;
- dates attendue, commandée, reçue et clôturée ;
- source transversale ;
- `revision`.

### 6.1 Lignes d’achat

Les lignes sont structurées dans `EnterprisePurchaseItem` :

- description ;
- quantité ;
- unité ;
- prix unitaire ;
- taux de taxe ;
- sous-total ligne ;
- taxe ligne ;
- total ligne ;
- référence sectorielle éventuelle.

Le serveur recalcule avec `Prisma.Decimal` :

```text
quantity × unitPrice = lineSubtotal
lineSubtotal × taxRate = taxAmount
lineSubtotal + taxAmount = lineTotal
Σ lineSubtotal = subtotalAmount
Σ taxAmount = taxAmount
subtotalAmount + taxAmount = totalAmount
```

Le frontend ne fournit pas de `totalAmount` faisant autorité.

## 7. États et transitions Purchase

États :

- `DRAFT` ;
- `PENDING_APPROVAL` ;
- `APPROVED` ;
- `ORDERED` ;
- `PARTIALLY_RECEIVED` ;
- `RECEIVED` ;
- `CLOSED` ;
- `REJECTED` ;
- `CANCELLED`.

Transitions sensibles :

```text
DRAFT → PENDING_APPROVAL
PENDING_APPROVAL → APPROVED / REJECTED
APPROVED → ORDERED
ORDERED → PARTIALLY_RECEIVED / RECEIVED
PARTIALLY_RECEIVED → PARTIALLY_RECEIVED / RECEIVED
RECEIVED → CLOSED
DRAFT / APPROVED → CANCELLED
```

Les transitions utilisent l’état attendu et `revision`. Un client obsolète ou deux commandes simultanées obtiennent `409 Conflict` au lieu d’écraser silencieusement une modification récente.

## 8. EnterpriseApproval réutilisé

Sprint 7 n’introduit aucun `PurchaseApproval`.

La soumission d’un achat :

1. exige un fournisseur `ACTIVE` de la même organisation ;
2. exige un approbateur actif explicitement désigné ;
3. interdit par défaut `requestedByUserId == approverUserId` ;
4. crée `EnterpriseApproval(targetEntityType = EnterprisePurchase)` ;
5. relie Purchase et Approval via `EnterpriseEntityLink` ;
6. place l’achat en `PENDING_APPROVAL`.

La décision est synchronisée transactionnellement :

- Approval `APPROVED` → Purchase `APPROVED` ;
- Approval `REJECTED` → Purchase `REJECTED` ;
- annulation de la demande de validation → Purchase `DRAFT`.

Le rejet exige un commentaire, comme dans Sprint 6.

## 9. Réceptions

`EnterprisePurchaseReceipt` et `EnterprisePurchaseReceiptItem` enregistrent les réceptions.

Le serveur additionne toutes les quantités précédemment reçues pour chaque ligne :

```text
receivedTotal + newReceipt <= orderedQuantity
```

Une sur-réception est rejetée.

Tant qu’au moins une ligne reste incomplète : `PARTIALLY_RECEIVED`.

Lorsque toutes les lignes atteignent leurs quantités commandées : `RECEIVED`.

La réception ne modifie jamais automatiquement les stocks sectoriels.

## 10. EnterpriseEntityLink

Les liens transversaux couverts incluent :

- Request → Purchase ;
- Purchase → Approval ;
- Supplier → Purchase ;
- Document → Purchase ;
- Document → Supplier ;
- Document → Task / Request / Approval / Meeting ;
- objet sectoriel → Purchase lorsque l’intégration transversale le justifie.

La source et la cible sont vérifiées dans le même `organizationId` avant création. La contrainte existante d’`EnterpriseEntityLink` rend les liens idempotents.

## 11. PHARMACY et HEALTH_CARE

Les tables spécialisées restent les sources métier sectorielles.

Pour PHARMACY, les `PharmacySupplier`, `PharmacyPurchaseOrder`, `PharmacyReceipt` et mouvements de stock ne sont pas remplacés. Un objet sectoriel peut être lié à `EnterprisePurchase` pour le suivi transversal, mais `EnterprisePurchaseReceipt` ne crée aucun `PharmacyStockMovement`.

Même règle pour HEALTH_CARE : aucun détail clinique ou document médical spécialisé n’est aplati dans un document ERP commun visible plus largement.

## 12. Compatibilité legacy

Les anciens `EnterpriseCoreRecord` `DOCUMENT`, `SUPPLIER` et `PURCHASE` restent lisibles dans les workspaces avec une présentation historique en lecture seule.

Les nouvelles écritures génériques sont interdites par la couche `isDedicatedCoreDomain()` et par le dispatcher.

Les domaines `REPORT`, `BUDGET`, `EXPENSE` et `NOTICE` restent legacy en attendant Sprint 8.

Aucun backfill ne fabrique un fichier ou une relation qui n’existait pas dans les données historiques.

## 13. APIs

Documents :

```text
GET/POST   /api/enterprise/[organizationId]/documents
GET/PATCH/DELETE /api/enterprise/[organizationId]/documents/[id]
GET/POST   /api/enterprise/[organizationId]/documents/[id]/versions
GET        /api/enterprise/[organizationId]/documents/[id]/download
POST/DELETE /api/enterprise/[organizationId]/documents/[id]/access
POST       /api/enterprise/[organizationId]/documents/[id]/links
```

Fournisseurs :

```text
GET/POST   /api/enterprise/[organizationId]/suppliers
GET/PATCH  /api/enterprise/[organizationId]/suppliers/[id]
POST       /api/enterprise/[organizationId]/suppliers/[id]/contacts
POST       /api/enterprise/[organizationId]/suppliers/[id]/actions
```

Achats :

```text
GET/POST   /api/enterprise/[organizationId]/purchases
GET/PATCH  /api/enterprise/[organizationId]/purchases/[id]
POST       /api/enterprise/[organizationId]/purchases/[id]/actions
POST       /api/enterprise/[organizationId]/purchases/[id]/receive
```

Les mutations appliquent same-origin, rate limit, Zod, membership, module/entitlement/permissions, visibilité objet, `ApiLog` et audit.

## 14. UI

Les modules `DOCUMENTS` et `SUPPLIERS_PURCHASES` ne passent plus par le workspace Core générique.

Workspaces :

- `EnterpriseDocumentsWorkspace` ;
- `EnterpriseSuppliersWorkspace` ;
- `EnterprisePurchasesWorkspace`.

Ils suivent le design system :

```text
ModuleWorkspace
→ Metrics
→ Toolbar
→ BusinessList
→ Detail
→ Context actions
```

Les filtres et KPI viennent du serveur. Les formulaires utilisent les dialogues hauts existants et des contrôles natifs compatibles iOS.

## 15. Audit et timeline

Sprint 7 réutilise :

- `EnterpriseOperationalEvent` ;
- `EnterpriseOperationalComment`.

Les événements couvrent notamment :

```text
ENTERPRISE_DOCUMENT_CREATED
ENTERPRISE_DOCUMENT_VERSION_UPLOADED
ENTERPRISE_DOCUMENT_UPDATED
ENTERPRISE_DOCUMENT_ARCHIVED
ENTERPRISE_DOCUMENT_DOWNLOADED
ENTERPRISE_SUPPLIER_CREATED
ENTERPRISE_SUPPLIER_UPDATED
ENTERPRISE_SUPPLIER_SUSPENDED
ENTERPRISE_SUPPLIER_ARCHIVED
ENTERPRISE_PURCHASE_CREATED
ENTERPRISE_PURCHASE_SUBMITTED
ENTERPRISE_PURCHASE_APPROVED
ENTERPRISE_PURCHASE_REJECTED
ENTERPRISE_PURCHASE_ORDERED
ENTERPRISE_PURCHASE_PARTIALLY_RECEIVED
ENTERPRISE_PURCHASE_RECEIVED
ENTERPRISE_PURCHASE_CLOSED
ENTERPRISE_PURCHASE_CANCELLED
```

## 16. Migration et QA

Migration additive :

```text
prisma/migrations/20260729194500_add_enterprise_documents_procurement/migration.sql
```

QA Sprint 7 :

```text
pnpm qa:enterprise-core-v2-sprint7
```

Le script est également inclus dans `pnpm qa:regression` et vérifie les modèles dédiés, le stockage privé, les calculs serveur, les guards de réception, la compatibilité legacy et la politique Vercel production-only.

La Quality Gate GitHub applique toutes les migrations historiques depuis une PostgreSQL vide, y compris Sprint 6 puis Sprint 7.

## 17. Vercel production-only

Les branches feature ne sont pas une surface de déploiement fonctionnel.

`vercel.json` conserve :

```text
main → enabled
*    → disabled
```

Le workflow `.github/workflows/vercel-production-only-status.yml` normalise uniquement les erreurs de preview volontairement désactivée avec le statut :

```text
Preview intentionally disabled; production deploys only from main.
```

Ce statut ne remplace jamais les Quality Gates.

Après merge vers `main`, le seul déploiement attendu est Production, avec :

```text
pnpm prisma migrate deploy
↓
pnpm build
```

Aucun `vercel`, `vercel deploy` ou `vercel --prod` manuel ne fait partie du workflow normal.

## 18. Préparation Sprint 8

`EnterprisePurchase` conserve les références, devise, montants, dates, fournisseur, demande source et liens nécessaires pour une intégration future sans remodelage destructif.

Sprint 8 pourra introduire :

```text
EnterprisePurchase
       ↓
EnterpriseExpense
       ↓
EnterpriseBudget
```

Les `REPORT`, `BUDGET`, `EXPENSE` et données historiques restent dans le Core legacy jusqu’à cette migration dédiée.
