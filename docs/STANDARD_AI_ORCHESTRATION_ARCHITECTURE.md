# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` résout le plan effectif côté serveur, applique d'abord `lib/ai/policy.ts`, puis classe les candidats éligibles avec la stratégie `POLICY_CAPABILITY_COST_HEALTH_V2`.

## Chaîne

Question → contexte serveur → classification de tâche → résolution du plan → classification des données/capacités → Policy Engine → candidats éligibles → health registry → scoring coût/capabilité/latence/préférence → candidats classés → provider adapter → événements normalisés DTSC → streaming applicatif → usage/coût → audit.

## Tâches

`GENERAL_CHAT`, `REASONING`, `SUMMARIZATION`, `DOCUMENT_ANALYSIS`, `EXTRACTION`, `STRUCTURED_GENERATION`, `CODE`, `TRANSLATION`, `ENTERPRISE_SEARCH`, `TOOL_EXECUTION`, `VISION`, `AUDIO`, `EMBEDDING`, `RERANKING`.

## Policy Engine Sprint 0

`lib/ai/policy.ts` est la couche éliminatoire de gouvernance modèle/provider. Chaque candidat doit satisfaire : contexte, locale, tâche, plan minimum, capacités requises, fenêtre de contexte, classification des données et compatibilité de policy modèle/provider.

Le plan effectif n'est pas une valeur de confiance client. L'orchestrateur le résout via les abonnements canoniques. Le contexte `DTSC_INTERNAL` conserve un niveau d'entitlement interne équivalent `ENTERPRISE`, sans devenir un passe-droit vers les données privées d'une entreprise cliente.

Tout provider est considéré externe par défaut. Un futur runtime local DTSC devra être explicitement revu et allow-listé avant de pouvoir être traité comme interne.

## Provider abstraction — Itération 1

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

Le contrat `AiProviderEvent` couvre `TEXT_DELTA`, `TOOL_CALL_DELTA`, `TOOL_CALL_COMPLETED`, `USAGE`, `COMPLETED` et `ERROR`.

Le parsing natif OpenAI Responses appartient à `lib/ai/providers/openai-responses.ts`. OpenRouter Chat Completions est normalisé par `lib/ai/providers/openrouter-chat-completions.ts`. Les routes métier ne connaissent aucun nom d'événement natif.

`AiProviderAttempt` trace chaque tentative technique, y compris les échecs avant fallback et les erreurs au milieu du stream, sans stocker le prompt complet.

## OpenRouter — Itération 2

OpenRouter reste un provider technique derrière l'orchestrateur DTSC :

- aucun catalogue distant n'est exposé au client ;
- seuls les modèles présents dans l'allow-list DTSC certifiée peuvent être candidats ;
- `allow_fallbacks: false` empêche un fallback provider caché ;
- `data_collection: "deny"` est appliqué par défaut ;
- ZDR, prix maximum et préférence de tri peuvent être ajoutés uniquement par les contraintes serveur DTSC ;
- les tool calls sont normalisés mais jamais exécutés directement par le provider adapter.

## Policy Router V2 — Itération 3

### 1. Éligibilité avant scoring

Le scoring ne peut jamais rendre un modèle interdit éligible. `listAvailableAiModels()` applique d'abord :

- contexte ;
- plan ;
- tâche ;
- capacités ;
- taille de contexte ;
- classification des données ;
- provider/model data policy ;
- présence du secret provider côté serveur.

### 2. Health registry

`lib/ai/health.ts` dérive un état runtime depuis la configuration et l'observabilité récente :

- `HEALTHY` ;
- `DEGRADED` ;
- `UNAVAILABLE` ;
- `DISABLED_BY_POLICY`.

Les données proviennent de `AiProviderAttempt` et de `AiModelCall.firstTokenLatencyMs`. Aucun tableau d'état manuel concurrent n'est créé.

### 3. Scoring déterministe

`lib/ai/routing-score.ts` calcule :

- `capabilityScore` ;
- `preferenceScore` ;
- `healthScore` ;
- `costScore` ;
- `latencyScore`.

Une préférence utilisateur autorisée donne un bonus ; elle ne contourne jamais policy/plan. Les profils `REASONING`, `TOOLS`, `FAST`, `BALANCED` et autres peuvent influencer la pertinence selon la tâche.

Le tri final est stable : score décroissant → coût croissant → latence croissante → code modèle lexical. Aucun ordre aléatoire n'est admis.

### 4. Contraintes de coût

`routingConstraints.maximumEstimatedInputCost` peut imposer un plafond strict. Lorsqu'un plafond est actif, un candidat au coût inconnu est exclu : DTSC ne prétend pas garantir un budget qu'il ne peut pas estimer.

Les coûts connus viennent du `costProfile` canonique du modèle et restent auditables dans `AiModelCall`.

### 5. Contraintes OpenRouter

Le Policy Router peut transmettre à l'adapter OpenRouter :

- `requireZeroDataRetention` → `provider.zdr=true` ;
- plafonds prompt/completion → `provider.max_price` ;
- préférence technique `price`, `latency` ou `throughput` → `provider.sort`.

Ces contraintes peuvent uniquement resserrer le routage technique. Elles ne peuvent jamais rendre un modèle ou une donnée autorisés si la policy DTSC les a refusés.

### 6. Explicabilité

`AiRouteSelection` conserve un score et des critères non sensibles. `AiModelCall.metadataJson` persiste la raison, le score, les critères et le modèle demandé, sans contenu de prompt.

## Données sensibles et fallbacks

- `SECRET` : jamais transmis à un provider externe.
- `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` : refus externe par défaut sauf policy serveur explicite.
- un fallback repasse toujours par l'éligibilité canonique ; il ne peut pas réduire la classification, contourner le plan ou utiliser un provider caché.

## Cohérence UI/runtime

`/api/models` utilise le même catalogue filtré par policy et plan effectif. Les profils/certifications exposés sont des métadonnées sûres uniquement pour les modèles réellement éligibles.

## Bypass providers

Les appels historiques qui contournent encore `lib/ai/*` sont versionnés dans `docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md`. Les embeddings restent une capacité séparée et seront abstraits dans RAG V2.

## État de validation

La pile DTSC AI reste isolée de `main` jusqu'à la clôture ERP Stabilisation 6/6 et la revalidation du dernier `main`. Les nouvelles QA sont raccordées à la suite IA existante, mais les Quality Gates exécutés restent nécessaires avant toute fusion ou maturité commerciale.
