# SCALE-3C — harness multi-instance et failover contrôlé du rate limiting

Issue d'implémentation: #432
Certification Production: #434
Stabilisation de la mesure: #436
Parent: #356
Programme: #352

## Objectif

Cette itération ne change pas les limites métier. Elle fournit le dispositif de preuve manquant de SCALE-3 : le rate limiting doit rester distribué sous concurrence quand Redis fonctionne et doit adopter une dégradation bornée, explicite et rapide lorsque Redis est indisponible.

L'implémentation du harness est suivie par #432. La preuve Production réelle et la fermeture de #356 sont suivies séparément par #434. La stabilisation du chemin de mesure, sans réduction de charge ni relèvement de seuil, est suivie par #436.

La preuve est séparée en deux catégories :

1. **healthy Production** — le probe utilise le vrai `rateLimit(...)` et donc le vrai Redis Production ;
2. **failover contrôlé** — le probe injecte un résultat Redis `TIMEOUT` au boundary du primitive, après la même construction de contexte et avant la même résolution de résultat que le chemin normal. Le scénario ne coupe jamais Redis Production.

## Endpoint de probe

`GET /api/admin/scalability/rate-limit-probe`

Protection :

- `requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ)` ;
- runtime Node.js ;
- `Cache-Control: private, no-store` ;
- `Vary: Cookie` ;
- aucune écriture PostgreSQL ;
- aucune mutation métier ;
- paramètres `mode`, `runId`, `limit` validés par Zod et bornés.

Le probe expose un `instanceId` aléatoire créé au chargement du module. Il sert uniquement à compter le nombre d'instances effectivement touchées. Ce marqueur est éphémère et ne contient ni hostname, région, PID, tenant, user, IP ou secret. Le rapport sanitizé n'archive pas les valeurs d'instance, seulement leur nombre.

## Modes

### `healthy`

- clé logique dédiée au probe ;
- vrai appel `rateLimit(...)` ;
- vrai Redis ;
- source attendue : `redis` ;
- `degraded=false` ;
- sous charge concurrente, le nombre total d'appels autorisés doit être exactement égal à la limite globale, jamais `limite × nombre d'instances` ;
- le run Production doit observer **>= 2 instances** éphémères.

Ce scénario prouve que le compteur atomique Redis est partagé entre plusieurs instances applicatives.

### `closed`

- scope `auth:sign-in:*`, classé `security-critical` ;
- résultat transport injecté : `TIMEOUT` ;
- résultat attendu : `source=fail-closed`, `ok=false`, `degraded=true`, `reason=TIMEOUT`.

### `local`

- scope non classé, donc profil `availability-balanced` ;
- résultat transport injecté : `TIMEOUT` ;
- résultat attendu : `source=local`, `degraded=true`, `reason=TIMEOUT` ;
- le nombre autorisé reste borné par `limite locale × nombre d'instances observées`.

Cette preuve documente volontairement que le fallback local n'est pas global. Il protège chaque instance pendant la panne sans prétendre remplacer Redis.

### `open`

- aucun scope métier n'est activé `availability-first` dans SCALE-3B ;
- ce mode utilise uniquement l'override explicite du probe pour vérifier que le primitive conserve son contrat `fail-open` ;
- résultat attendu : `source=fail-open`, `ok=true`, `degraded=true`, `reason=TIMEOUT`.

Le probe n'active donc aucune nouvelle route métier en fail-open.

## Harness Production

`scripts/load/scale3-rate-limit-resilience.mjs` utilise uniquement les API Node 22. Il n'ajoute aucune dépendance.

Configuration certifiante inchangée :

- healthy : 400 requêtes, concurrence 80, limite globale 50 ;
- failover par mode : 60 requêtes, concurrence 30 ;
- limite locale : 5 ;
- fenêtre : 120 secondes, contrôlée côté serveur.

Depuis #436, le harness exécute avant le healthy un **warm-up borné** :

- 160 requêtes ;
- concurrence 80 ;
- clé logique/runId distinct `*-warmup` ;
- limite dédiée 100 ;
- pause de stabilisation 500 ms avant la mesure certifiante.

Le warm-up ne consomme jamais le quota du scénario healthy certifié, car il utilise une clé Redis distincte. Il sert uniquement à préamorcer le runtime, l'authentification et le dispatch multi-instance. Sa latence est conservée dans l'artifact comme **diagnostic**, mais n'est pas utilisée comme gate de latence de certification. En revanche, le warm-up doit rester sans erreur HTTP/payload invalide et 100 % source Redis.

Le harness collecte :

- erreurs HTTP et payloads invalides ;
- allowed / blocked ;
- source et reason normalisées ;
- nombre d'instances distinctes ;
- P50/P95/P99 de la requête HTTP ;
- P50/P95/P99 du temps mesuré dans le primitive ;
- métriques agrégées du warm-up dans une section séparée du rapport.

## Gates PASS/FAIL

Le run échoue si l'une des garanties suivantes n'est pas respectée :

- warm-up : zéro erreur HTTP, zéro payload invalide, 100 % source Redis ;
- zéro erreur HTTP inattendue sur chaque mode certifié ;
- P95 HTTP <= 2 000 ms sur chaque mode certifié ;
- healthy : >= 2 instances, 100% `redis`, aucune dégradation, allowed exactement égal à la limite ;
- healthy : P95 primitive <= 1 000 ms ;
- closed : 100% `fail-closed`, 100% `TIMEOUT`, zéro allowed ;
- local : 100% `local`, 100% `TIMEOUT`, allowed > 0 et <= `limite × instances` ;
- open : 100% `fail-open`, 100% `TIMEOUT`, toutes les requêtes allowed ;
- modes failover contrôlés : P99 primitive <= 300 ms.

La borne statique `RATE_LIMIT_REDIS_TIMEOUT_MS = 300` reste vérifiée par SCALE-3A. SCALE-3C ajoute une mesure runtime du chemin de dégradation, sans simuler une coupure du Redis réel.

## Résultats Production ayant motivé #436

Après merge de #435 et Vercel Production READY sur `main@6e921dccc7f2702501b0447e3c8988fdbf12e2d9`, deux runs owner-triggered ont été exécutés sans changement de gate :

### Run `32230763475`

- statut : **FAIL** ;
- 400 requêtes healthy, concurrence 80 ;
- 50 requêtes autorisées exactement ;
- 74 instances observées ;
- 400/400 source Redis ;
- zéro erreur HTTP ;
- healthy HTTP P95 : 2 895,92 ms ;
- healthy primitive P95 : 124,93 ms ;
- healthy primitive P99 : 137,46 ms ;
- failover closed/local/open : sources attendues 60/60/60 ;
- max failover primitive P99 : 9,07 ms ;
- unique gate en échec : `healthy: HTTP p95 must be <= 2000 ms`.

### Run `32230979755`

- statut : **FAIL** ;
- 400 requêtes healthy, concurrence 80 ;
- 50 requêtes autorisées exactement ;
- 77 instances observées ;
- 400/400 source Redis ;
- healthy HTTP P95 : 2 547,3 ms ;
- healthy primitive P95 : 125,17 ms ;
- failover closed/local/open entièrement conforme ;
- max failover primitive P99 : 27,19 ms ;
- unique gate en échec : `healthy: HTTP p95 must be <= 2000 ms`.

Les deux runs montrent que le primitive Redis reste rapide et distribué, tandis que le premier burst HTTP à concurrence 80 paie un coût de cold-start/dispatch/authentification. Les modes failover exécutés juste après restent autour de 200 ms P95 HTTP. #436 corrige donc la **méthode de mesure**, pas le seuil : 400 requêtes, concurrence 80, limite 50 et P95 HTTP <= 2 000 ms restent inchangés.

## Workflow owner-triggered

`.github/workflows/scale3-rate-limit-resilience.yml` est manuel et borné.

Deux déclenchements sont autorisés :

- `workflow_dispatch` avec confirmation exacte `RUN_SCALE3_RESILIENCE` ;
- commentaire exact `RUN_SCALE3_RESILIENCE` par l'OWNER sur l'Issue de certification #434.

Le workflow réutilise les credentials déjà gouvernés pour les preuves de charge :

- `SCALE1_LOAD_BASE_URL` ;
- `SCALE1_CTO_SESSION_COOKIE` ;
- `VERCEL_AUTOMATION_BYPASS_SECRET`.

Aucun nouveau secret n'est introduit.

## Artifact sanitizé

Le workflow archive pendant 30 jours :

- `scale3-rate-limit-resilience-report.json` ;
- `scale3-rate-limit-resilience-report.md`.

Le rapport contient uniquement les métriques agrégées. Il exclut explicitement :

- cookie/session ;
- secret Vercel bypass ;
- URL/token Redis ;
- clé logique rate-limit ;
- IP ;
- userId / tenantId / organizationId ;
- hostname / PID / région ;
- identifiants bruts d'instance ;
- objet erreur provider brut.

Le rapport v2 contient une section `warmup` séparée et la configuration agrégée du warm-up. Aucune clé logique ni aucun identifiant d'instance brut n'est persisté.

## Politique Vercel

La branche et la PR ne doivent créer aucun Preview. Le workflow SCALE-3 ne déploie rien. Le probe devient disponible uniquement après fusion sur `main` et déploiement Production normal.

## Séquence de clôture

1. CI de la PR du harness / stabilisation : QA SCALE-3C + Regression QA + type-check + lint + build ;
2. merge sur `main` de la correction #436 si la CI est verte ;
3. Vercel Production READY du nouveau SHA ;
4. commentaire OWNER `RUN_SCALE3_RESILIENCE` sur #434 ;
5. artifact + rapport sanitizé PASS ;
6. publication de la preuve sur #434 et #356 ;
7. fermeture #434 puis #356 si toutes les gates sont satisfaites.

La CI de la PR ne constitue pas la preuve multi-instance Production. Cette preuve n'existe qu'après le run owner-triggered post-merge suivi dans #434.

## Rollback

Le probe, le harness et le workflow peuvent être revert sans migration ni restauration de données. Le primitive SCALE-3A/SCALE-3B reste fonctionnel indépendamment de ce dispositif de preuve.
