# SCALE-6 — AI concurrency, quotas and provider resilience

Issue : #359
Parent : #352
Baseline : main@85a119cd9a55b800ae8364e16dcf25b02f2a9323

## Objectif

SCALE-6 empêche une saturation IA de dégrader l’ERP et la collaboration en ajoutant une admission de concurrence avant tout appel provider, sans créer un deuxième routeur ni une deuxième source de quotas.

## Architecture

`routeAiStream()` reste l’autorité unique de sélection provider/modèle. Après policy, plan et health scoring, chaque candidat doit obtenir un lease de concurrence via `lib/ai/concurrency.ts` avant `createProviderEventStream()`.

Le lease couvre trois limites simultanées : utilisateur, organisation et provider. Les compteurs Redis sont acquis atomiquement par Lua. Si Redis est indisponible, un fallback local borné protège l’instance courante ; il n’est jamais présenté comme une garantie distribuée.

Le lease reste détenu pendant tout le stream et est libéré sur COMPLETED, ERROR, fin de flux, exception ou cancellation.

## Classes de charge

- CHAT : conversation personnelle, entreprise et composition ;
- AGENT : runs portant les tags runtime:agent-v1 / agent-run ;
- EMBEDDING : embeddings et reranking.

Les budgets Agent par plan restent définis dans `lib/ai/agent/policy.ts`. SCALE-6 ajoute la concurrence ; il ne remplace ni les limites de messages/tokens, ni les budgets steps/outils/coût/durée.

## Saturation et file bornée

Une admission peut patienter brièvement par tranches de 75 ms dans la fenêtre `queueWaitMs`. Cette file est volontairement bornée pour une requête interactive ; elle n’est pas une queue durable et n’accumule pas de prompts.

- saturation USER ou ORGANIZATION : `RATE_LIMITED`, non retryable dans le routeur ;
- saturation PROVIDER : `RATE_LIMITED`, retryable afin que l’orchestrateur puisse essayer un autre provider autorisé ;
- un fallback repasse toujours par policy, plan, health et admission.

Les seuils codés sont des **garde-fous de protection**, pas une preuve de capacité commerciale. SCALE-7 doit déterminer les limites certifiables par paliers de charge.

## Résilience provider / circuit breaker

`lib/ai/health.ts` reste le circuit breaker canonique : il utilise `AiProviderAttempt` et `AiModelCall` pour éliminer un provider/modèle indisponible ou déprioriser un candidat dégradé. Les 429, timeouts et 5xx restent normalisés par `lib/ai/errors.ts` et les erreurs retryables peuvent déclencher un fallback contrôlé.

SCALE-6 ne délègue aucun fallback caché à OpenRouter : les fallbacks restent décidés par DTSC et audités par `AiProviderAttempt`.

## Observabilité CTO

`Administration DTSC > CTO > Scalabilité` reste protégée par `SECURITY_READ` et expose désormais, sans identifiant utilisateur/tenant ni secret :

- appels et latences AiModelCall ;
- tentatives provider et tentatives actives récentes ;
- saturations / RATE_LIMITED ;
- timeouts ;
- indisponibilités provider ;
- politique de concurrence Chat / Agent / Embeddings.

Les états sont disponibles en FR/EN et le layout reste responsive. Une absence d’échantillon reste explicitement non mesurée ; aucun chiffre de cette vue n’est présenté comme certification 5 000 utilisateurs.

## Sécurité et confidentialité

Les clés Redis utilisent des identifiants normalisés côté serveur et ne sont jamais renvoyées au client. Les snapshots CTO n’exposent que des agrégats. Aucun prompt, message, argument outil, token provider ou secret n’est stocké dans les compteurs de concurrence.

## Rollback

Revert applicatif de la PR. Aucun changement Prisma ni backfill. Les tables AiModelCall/AiProviderAttempt existantes restent inchangées.

## Suite

SCALE-7 (#360) exécute et archive les paliers 500 → 1 000 → 2 500 → 5 000. SCALE-8 (#361) transforme les seuils prouvés en capacity gates et runbooks durables.
