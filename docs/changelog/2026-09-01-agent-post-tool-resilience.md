# Hotfix #545 — Résilience Agent après appel d’outil ERP

Date : 2026-09-01

## Contexte

Après la livraison #543, le mode Agent Enterprise pouvait réellement appeler les outils Finance du Tool Gateway. Un run Production a cependant montré le parcours `MODEL → FINANCE_TREASURY_READ → SYSTEM FAILED` alors que les limites d’étapes, d’outils et de tokens n’étaient pas atteintes.

## Cause racine

Le runtime convertissait le résultat d’un outil réussi en simple message `user`. Ce format perdait le couple protocolaire `assistant tool_call → tool result` et son identifiant d’appel. Les adaptateurs OpenAI Responses et OpenRouter Chat Completions reconstruisaient ensuite uniquement des messages texte. En cas d’interruption provider/stream sur le tour modèle suivant, le run passait directement à `FAILED` sans reprise bornée.

## Correction

- introduction d’un historique agentique structuré commun aux providers ;
- adaptation OpenAI Responses vers `function_call` / `function_call_output` liés par `call_id` ;
- adaptation Chat Completions vers `assistant.tool_calls` / `tool` liés par `tool_call_id` ;
- conservation du `call_id` OpenAI lorsque le provider le fournit ;
- résultats d’outils READ, refus et résultats confirmés injectés comme vrais messages `tool` ;
- reconstruction du couple tool call/result lors d’une reprise après confirmation humaine ;
- une seule reprise du **tour modèle** est permise après un résultat d’outil structuré, uniquement pour une erreur provider retryable ;
- l’exécution d’outil reste hors de la boucle de retry et n’est donc jamais répétée à cause de cette reprise ;
- les erreurs non retryables continuent de terminer le run en fail-closed ;
- les diagnostics internes restent dans l’audit serveur, tandis que le client reçoit une catégorie métier et un message FR/EN stable ;
- le snapshot utilisateur des étapes ne contient plus provider, modèle ou `reasonCode` interne.

## Sécurité et multi-tenant

Le hotfix ne modifie pas l’autorisation des outils. `authorizeAiTool()`, les contrôles module/entitlement/permission, le contexte d’organisation et les limites du Tool Gateway restent les barrières canoniques. Une reprise modèle réutilise exactement les mêmes outils déjà autorisés et le même tenant.

Aucune chaîne de pensée privée n’est persistée ou affichée. Les étapes visibles restent des métadonnées opérationnelles : analyse modèle, outil, validation humaine et reprise du service IA.

## Coût et performance

Le budget Agent n’est pas augmenté. La reprise est limitée à un seul nouvel essai modèle après un outil et ne rejoue aucun outil réussi. Aucun polling ou timer global supplémentaire n’est ajouté.

## Données / Prisma

Aucune modification de schéma Prisma et aucune migration. Les informations nécessaires à la reprise après confirmation sont récupérées depuis les données existantes `AiToolConfirmation`, `AiToolExecution` et `AiAgentStep`.

## QA

Le garde-fou `scripts/qa-hotfix-545-agent-post-tool-resilience.mjs` est intégré à `scripts/run-regression-qa-ci.mjs`. Il vérifie notamment le contrat :

`MODEL → TOOL success → MODEL retry borné → réponse ou autre tool`

et interdit la réintroduction d’un résultat d’outil déguisé en message utilisateur.

## Rollback

Revert applicatif de la PR #545 vers la baseline `main@bcb68bace81c583fc8e05279078feb33edee14f2`. Aucun rollback de données n’est nécessaire ; les runs et audits historiques restent conservés.
