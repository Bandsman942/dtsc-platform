# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` résout le plan effectif côté serveur, applique d'abord `lib/ai/policy.ts`, puis classe uniquement les candidats éligibles avec la stratégie `POLICY_CAPABILITY_COST_HEALTH_V2`.

## Chaîne

Question → contexte serveur → classification de tâche → résolution du plan → classification des données/capacités → Policy Engine → candidats éligibles → health registry → scoring capacité/coût/latence/préférence → candidats classés → provider adapter → événements normalisés DTSC → streaming applicatif → usage/coût → audit.

En mode Agent AI08, cette chaîne reste l’autorité modèle/provider et est réutilisée à chaque tour modèle. Le runtime agentique ne possède pas de routeur parallèle.

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

AI08 réutilise ces mêmes événements normalisés pour recevoir des structured tool calls. Le runtime ne lit pas directement un format natif OpenAI/OpenRouter.

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

AI08 ne modifie pas ces règles. Un run agent peut appeler plusieurs fois `routeAiStream()` au fil de ses étapes, mais chaque appel repart de la policy et des plafonds applicables au run. Un provider/model précédent ne devient jamais une permission pour le tour suivant.

## Cohérence UI/runtime

`/api/models` utilise le même catalogue filtré par policy et plan effectif. Les profils et certifications exposés sont des métadonnées sûres uniquement pour des modèles réellement éligibles. AI03 ne crée pas de catalogue client parallèle.

Le panneau Agent AI08 n’offre aucun sélecteur capable de dépasser ces politiques. Il affiche l’état du run, les outils, les limites, tokens et coûts issus de l’état serveur sûr.

## Bypass providers

Les appels historiques qui contournent encore `lib/ai/*` sont versionnés dans `docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md`. Les embeddings sont abstraits par la couche RAG V2 et ne deviennent pas un moteur de génération parallèle.

## Tool Gateway — AI06

AI06 sépare le raisonnement modèle de l’autorité d’exécution. Un provider ou sélecteur déterministe peut proposer un code outil et des arguments, mais seul le DTSC Tool Gateway peut l’autoriser et l’exécuter.

La chaîne d’exécution est :

`tool proposal → AI_TOOL_REGISTRY → Zod input validation → authorizeAiTool() → confirmation policy → idempotency claim → explicit executor → Zod output validation → audit/result`.

Pharmacy conserve temporairement un sélecteur par mots-clés comme fallback documenté. Il n’a aucune autorité : chaque code sélectionné repasse par le même Gateway.

Les mutations sont confirmées structurellement via `AiToolConfirmation`; le texte libre `oui/yes/ok` n’est jamais une preuve de consentement. `AiToolExecution` possède l’identité transversale et l’idempotence d’exécution.

## MCP Gateway — AI07

AI07 projette uniquement des bindings MCP explicitement certifiés dans `AI_TOOL_REGISTRY`. Discovery, ressource ou prompt distant ne devient jamais une permission ni une instruction système.

MCP reste READ-only dans cette baseline et tout appel distant repasse par tenant, permission, plan, data policy, vérification de schéma et Tool Gateway. `SECRET` n’est jamais envoyé.

## Agent Runtime — AI08

AI08 ajoute `lib/ai/agent/*` au-dessus des autorités précédentes :

```text
messages/contexte canonique
  -> budget serveur Agent
  -> outils pré-autorisés
  -> routeAiStream()
  -> texte final OU tool proposal
  -> executeAiTool()
  -> résultat non fiable
  -> routeAiStream()
  -> ... jusqu’à réponse finale ou limite
```

Règles opposables :

- `maxSteps`, `maxToolCalls`, `maxTokens`, `maxEstimatedCost`, `maxDurationMs` sont des plafonds serveur ;
- le client peut seulement demander plus restrictif ;
- le modèle n’exécute jamais lui-même un outil ;
- une mutation suspend le run si confirmation requise ;
- la confirmation réussie produit un `AiToolExecution` canonique puis `READY_TO_RESUME` ;
- la reprise recharge ce résultat côté serveur et continue le même `runId` ;
- un refus ferme la proposition et le run suspendu ;
- cancellation provider/run est supportée ;
- aucun retry aveugle d’outil n’est introduit ;
- `SENSITIVE_MUTATE` n’est pas exposé ;
- aucune chaîne de pensée privée n’est persistée ou affichée.

Le mode Agent est opt-in dans le shell immersif du Chatbot global et de l’Assistant Entreprise. Les routes historiques restent indépendantes, ce qui rend le rollback applicatif possible sans changer la mémoire conversationnelle existante.

## État de validation

AI00→AI08 constituent désormais une chaîne de gouvernance unique : policy → provider abstraction → routing → context/CAG/RAG → Tool Gateway → MCP certifié → Agent Runtime borné.

Les Quality Gates AI08 couvrent runtime, budgets, confirmation, reprise, UX FR/EN/mobile, idempotence, cancellation, tenant isolation, domaines sensibles et confidentialité. La maturité `COMMERCIAL_READY` reste néanmoins conditionnée à des E2E propriétaire exécutés sur le SHA `main` réellement déployé en Production.
