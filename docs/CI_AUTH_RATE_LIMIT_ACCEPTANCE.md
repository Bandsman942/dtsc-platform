# CI — rate limiting Auth pour les acceptances navigateur

Issue : #463

## Constat

Les routes Auth sensibles de DTSC Platform utilisent la politique `security-critical`, dont le mode de défaillance est `closed`. C'est le contrat attendu en Production : si le backend Redis REST requis pour le rate limiting n'est pas disponible, une mutation Auth sensible n'est pas autorisée à continuer comme si de rien n'était.

Les workflows navigateur Accounting et Shop 2 démarraient pourtant l'application sans backend Redis REST. Le premier `POST /api/auth/sign-in` échouait donc avec HTTP 429 avant même l'authentification. Les migrations, seeds, QA statiques et builds pouvaient être verts tandis que l'acceptance navigateur restait impossible.

## Correction

Les workflows concernés provisionnent maintenant deux services strictement locaux au runner :

1. Redis 7 dans un service container GitHub Actions ;
2. `scripts/ci-upstash-redis-rest-proxy.mjs`, un adaptateur HTTP local compatible avec les formes de requêtes utilisées par `lib/redis-rest.ts` (`/` et `/pipeline`).

L'adaptateur traduit les commandes HTTP vers Redis via RESP2 sur `127.0.0.1:6379`. Il n'utilise aucun credential de Production, n'expose aucun port public et exige un bearer token éphémère dérivé du run GitHub.

L'application reçoit ensuite :

- `UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079` ;
- un token CI éphémère correspondant au proxy local.

La route `POST /api/auth/sign-in` n'est pas modifiée. La politique `security-critical / closed` n'est pas abaissée et aucun header, endpoint ou secret E2E ne permet de contourner l'authentification.

## Pourquoi cette approche

- elle exerce le chemin Redis réel du primitive de rate limiting au lieu de forcer `failureMode: local/open` ;
- elle évite de brancher les tests sur Redis Production ;
- elle rend chaque run indépendant ;
- elle reste compatible avec les autres usages Redis REST éventuellement déclenchés par l'AppShell pendant les tests, car le proxy relaie les commandes Redis génériques au service Redis local ;
- elle ne change aucun comportement runtime de Production.

## Preuves attendues

Les workflows doivent prouver :

- démarrage sain du service Redis ;
- démarrage sain du proxy REST avec `PING` ;
- `qa-ci-auth-rate-limit-provisioning.mjs` vert ;
- sign-in E2E fonctionnel ;
- Accounting acceptance vert ;
- Shop 2 behavioral acceptance vert ;
- Quality Gates verts.

Un échec du proxy ou de Redis doit rester bloquant pour les routes `security-critical` : il n'y a pas de fallback permissif introduit par #463.

## Rollback

Revert de #463 : suppression du service Redis CI, du proxy local et des variables associées dans les deux workflows. Aucun schéma Prisma, aucune donnée et aucun secret Production ne sont concernés.
