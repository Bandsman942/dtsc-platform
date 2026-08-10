# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` résout le plan effectif côté serveur, applique d'abord `lib/ai/policy.ts`, puis classe uniquement les candidats éligibles avec la stratégie `POLICY_CAPABILITY_COST_HEALTH_V2`.

## Chaîne

Question → contexte serveur → classification de tâche → résolution du plan → classification des données/capacités → Policy Engine → candidats éligibles → health registry → scoring capacité/coût/latence/préférence → candidats classés → provider adapter → événements normalisés DTSC → streaming applicatif → usage/coût → audit.

## Tâches

`GENERAL_CHAT`, `REASONING`, `SUMMARIZATION`, `DOCUMENT_ANALYSIS`, `EXTRACTION`, `STRUCTURED_GENERATION`, `CODE`, `TRANSLATION`, `ENTERPRISE_SEARCH`, `TOOL_EXECUTION`, `VISION`, `AUDIO`, `EMBEDDING`, `RERANKING`.

## Policy Engine AI00

`lib/ai/policy.ts` est la couche éliminatoire de gouvernance modèle/provider. Chaque candidat doit satisfaire :

- contexte autorisé ;
- locale autorisée ;
- type de tâche ;
- plan minimum ;
- capacités requises ;
- fenêtre de contexte ;
- classification des données ;
- compatibilité de la policy modèle/provider.

Le plan effectif n'est pas une valeur de confiance client. L'orchestrateur le résout via les abonnements canoniques. Le contexte `DTSC_INTERNAL` conserve un niveau d'entitlement interne équivalent `ENTERPRISE`, sans devenir un passe-droit vers les données privées d'une entreprise cliente.

Une préférence modèle utilisateur est un signal borné. Un modèle explicitement demandé mais interdit par le plan ou la policy est refusé avant scoring. Le scoring ne peut jamais rendre éligible un candidat éliminé par AI00.

## Provider abstraction — AI01

Le runtime métier ne consomme plus directement les événements natifs des providers.

```text
Provider API
  ↓
Provider Adapter
  ↓
AiProviderEvent
  ↓
createAuditedAiTextStream()
  ↓
HTTP text stream / persistence / usage / audit
```

Le contrat `AiProviderEvent` vit dans `lib/ai/provider-events.ts` et couvre `TEXT_DELTA`, `TOOL_CALL_DELTA`, `TOOL_CALL_COMPLETED`, `USAGE`, `COMPLETED` et `ERROR`.

Le parsing de `response.output_text.delta`, `response.function_call_arguments.*` et `response.completed` appartient exclusivement à `lib/ai/providers/openai-responses.ts`. OpenRouter Chat Completions est normalisé par `lib/ai/providers/openrouter-chat-completions.ts`. Les routes métier ne dépendent d'aucun nom d'événement natif.

`lib/ai/provider.ts` reste une façade d'adapters. La cancellation du consumer est propagée jusqu'au reader HTTP natif. Un transport qui se termine sans événement `COMPLETED` est classé `STREAM_INTERRUPTED` au lieu d'être compté comme succès.

## OpenRouter — AI02

OpenRouter reste un provider technique derrière l'orchestrateur DTSC :

- aucun catalogue distant n'est exposé au client ;
- seuls les modèles présents dans l'allow-list DTSC certifiée peuvent devenir candidats ;
- `allow_fallbacks: false` empêche un fallback provider caché ;
- `data_collection: "deny"` est imposé ;
- `zdr: true` reste une exigence permanente de la baseline AI02 ;
- les tool calls sont normalisés mais jamais exécutés directement par le provider adapter.

## Policy Router V2 — AI03

### 1. Éligibilité avant scoring

`listAvailableAiModels()` continue d'appliquer les barrières AI00 avant toute mesure de santé ou de coût : contexte, plan, tâche, capacités, fenêtre de contexte, classification, data policy et présence du secret provider. Health et coût sont des signaux de classement, jamais des permissions.

### 2. Health registry dérivé

`lib/ai/health.ts` calcule un état runtime depuis les sources existantes, sans nouvelle table concurrente :

- `HEALTHY` ;
- `DEGRADED` ;
- `UNAVAILABLE` ;
- `DISABLED_BY_POLICY`.

Les tentatives récentes proviennent de `AiProviderAttempt`. La latence observée provient de `AiModelCall.firstTokenLatencyMs`. Une configuration `DISABLED`/`RETIRED` reste éliminatoire. Plusieurs échecs récents peuvent rendre le candidat `UNAVAILABLE` ou `DEGRADED`.

Si la lecture de télémétrie échoue temporairement, le health registry renvoie un état explicite `OBSERVABILITY_UNAVAILABLE` comme raison et cesse d'utiliser la télémétrie comme signal. Il ne crée aucun droit : AI00, la configuration provider et les entitlements restent pleinement opposables.

### 3. Scoring déterministe

`lib/ai/routing-score.ts` produit un score explicable composé de :

- `capabilityScore` ;
- `preferenceScore` ;
- `healthScore` ;
- `costScore` ;
- `latencyScore` ;
- `fallbackPenalty`.

Les profils certifiés `FAST`, `BALANCED`, `REASONING`, `LONG_CONTEXT`, `TOOLS`, `VISION` et `PREMIUM` peuvent influencer la pertinence selon la tâche. La préférence utilisateur autorisée donne un bonus mais ne contourne jamais plan/policy. Lorsqu'un modèle demandé est remplacé par un autre candidat autorisé, une pénalité de fallback explicite est appliquée.

Le tri final est stable : score décroissant → coût estimé croissant → latence TTFT croissante → code modèle lexical. Aucun ordre aléatoire n'est admis.

### 4. Contraintes de coût

`routingConstraints.maximumEstimatedInputCost` impose un plafond strict sur le coût d'entrée estimé. Lorsqu'un plafond existe :

- un candidat dont le coût estimé dépasse le plafond est exclu ;
- un candidat au coût inconnu est exclu, car DTSC ne prétend pas garantir un budget qu'il ne peut pas estimer.

Les coûts connus proviennent du `costProfile` canonique du modèle et de `estimateAiCost()`.

### 5. Contraintes techniques OpenRouter

AI03 peut resserrer le provider routing OpenRouter avec :

- `provider.sort` : `price`, `latency` ou `throughput` ;
- `provider.max_price.prompt` ;
- `provider.max_price.completion` ;
- `requireZeroDataRetention` qui réaffirme `zdr=true`.

Ces options ne peuvent jamais assouplir AI02 : `allow_fallbacks:false`, `data_collection:"deny"` et `zdr:true` restent systématiquement présents. Les plafonds OpenRouter sont exprimés en USD par million de tokens conformément au contrat provider utilisé par l'adapter.

### 6. Explicabilité et observabilité

`AiRouteSelection` conserve `selectionReason`, `selectionScore` et `selectionCriteria`. `AiModelCall.metadataJson` persiste uniquement ces métadonnées de décision non sensibles avec le modèle demandé et les tentatives ; aucun prompt complet, message, secret ou document privé n'est ajouté pour expliquer le routage.

`AiProviderAttempt` continue de tracer les tentatives techniques. `AiModelCall` reste l'unité applicative de consommation, coût et facturation ; AI03 ne crée aucune seconde source de vérité.

## Données sensibles et fallbacks

- `SECRET` : jamais transmis à un provider externe.
- `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` : refus externe par défaut tant qu'une policy serveur explicite ne l'autorise pas.
- `routeAiStream()` force encore `allowSensitiveExternalModel: false` dans la baseline actuelle.
- un fallback repasse toujours par l'éligibilité canonique et ne peut pas réduire la classification, contourner le plan ou utiliser un provider caché.
- seules les erreurs provider retryables survenues avant remise du stream au consumer progressent vers le candidat suivant ; aucune réponse partielle ne déclenche un second stream.

## Cohérence UI/runtime

`/api/models` utilise le même catalogue filtré par policy et plan effectif. Les profils et certifications exposés sont des métadonnées sûres uniquement pour des modèles réellement éligibles. AI03 ne crée pas de catalogue client parallèle.

## Bypass providers

Les appels historiques qui contournent encore `lib/ai/*` sont versionnés dans `docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md`. Les embeddings restent une capacité séparée et seront abstraits dans RAG V2.

## État de validation

AI00, AI01 et AI02 constituent la baseline Production : Policy Engine, provider facade, flux normalisé, observabilité des tentatives et OpenRouter certifié. AI03 ajoute le classement déterministe et explicable sans migration Prisma. Les Quality Gates AI03 doivent rester verts avant toute fusion vers `main`.

## Tool Gateway — AI06

AI06 separates model reasoning from execution authority. A provider or deterministic selector may propose a tool code and arguments, but only the DTSC Tool Gateway can authorize and execute it.

The execution chain is:

`tool proposal → AI_TOOL_REGISTRY → Zod input validation → authorizeAiTool() → confirmation policy → idempotency claim → explicit executor → Zod output validation → audit/result`.

Pharmacy currently keeps a deterministic keyword selector as a documented transitional fallback. It has no authority: every selected code still crosses the same Gateway. Structured provider tool calls can replace selection later without changing the authorization/execution boundary.

Mutations are structurally confirmed through `AiToolConfirmation`; free-form text such as `oui/yes/ok` is never proof of consent. `AiToolExecution` owns transversal execution identity and idempotency. AI06 does not certify payment, accounting or clinical mutations, and MCP remains reserved for AI07.
