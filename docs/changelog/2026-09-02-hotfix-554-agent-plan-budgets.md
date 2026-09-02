# 2026-09-02 — Hotfix #554 — Budgets Agent par plan entreprise

## Contexte

Une analyse de trésorerie Enterprise multi-modules pouvait s’arrêter prématurément avec `BUDGET_EXHAUSTED/MAX_TOOL_CALLS`. La policy serveur autorisait seulement 6 appels d’outils pour le niveau ENTERPRISE alors que le parcours réel peut nécessiter une quinzaine de lectures Finance avant la synthèse.

## Changement

Les budgets de run Agent restent déterminés côté serveur par le plan commercial canonique de l’utilisateur ou de l’organisation :

| Plan | Étapes | Outils | Tokens/run | Coût estimé/run | Durée active |
|---|---:|---:|---:|---:|---:|
| STARTER / Essentiel | 4 | 3 | 8 000 | 0,15 USD | 25 s |
| BUSINESS / Professionnel | 10 | 10 | 32 000 | 1 USD | 45 s |
| ENTERPRISE / Entreprise / Premium | 18 | 20 | 64 000 | 4 USD | 55 s |

Les alias commerciaux `premium`, `enterprise` et `entreprise` continuent à résoudre vers `ENTERPRISE`.

Les routes Agent conservent leur plafond d’infrastructure de 60 secondes. Une QA permanente garantit que le budget actif maximal reste strictement inférieur à ce plafond.

## Sécurité et gouvernance

- aucun outil nouveau n’est autorisé ;
- chaque outil reste filtré et réautorisé par le Tool Gateway ;
- les classifications sensibles restent limitées à READ/PREPARE lorsque la policy l’exige ;
- les limites demandées par le client peuvent seulement réduire les plafonds serveur ;
- quotas commerciaux globaux, rate limiting, RBAC, entitlements et isolation tenant restent inchangés ;
- la minimisation des résultats backend introduite par #551 reste inchangée ;
- aucune chaîne de pensée privée n’est exposée.

## Données / Prisma / configuration

Aucune migration Prisma, aucune variable d’environnement et aucun changement de configuration Vercel.

## Validation attendue

- QA Agent budgets : hiérarchie stricte STARTER < BUSINESS < ENTERPRISE, mapping Premium, clamp serveur et plafond d’infrastructure ;
- type-check, régression, lint et build par CI ;
- OWNER_E2E requis avant merge sur une entreprise Premium/Enterprise avec le scénario d’analyse de trésorerie multi-modules.