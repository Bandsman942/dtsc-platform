# Intégration OpenRouter — DTSC AI Platform

## Objectif

OpenRouter est un provider technique supplémentaire derrière `lib/ai/*`. Il n'est jamais une autorité sur les plans SaaS, le tenant, les permissions, les classifications de données, les outils ou les fallbacks métier DTSC.

## Configuration serveur

Variables :

- `OPENROUTER_API_KEY` : secret serveur, jamais exposé au client ;
- `OPENROUTER_BASE_URL` : `https://openrouter.ai/api/v1` par défaut ;
- `OPENROUTER_HTTP_REFERER` : attribution optionnelle ;
- `OPENROUTER_APP_TITLE` : attribution optionnelle ;
- `AI_OPENROUTER_CERTIFIED_MODELS_JSON` : allow-list explicite des définitions de modèles certifiés DTSC ;
- `AI_OPENROUTER_CATALOG_AUDIT_STRICT` : rend l'indisponibilité de l'audit distant bloquante uniquement lorsqu'il vaut `true`.

Aucun modèle OpenRouter n'est actif par défaut. Sans clé serveur ou sans modèle certifié, OpenRouter n'offre aucun modèle utilisable.

## Architecture

```text
AiRouteRequest
  ↓
DTSC Policy Engine
  ↓
DTSC certified model catalog
  ↓
DTSC orchestrator
  ↓
OpenRouter adapter
  ↓
OpenRouter Chat Completions
  ↓
AiProviderEvent normalized stream
```

L'adapter `lib/ai/providers/openrouter-chat-completions.ts` passe par la même façade `createProviderEventStream()` et le même observateur `AiProviderAttempt` que l'adapter OpenAI Responses.

## Streaming

Le flux OpenRouter est converti vers le contrat interne :

- texte → `TEXT_DELTA` ;
- fragments d'outil → `TOOL_CALL_DELTA` ;
- outil reconstruit → `TOOL_CALL_COMPLETED` ;
- usage → `USAGE` ;
- fin `[DONE]` → `COMPLETED` ;
- erreur en cours de stream → `ERROR` avec reason code DTSC.

Les consumers métier ne lisent jamais directement les chunks OpenRouter. La cancellation propagée par AI01 ferme aussi le reader HTTP OpenRouter. Si le transport se ferme sans `[DONE]`, aucun faux `COMPLETED` n'est fabriqué : le consumer AI01 classe le flux `STREAM_INTERRUPTED`.

## Politique provider

Chaque requête OpenRouter envoie :

```json
{
  "provider": {
    "allow_fallbacks": false,
    "data_collection": "deny",
    "zdr": true
  }
}
```

- `allow_fallbacks: false` empêche un fallback invisible à l'intérieur d'OpenRouter ; tous les fallbacks restent décidés par `lib/ai/orchestrator.ts`, repassent par la policy et sont audités dans `AiProviderAttempt`.
- `data_collection: "deny"` exclut les routes provider qui collectent des données.
- `zdr: true` exige une route Zero Data Retention pour cette requête.

Ces contraintes ne remplacent pas le Policy Engine DTSC : elles ajoutent une barrière provider. `SECRET` reste interdit vers tout provider externe et les classifications sensibles externes restent refusées par défaut dans AI00.

## Modèles certifiés

`AI_OPENROUTER_CERTIFIED_MODELS_JSON` contient uniquement des `AiModelDefinition` explicitement approuvées. Chaque définition doit déclarer au minimum :

- un `code` DTSC stable ;
- `providerCode: "OPENROUTER"` ;
- le `providerModelId` exact ;
- une `certificationVersion` non vide ;
- capacités vérifiées ;
- `profileCodes` éventuels parmi `FAST`, `BALANCED`, `REASONING`, `LONG_CONTEXT`, `TOOLS`, `VISION`, `PREMIUM` ;
- contexte et tâches autorisés ;
- plan minimum ;
- politique de données ;
- fallbacks DTSC explicites.

Le catalogue générique `AI_MODEL_CATALOG_JSON` ne peut pas injecter un modèle OpenRouter. Une définition OpenRouter certifiée ne peut pas non plus écraser le code stable d'un modèle DTSC existant.

## `/api/models`

La route retourne seulement les modèles déjà filtrés par le catalogue canonique, le plan effectif, le contexte, la clé provider disponible et la policy. Elle peut exposer des métadonnées non sensibles de certification (`profileCodes`, `certificationVersion`) mais ne lit jamais la clé OpenRouter, l'allow-list brute ou le catalogue distant.

## Audit du catalogue distant

`scripts/ai/audit-openrouter-catalog.mjs` compare en lecture seule les modèles certifiés au catalogue OpenRouter filtré `GET /models?zdr=true`.

Il vérifie :

- présence du `providerModelId` ;
- fenêtre de contexte annoncée ;
- support `tools` lorsque cette capacité est certifiée ;
- support structured output lorsque cette capacité est certifiée.

Comportement :

- aucun modèle certifié → skip ;
- modèle/capacité incompatible → échec ;
- indisponibilité réseau → warning en mode normal ;
- `AI_OPENROUTER_CATALOG_AUDIT_STRICT=true` → indisponibilité réseau bloquante.

Le script ne modifie jamais automatiquement le catalogue DTSC.

## Fallback et rollback

OpenAI direct reste disponible selon son propre catalogue et sa policy. Un modèle OpenRouter peut déclarer un fallback DTSC compatible ; l'orchestrateur ne tente que les candidats déjà passés par `listAvailableAiModels()`.

Rollback OpenRouter : retirer la clé ou vider l'allow-list certifiée. Aucune migration destructive n'est nécessaire et OpenAI direct reste le chemin compatible lorsqu'il est configuré et autorisé.

## Limites de AI02

- pas de marketplace de modèles ;
- pas d'activation automatique depuis `/models` ;
- pas de choix arbitraire de provider par le client ;
- pas encore d'exécution model-driven des tool calls ;
- pas de MCP ;
- pas de changement du provider d'embeddings ;
- le scoring coût/latence/santé relève de AI03.
