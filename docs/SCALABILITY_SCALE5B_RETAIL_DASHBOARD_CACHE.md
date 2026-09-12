# SCALE-5B — Cache sûr des projections Retail/Shop

## Objectif

SCALE-5B prolonge SCALE-5A sans mettre en cache une réponse Retail hétérogène. Le dashboard Shop est séparé en trois couches reconstructibles : **organisation / période / utilisateur**. PostgreSQL reste l'unique source canonique ; Redis REST reste une optimisation éphémère et best-effort.

Ce lot étend aussi le contrat d'observabilité du programme : toute capacité de scalabilité backend disposant d'un signal fiable doit être représentée dans **Administration DTSC > CTO > Scalabilité**. Le raccourci Scalabilité rejoint le même `FloatingActionHub` que la **Boîte à outils professionnelle** afin d'éviter deux boutons flottants concurrents.

## Diagnostic traité

Avant SCALE-5B, `getCommercialRetailDashboard()` regroupait jusqu'à environ 17 loaders/requêtes dans un seul `Promise.all` : configuration Retail, providers, comptes, warehouses, catalogue, ventes, Mobile Money, topups, clôtures, métriques, readiness et sessions de caisse utilisateur.

La réponse ne pouvait pas être cachée globalement sans risque : les `EnterpriseCashSession` sont filtrées par `cashierUserId` et contiennent un état propre à l'utilisateur connecté.

## Architecture

```text
route Retail autorisée
→ projection organisation tenant + module
   → cache Redis court
→ projection période tenant + module
   → cache Redis court seulement pour la plage par défaut
   → plage from/to explicite = BYPASS
→ projection utilisateur/caisse
   → PostgreSQL à chaque lecture, jamais cache partagé
→ composition du contrat dashboard existant
```

Les quatre modules Retail restent séparés :

- `RETAIL_POS` ;
- `MOBILE_MONEY_AGENCY` ;
- `TELCO_TOPUPS` ;
- `RETAIL_DAILY_CLOSE`.

Chaque module obtient donc ses propres clés de projection. `organizationId` reste obligatoire dans la clé fournie par `tenant-read-cache.ts`.

## Couche organisation

La projection organisationnelle contient uniquement les données partageables dans une même entreprise : configuration Retail, providers, comptes opérationnels, warehouses lorsque requis, catalogue lorsque requis, readiness canonique et configurations Mobile Money/Telco applicables.

- TTL : **60 secondes** ;
- validation JSON avant réutilisation ;
- HIT : aucun replay des loaders organisationnels ;
- MISS/FALLBACK : reconstruction depuis PostgreSQL ;
- aucune session de caisse et aucun `userId` dans cette couche.

## Couche période

La projection période contient les données partageables de la fenêtre demandée : ventes, Mobile Money, topups, clôtures, métriques par devise, readiness FX et readiness comptable.

Pour garder une cardinalité de clés bornée, SCALE-5B ne cache que la fenêtre par défaut du dashboard. Une requête avec `from` ou `to` explicite retourne `BYPASS` et charge directement PostgreSQL.

- TTL : **15 secondes** ;
- clé distincte par organisation et module ;
- aucune donnée de caisse utilisateur ;
- aucun cache arbitraire des historiques personnalisés.

La plage retournée avec une projection HIT correspond exactement aux données mises en cache pendant cette courte fenêtre.

## Couche utilisateur

`getRetailDashboardUserProjection()` lit toujours PostgreSQL avec :

```text
organizationId + cashierUserId + statut session
```

Les mouvements servent à recalculer `expectedCurrentAmount`. Cette projection n'appelle jamais `withTenantReadCache()` et sa source technique est toujours `BYPASS`.

Ainsi, deux utilisateurs de la même entreprise peuvent partager les projections organisation/période tout en conservant des sessions de caisse différentes et correctement isolées.

## Invalidation

Le worker Workflow invalide après le traitement métier les projections Retail concernées, en plus de l'invalidation Finance Overview déjà livrée par SCALE-5A.

Deux familles sont suivies :

- organisation : configuration Retail, provider, compte financier, warehouse/storage, catalogue, site, inventaire/stock ;
- période : vente/retour Retail, Mobile Money, FX Mobile Money, Telco, clôture Retail, écart de caisse et écriture comptable.

L'invalidation utilise `Promise.allSettled()` et `invalidateTenantReadCache()`. Une panne Redis ou une invalidation échouée ne doit donc jamais transformer un événement métier correctement traité en échec métier. Les TTL de 15/60 secondes restent le filet de sécurité de fraîcheur.

## Observabilité Retail

La route `/api/enterprise/[organizationId]/retail/dashboard` conserve les mêmes contrôles session/module/RBAC avant toute lecture de projection.

Les sources techniques :

```text
organization: HIT | MISS | FALLBACK
period: HIT | MISS | FALLBACK | BYPASS
user: BYPASS
```

sont écrites uniquement dans les métadonnées `ApiLog` sous `retailCache`. Elles ne sont pas ajoutées au payload métier.

## Administration DTSC > CTO > Scalabilité

`getProductionObservabilitySnapshot()` agrège désormais les capacités de scalabilité déjà livrées et opérables sans retourner d'identifiant tenant/utilisateur ni de secret :

- **SCALE-0/1** : débit et latences API, taux d'erreur, probe PostgreSQL, connexions, pooling et requêtes longues ;
- **SCALE-2** : Redis live, présence Redis-first, appels/reconciliation/fallbacks ;
- **SCALE-3** : registre canonique des politiques de rate-limit, état de la distribution Redis et fenêtre d'agrégation de la télémétrie dégradée ;
- **SCALE-4** : pression agrégée de la file durable `EnterpriseDomainEvent` avec `ready`, `processing`, `dead` et âge du plus ancien événement prêt ;
- **SCALE-5A** : lectures `finance-overview-summary` avec HIT/MISS/FALLBACK et taux de HIT ;
- **SCALE-5B** : lectures Retail organisation/période avec HIT/MISS/FALLBACK/BYPASS et taux de HIT.

Les fenêtres UI restent 1 h, 24 h et 7 jours. Les métriques sans échantillon restent explicitement `Non mesuré` et les signaux dégradés sont affichés `À surveiller`.

Le dashboard CTO reste protégé par `CONSOLE_CAPABILITIES.SECURITY_READ`, en FR/EN et responsive. Les métadonnées sont agrégées : `organizationId`, `userId`, clés Redis et DSN ne sont jamais renvoyés à la vue.

### Launcher harmonisé

L'ancien bouton flottant Scalabilité indépendant dans `app/admin/[section]/page.tsx` est supprimé. `CtoScalabilityFloatingAction` s'enregistre dans le `FloatingActionHub` partagé :

```text
agent mode            order 5
CTO Scalabilité       order 8
boîte à outils pro    order 10
```

L'action n'est enregistrée que dans la section CTO et uniquement après la décision `SECURITY_READ`. Le bouton flottant commun conserve donc une seule surface visuelle pour les actions rapides.

## Sécurité et isolation

- aucune clé cache globale Retail ;
- `organizationId` obligatoire dans les clés du cache ;
- séparation par module ;
- aucun `userId`, session de caisse ou mouvement de caisse dans une valeur cache partagée ;
- aucun secret Redis côté client et aucun `NEXT_PUBLIC_*` ;
- JSON invalide, Redis absent, timeout ou erreur => fallback PostgreSQL ;
- PostgreSQL reste l'autorité unique et toutes les projections sont reconstructibles ;
- les métriques CTO sont agrégées et secret-free.

## Mesure attendue

Sur une deuxième lecture identique de la fenêtre par défaut :

- la projection organisation peut être `HIT` et évite ses loaders PostgreSQL ;
- la projection période peut être `HIT` et évite ses loaders PostgreSQL ;
- la lecture de session de caisse utilisateur reste exécutée ;
- une plage historique personnalisée ne crée aucune nouvelle famille de clés et reste `BYPASS` ;
- les compteurs agrégés correspondants deviennent visibles dans le dashboard CTO.

SCALE-5B réduit donc le coût des lectures répétées sans sacrifier l'isolation user-specific.

## QA

`scripts/qa-scale5b-retail-dashboard-cache.mjs`, branché à `qa:regression`, protège notamment :

- la séparation organisation / période / utilisateur ;
- l'absence de `userId` et de sessions de caisse dans les projections partagées ;
- les TTL bornés de 60 et 15 secondes ;
- le `BYPASS` des plages personnalisées ;
- l'autorisation avant lecture des projections ;
- la télémétrie `ApiLog` sans exposition dans le payload ;
- l'invalidation worker best-effort tenant-scoped ;
- la conservation de la fondation `tenant-read-cache.ts` de SCALE-5A ;
- la présence des compteurs SCALE-5 dans le snapshot et dans l'UI CTO ;
- l'enregistrement Scalabilité dans le `FloatingActionHub` commun et l'absence de bouton flottant indépendant.

`scripts/qa-scale0d-console-dashboard.mjs` devient aussi le contrat transverse de visibilité : il exige que les signaux SCALE-2/3/4/5 livrés restent représentés dans le dashboard CTO et que la Boîte à outils professionnelle partage le même hub flottant.

Les gates Shop existantes restent applicables parce que le contrat HTTP fonctionnel du dashboard ne change pas.

## OWNER_E2E

Avant merge :

1. ouvrir deux fois successivement un dashboard Retail avec la plage par défaut et vérifier que le contenu métier reste identique ;
2. vérifier avec deux utilisateurs de la même entreprise que les sessions de caisse restent propres à chaque utilisateur ;
3. effectuer une mutation Retail pertinente puis vérifier le rafraîchissement du dashboard dans la fenêtre de fraîcheur ;
4. tester une plage `from/to` personnalisée et vérifier le résultat correct ;
5. répéter une lecture sur une seconde organisation pour vérifier l'absence de pollution croisée ;
6. vérifier `RETAIL_POS`, `MOBILE_MONEY_AGENCY`, `TELCO_TOPUPS` et `RETAIL_DAILY_CLOSE` selon les modules disponibles ;
7. ouvrir **Administration DTSC > CTO > Scalabilité** en FR et EN et vérifier les cartes API, PostgreSQL, IA, Redis, rate-limit, files/workers et caches/projections ;
8. vérifier sur desktop et mobile que le raccourci Scalabilité apparaît dans le même bouton flottant que **Boîte à outils professionnelle**, sans second bouton flottant ;
9. vérifier qu'aucune donnée tenant/user, clé Redis ou DSN n'est affichée.

`OWNER_E2E` reste `NOT_EXECUTED` tant que le propriétaire ne l'a pas confirmé explicitement.

## Prisma

Aucune migration ni backfill. Le cache ne devient jamais une source de vérité persistante.

## Rollback

Le rollback applicatif consiste à retirer les wrappers de cache et à recomposer les trois couches depuis PostgreSQL. Les clés Redis expirent naturellement ; aucune donnée métier ne doit être restaurée.

Pour l'UI CTO, le rollback peut retirer les nouvelles cartes et l'enregistrement du launcher sans modifier les autorisations ni les données métier. Les métriques restent dérivées de sources canoniques et ne nécessitent aucun rollback de données.

## Hors scope

- cache des sessions de caisse user-specific ;
- cache de plages historiques arbitraires ;
- refonte UI Retail ;
- données Health/RH/clinique ;
- AI concurrency SCALE-6 ;
- certification de charge SCALE-7.
