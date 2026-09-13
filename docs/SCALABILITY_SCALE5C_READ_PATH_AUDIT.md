# SCALE-5C — Audit et optimisation des read paths lourds

## Baseline

Baseline de départ : `main@4438b89d9a4d48c06aa15aedec7a4e5cd55a9e46`, après SCALE-5B #630 / PR #631 en Production.

SCALE-5C complète SCALE-5 avec une règle simple : **mesurer et classifier avant de cacher**. PostgreSQL reste la source canonique ; Redis REST n'est qu'une accélération éphémère et tenant-scoped.

## Audit des candidats

| Read path | Diagnostic | Classement | Décision |
|---|---|---|---|
| `finance-summary` | 2 lectures de découverte des devises puis 5 agrégats par devise, soit `2 + 5N` lectures PostgreSQL par ouverture. Le endpoint écrit déjà `ApiLog.durationMs`. | Optimiser maintenant | Cache 30 s uniquement pour la visibilité organisationnelle complète (`canSeeAll=true`). |
| Administration Entreprise | Plus de 20 loaders/queries de premier niveau, puis construction de `pendingActions` dépendante de `viewerUserId`, des approbations et des permissions par module. | Laisser PostgreSQL pour ce lot | Le payload mélange données partageables et données permission/user-specific. Un cache global serait incorrect ; une future optimisation exige d'abord une séparation explicite et un signal runtime dédié. |
| Rapports Finance | Les rapports lourds disposent déjà de snapshots durables livrés avec SCALE-4G. | Ne pas dupliquer | Réutiliser les snapshots existants ; ne pas créer une deuxième source de vérité. |
| Usage IA entreprise | Quotas et usage combinent dimensions organisation + utilisateur et appartiennent au contrôle de concurrence IA. | Reporter | Traité dans #359 / SCALE-6, pas dans SCALE-5C. |
| Références Manufacturing/Tailoring | Plusieurs loaders parallèles, mais ce ne sont pas les dashboards/rapports prioritaires visés par SCALE-5C et aucune preuve runtime ne justifie un nouveau cache ici. | Laisser PostgreSQL | Pas d'optimisation sans mesure matérielle. |

### Coût statique de `finance-summary`

Le loader canonique découvre d'abord les devises visibles via :

1. `EnterpriseBudget.findMany(distinct currency)` ;
2. `EnterpriseExpense.findMany(distinct currency)`.

Pour chaque devise, il exécute ensuite cinq agrégats :

1. nombre de budgets actifs ;
2. somme planifiée ;
3. engagements ;
4. dépenses budgétées approuvées ;
5. dépenses non budgétées approuvées.

Le coût statique est donc :

```text
2 + (5 × nombre_de_devises)
```

Exemples : 1 devise = 7 lectures ; 2 devises = 12 ; 4 devises = 22.

Ce calcul est une preuve structurelle du coût du loader, pas une affirmation de latence Production. Les latences P95 avant/après sont dérivées des `ApiLog` observés et restent `Non mesuré` tant qu'aucun échantillon n'existe.

## Architecture retenue

```text
GET finance-summary
→ session
→ organisation / membership / module FINANCE_BUDGETS / permission read
→ résolution canSeeAll
   ├─ canSeeAll = true
   │  → projection organisationnelle tenant-scoped
   │  → Redis court 30 s
   │  → HIT / MISS / FALLBACK
   └─ canSeeAll = false
      → visibilité budgets/dépenses filtrée par userId
      → PostgreSQL canonique
      → BYPASS
→ même contrat JSON métier qu'avant
→ source technique uniquement dans ApiLog
```

## Pourquoi le cache est limité à `canSeeAll=true`

`enterpriseBudgetVisibilityWhere()` et `enterpriseExpenseVisibilityWhere()` appliquent des filtres utilisateur lorsque `canSeeAll=false`. Mettre ces résultats dans une clé partagée par organisation risquerait de réutiliser la vue d'un utilisateur pour un autre.

La projection partagée n'est donc construite que lorsque la visibilité est organisationnelle complète. Son loader ne reçoit aucun `userId` et utilise uniquement `organizationId + archivedAt`.

Les utilisateurs à visibilité restreinte restent sur le loader PostgreSQL avec leurs filtres canoniques et une source technique `BYPASS`.

## Cache et fallback

Projection : `finance-budget-summary`

- schéma : `v1` ;
- TTL : **30 secondes** ;
- clé : fournie par `tenant-read-cache.ts`, avec `organizationId` obligatoire ;
- validation structurale du JSON avant HIT ;
- Redis absent, lent, invalide ou en erreur : reconstruction PostgreSQL ;
- aucun changement de contrat métier client ;
- aucune migration Prisma ;
- aucun nouveau provider, secret ou `NEXT_PUBLIC_*`.

Un HIT évite le loader `2 + 5N` dans son intégralité pour la vue organisationnelle complète.

## Invalidation

Le worker Workflow invalide la projection après traitement métier pour les familles pouvant modifier le résumé :

- `EnterpriseBudget` ;
- `EnterpriseBudgetLine` ;
- `EnterpriseBudgetCommitment` ;
- `EnterpriseExpense` ;
- `EnterprisePurchase` ;
- `EnterpriseApproval`.

L'invalidation est tenant-scoped et réutilise `invalidateTenantReadCache()`. Le TTL de 30 s reste le filet de sécurité.

## Télémétrie

La route `finance-summary` écrit dans `ApiLog.metadata` :

```text
domain: finance-summary
readSource: HIT | MISS | FALLBACK | BYPASS
visibility: ORGANIZATION | USER_BYPASS
```

Ces champs ne sont jamais ajoutés au JSON métier retourné au client.

Le snapshot SCALE-5C agrège uniquement :

- nombre de lectures ;
- HIT / MISS / FALLBACK / BYPASS ;
- hit-rate ;
- P95 des lectures HIT ;
- P95 des lectures allant en base (`MISS/FALLBACK/BYPASS`).

Il ne retourne ni `organizationId`, ni `userId`, ni clé Redis, ni DSN, ni secret.

## Administration DTSC > CTO > Scalabilité

La surface CTO conserve le snapshot canonique existant SCALE-0..5 et ajoute un panneau SCALE-5C dédié à la lecture Finance :

- état mesuré / non mesuré / à surveiller ;
- compteur de lectures ;
- HIT/MISS/FALLBACK/BYPASS ;
- hit-rate ;
- P95 HIT vs P95 DB ;
- couverture 5A / 5B / 5C ;
- nombre de read paths optimisés et de bypass intentionnels.

Le panneau reste FR/EN, responsive et derrière le même contrôle `SECURITY_READ` que la console Scalabilité. Il ne crée aucune nouvelle source de vérité métier : il ne fait qu'agréger `ApiLog`.

### Couverture déclarée

Read paths optimisés :

1. SCALE-5A Finance Overview ;
2. SCALE-5B Retail organisation ;
3. SCALE-5B Retail période par défaut ;
4. SCALE-5C Finance Summary visibilité organisationnelle.

Bypass intentionnels :

1. Retail période `from/to` personnalisée ;
2. Retail état caisse/user-specific ;
3. Finance Summary visibilité user-specific.

## Sécurité

- autorisation avant toute lecture cache ;
- clé tenant-scoped ;
- aucun `userId` dans le loader cache partagé ;
- aucune vue user-specific mise en cache ;
- aucun cross-currency : les buckets restent séparés par devise ;
- PostgreSQL reste l'autorité ;
- aucune baisse de permission ;
- aucune donnée de cache technique dans le payload métier.

## QA permanente

`scripts/qa-scale5c-read-path-cache.mjs`, branché à `qa:regression`, protège notamment :

- le cache `finance-budget-summary` et son TTL 30 s ;
- le `BYPASS` lorsque `canSeeAll=false` ;
- l'absence de `userId` dans le loader organisationnel partagé ;
- l'autorisation Finance avant la lecture ;
- la télémétrie `readSource` uniquement côté serveur ;
- l'invalidation worker après traitement métier ;
- l'agrégation CTO secret-free ;
- la présence du panneau SCALE-5C en FR/EN et responsive ;
- la conservation de la QA SCALE-5 dans `qa:regression`.

Les gates Finance existantes restent applicables ; le contrat JSON de `finance-summary` ne change pas.

## OWNER_E2E final SCALE-5

Avant fermeture de #632 puis #358 :

1. utilisateur Finance avec visibilité organisationnelle complète : ouvrir deux fois le résumé et vérifier des données métier identiques ;
2. vérifier que la seconde lecture peut produire un `HIT` sans changement du payload ;
3. effectuer une mutation Budget/Dépense pertinente puis vérifier la fraîcheur après invalidation/TTL ;
4. utilisateur Finance à visibilité restreinte : vérifier le résultat autorisé et le `BYPASS`, sans fuite de données d'un autre utilisateur ;
5. deuxième organisation : vérifier l'absence de pollution croisée ;
6. vérifier Finance Overview SCALE-5A et Retail SCALE-5B pour non-régression ;
7. ouvrir `Administration DTSC > CTO > Scalabilité` en FR et EN ;
8. vérifier desktop/mobile, P95/HIT/MISS/FALLBACK/BYPASS et couverture 5A/5B/5C ;
9. confirmer qu'aucun identifiant tenant/user, clé Redis ou secret n'est affiché.

`OWNER_E2E` reste `NOT_EXECUTED` tant que le propriétaire ne l'a pas confirmé explicitement.

## Prisma

Aucune migration et aucun backfill.

## Rollback

Retirer le wrapper `withTenantReadCache()` de `finance-summary` et revenir au loader PostgreSQL canonique. Les clés Redis expirent naturellement. L'invalidation worker et le panneau CTO peuvent être retirés sans rollback de données.

## Suite

Après preuves CI + OWNER_E2E : clôturer #632, consolider SCALE-5A/5B/5C dans #358, fermer #358 si aucun sous-lot matériel ne reste, mettre à jour #352, puis débloquer #359 / SCALE-6.
