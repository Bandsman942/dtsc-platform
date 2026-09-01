# 2026-09-01 — Hotfix #547 : continuation OpenAI Responses après multi-tool reasoning

## Contexte

Après le hotfix #545, un run Agent Enterprise en Production a exécuté avec succès cinq lectures Finance dans un même tour modèle (`FINANCE_TREASURY_READ`, `FINANCE_BANK_READ`, `FINANCE_PAYMENTS_READ`, `FINANCE_RECONCILIATION_READ`, `FINANCE_OVERVIEW_READ`), puis a échoué au tour modèle suivant avec une catégorie client `REQUEST_INVALID` alors que le budget restait disponible.

La cause est la perte du state de continuation propre à l'API OpenAI Responses pour les modèles de raisonnement. Le runtime conservait les `function_call` et `function_call_output`, mais supprimait les items `reasoning` du `response.output`. Avec `store:false` et un contexte géré manuellement, le tour suivant pouvait donc être rejeté par le provider.

## Correction

- les modèles OpenAI Responses déclarés `reasoning` demandent désormais `reasoning.encrypted_content` via `include` ;
- le stream capture uniquement l'item reasoning opaque/chiffré et les métadonnées structurées des `function_call` nécessaires à la continuation ;
- le state est borné en nombre d'items et en taille avant d'être accepté ;
- le runtime vérifie que tous les `call_id` du tour modèle correspondent exactement aux function calls du state opaque avant d'autoriser l'exécution d'un outil ;
- l'ordre `response.output` utile est conservé par `output_index` ;
- au tour suivant, les items reasoning/function_call sont réinjectés avant les `function_call_output` correspondants ;
- OpenRouter/Chat Completions continue d'utiliser son contrat `assistant.tool_calls → role:tool` et ne reçoit aucun state OpenAI Responses ;
- un lot de plusieurs tool calls contenant une action nécessitant confirmation est refusé avant toute exécution afin d'éviter un état partiellement repris ;
- pour une confirmation isolée, le state opaque est récupéré depuis les métadonnées serveur déjà existantes du step MODEL puis réinjecté à la reprise, sans migration Prisma ;
- les HTTP 400/422 du provider produits par le payload DTSC ne sont plus automatiquement présentés comme une demande utilisateur invalide ; ils deviennent une panne de protocole interne côté client ;
- le détail provider conservé côté serveur est limité à un fingerprint borné (type/code), jamais au body brut.

## Confidentialité et chain-of-thought

Le hotfix ne stocke et n'expose aucun raisonnement lisible :

- aucun `reasoning_text` ;
- aucun `summary_text` ;
- aucun contenu de chaîne de pensée ;
- uniquement `encrypted_content` opaque fourni par OpenAI, limité en taille et réservé au backend ;
- les snapshots/API Agent côté client n'exposent pas `metadataJson` ni `providerContinuation`.

`store:false` reste actif côté OpenAI.

## Sécurité / RBAC / multi-tenant

Aucun changement de permission, membership, entitlement, module Finance, autorisation de tool ou isolation tenant. Les résultats Finance restent bornés et considérés comme données non fiables par le modèle.

## Coût et performance

- budgets Agent inchangés ;
- aucun polling/timer ajouté ;
- aucun replay automatique d'un outil réussi ;
- transport additionnel limité au state opaque exigé par le provider ;
- bornes : 24 items maximum, 256 000 caractères maximum par reasoning chiffré, 512 000 caractères maximum pour l'ensemble du state de continuation.

## Prisma / migrations

Aucun changement de schéma et aucune migration. La reprise après confirmation réutilise `AiAgentStep.metadataJson`, qui n'est pas exposé dans les snapshots client.

## QA permanente

`scripts/qa-hotfix-547-responses-reasoning-continuation.mjs` verrouille notamment :

- `reasoning.encrypted_content` + `store:false` ;
- absence de capture de reasoning texte/summary ;
- ordre et identité des call ids ;
- state opaque borné ;
- scénario structurel 5 lectures Finance → second tour modèle ;
- fail-closed avant exécution si state reasoning incomplet ;
- confirmation isolée avec reprise du state opaque ;
- absence de contamination OpenRouter ;
- absence de fuite du state dans l'API client ;
- classification client sûre des erreurs de protocole.

Le script est intégré à la regression QA canonique.

## Rollback

Revert applicatif de la PR #547 vers `main@c92dc396c689056bb2b60022dadd1f5d08454bc1`. Aucun rollback de données n'est requis.
