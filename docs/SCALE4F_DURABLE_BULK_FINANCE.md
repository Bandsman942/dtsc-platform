# SCALE-4F — Imports/exports durables Finance

Issue : #515
Baseline : `main@2f2089b37cb97e3a5de80ca73ae121e9fbb7e5a0`

## Objectif

Sortir les traitements volumineux des requêtes HTTP interactives sans créer une seconde infrastructure de queue, sans dupliquer les données Finance et sans affaiblir l’isolation `organizationId`, les permissions ou les approbations sensibles.

Le périmètre livré couvre :

- les imports de relevés bancaires de plus de 250 lignes, jusqu’à la limite existante de 10 000 lignes ;
- les exports du journal Audit de plus de 500 lignes, jusqu’à 5 000 lignes ;
- la progression, les retries, la reprise après crash, les états terminaux et l’observabilité de la file ;
- les artefacts privés temporaires pour les données bulk ;
- la protection du rapprochement tant qu’un relevé n’est pas complètement `IMPORTED`.

## Réutilisation du contrat SCALE-4

Aucune nouvelle table de queue n’est créée. Les jobs utilisent `EnterpriseDomainEvent`, déjà canonique pour les workers de DTSC Platform :

```text
PENDING / FAILED
      ↓ claim atomique + lease
PROCESSING
   ↙       ↘
PROCESSED   FAILED → retry/backoff
                ↓ tentatives épuisées / erreur terminale
              DEAD
```

Le contrat réutilise :

- `idempotencyKey` unique ;
- `availableAt` ;
- `lockedAt` / `lockedBy` ;
- `attemptCount` ;
- `lastError` ;
- `FOR UPDATE SKIP LOCKED` ;
- récupération des leases expirés ;
- backoff exponentiel borné ;
- état `DEAD` explicite.

Le worker est appelé par `/api/internal/enterprise-bulk/process?batch=2`, protégé par Bearer secret, et planifié chaque minute uniquement sur `main` dans `vercel.json`.

## Import de relevé bancaire

### Seuil interactif

```text
1 à 250 lignes     → import synchrone existant
251 à 10 000 lignes → job durable
```

Le seuil est explicite et versionné dans `ENTERPRISE_BULK_LIMITS`.

### Mise en file

Avant de créer le job, le serveur revalide :

- organisation active et permission `FINANCE_BANK:create` via la frontière Finance existante ;
- compte bancaire/Mobile Money actif du même tenant ;
- devise du relevé égale à celle du compte ;
- référence de relevé non déjà importée.

Les 10 000 lignes ne sont **pas** stockées dans `EnterpriseDomainEvent.payloadJson`. Le payload complet est placé dans le stockage Supabase privé existant sous :

```text
enterprise-bulk/<organizationId>/bank-statement-import/...
```

Le DomainEvent ne contient que les métadonnées nécessaires, le chemin privé et le nombre de lignes attendu.

### Traitement par chunks

Le worker :

1. revalide le compte, le tenant, la devise et le payload staging ;
2. crée le relevé avec état `IMPORTING` ;
3. insère les lignes par chunks de 500 ;
4. utilise `createMany({ skipDuplicates: true })` avec la contrainte unique existante `(organizationId, bankStatementId, lineNumber)` ;
5. recompte les lignes ;
6. ne passe le relevé à `IMPORTED` qu’après égalité exacte avec `expectedLineCount` ;
7. publie `BANK_STATEMENT_IMPORTED` une seule fois ;
8. supprime le staging privé après succès.

Ainsi, un crash après plusieurs chunks peut être repris sans dupliquer les lignes déjà écrites.

Une erreur terminale laisse le relevé partiel en `IMPORT_FAILED`. La création d’un rapprochement exige désormais explicitement un relevé `IMPORTED`, donc aucun rapprochement ne peut consommer un import incomplet.

### UX

Le workspace Banque conserve le formulaire #580/#583 déjà validé. Un bridge client détecte seulement les réponses `202 queued` et affiche :

- En attente ;
- Import en cours ;
- Nouvelle tentative prévue ;
- Import terminé ;
- Import échoué.

Le job est conservé dans `sessionStorage` uniquement comme pointeur UX ; le serveur reste la source de vérité. L’utilisateur peut quitter le module et revenir. Le polling est borné et l’interface fournit une actualisation manuelle après la fenêtre automatique.

## Export Audit

### Seuil interactif

```text
0 à 500 lignes  → CSV synchrone
501 à 5 000 lignes → job durable
```

Un gros export ne retombe jamais silencieusement sur un export HTTP synchrone si la file ou le stockage n’est pas disponible.

### Sécurité avant génération

La requête initiale conserve :

- session ;
- rate limit ;
- `requireEnterpriseGovernanceAccess` ;
- `sensitiveExportApproval` ;
- vérification d’un `EnterpriseApproval` approuvé lorsque la politique l’exige.

Le worker **revalide** l’accès Governance et l’approbation avant de lire les données.

### Artefact privé et téléchargement

Le CSV est stocké sous :

```text
enterprise-bulk/<organizationId>/audit-export/...
```

Aucune URL publique n’est créée. Le téléchargement passe toujours par une route serveur qui revalide :

- session ;
- rate limit ;
- accès Governance au tenant ;
- job `PROCESSED` ;
- expiration ;
- approbation sensible encore valide si nécessaire.

L’artefact expire après 24 h et le worker purge les artefacts expirés en best effort. Le téléchargement reste `Cache-Control: private, no-store`.

Le CSV neutralise également les préfixes de formule (`=`, `+`, `@`, `-` hors nombre) avant exposition à un tableur.

## Observabilité

Chaque passage du worker retourne :

- nombre de jobs claimed ;
- processed ;
- failed ;
- dead ;
- leases récupérés ;
- artefacts purgés ;
- profondeur `ready` ;
- jobs `processing` ;
- jobs `dead` ;
- âge du plus vieux job prêt ;
- indicateur `saturated`.

Aucune ligne bancaire, aucun contenu CSV et aucune donnée financière brute ne sont ajoutés aux logs techniques du worker.

## Prisma / migrations

**Aucune migration #515.**

Le travail réutilise :

- `EnterpriseDomainEvent` et ses index existants ;
- `EnterpriseBankStatement` ;
- `EnterpriseBankStatementLine` et sa contrainte unique existante ;
- `AuditLog` ;
- `EnterpriseApproval` ;
- le stockage Supabase privé déjà configuré.

Aucune migration historique n’est modifiée.

## Secrets

Le worker accepte les secrets serveur déjà canoniques :

- `CRON_SECRET` ;
- `WORKFLOW_WORKER_SECRET` ;
- optionnellement `ENTERPRISE_BULK_WORKER_SECRET` pour une séparation dédiée.

Le stockage utilise les variables Supabase serveur déjà existantes. Aucun secret n’est transmis au client.

## QA permanente

`scripts/qa-scale4f-durable-bulk-finance.mjs` est importé par `qa-enterprise-accounting-checks.mjs`, donc par la régression Finance et `qa:regression`.

Le gate protège notamment :

- la réutilisation de `EnterpriseDomainEvent` ;
- les seuils 250 / 10 000 et 500 / 5 000 ;
- les chunks de 500 ;
- `SKIP LOCKED`, lease, retry, `DEAD` ;
- `skipDuplicates` ;
- `IMPORTING → IMPORTED` et `IMPORT_FAILED` ;
- blocage du rapprochement sur relevé incomplet ;
- artefacts privés et sans `getPublicUrl` ;
- revalidation Governance/approval au worker et au download ;
- expiration/purge ;
- cron uniquement depuis la politique Vercel actuelle ;
- suivi UX durable.

La CI doit encore prouver sur le HEAD final : Prisma generate, migrations scratch/parité, type-check, `qa:regression`, lint et build. Les tests E2E propriétaire restent requis avant merge.

## Rollback

Le rollback applicatif doit :

1. désactiver la création de nouveaux jobs bulk ;
2. retirer le cron `enterprise-bulk` si nécessaire ;
3. conserver les `EnterpriseDomainEvent`, relevés partiels et artefacts existants pour audit/reprise ;
4. ne jamais supprimer physiquement un relevé partiellement importé pendant le rollback ;
5. ne pas réactiver automatiquement les imports 10 000 lignes ou exports 5 000 lignes synchrones.

Les petits imports/exports peuvent rester synchrones selon les seuils bornés si le rollback est limité au worker.

## Dette

- Dette créée : aucune migration ou seconde queue ; aucune URL publique d’artefact.
- Dette remboursée : import bancaire 10 000 lignes synchrone ; export Audit 5 000 lignes synchrone ; absence de progression/reprise ; absence de purge explicite.
- Dette maintenue : #516 pour la génération durable des rapports Finance lourds ; #521 pour l’atomicité métier/Trésorerie/posting.
