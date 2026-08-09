# Intégration OpenRouter — DTSC AI Platform

## Objectif

OpenRouter est un provider technique supplémentaire derrière `lib/ai/*`. Il n'est jamais une autorité sur les plans SaaS, le tenant, les permissions, les classifications de données, les outils ou les fallbacks métier DTSC.

## Configuration serveur

Variables :

- `OPENROUTER_API_KEY` : secret serveur, jamais exposé au client ;
- `OPENROUTER_BASE_URL` : `https://openrouter.ai/api/v1` par défaut ;
- `OPENROUTER_HTTP_REFERER` : attribution optionnelle ;
- `OPENROUTER_APP_TITLE` : attribution optionnelle ;
- `AI_OPENROUTER_CERTIFIED_MODELS_JSON` : allow-list explicite des définitions de modèles certifiés DTSC.

Aucun modèle OpenRouter n'est actif par défaut. Sans clé ou sans modèle certifié, le provider n'offre aucun modèle utilisable.

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

L'adapter est `lib/ai/providers/openrouter-chat-completions.ts`. Il utilise la façade `createProviderEventStream()` comme OpenAI Responses.

## Streaming

Le flux OpenRouter est converti vers le contrat interne :

- texte → `TEXT_DELTA` ;
- fragments d'outil → `TOOL_CALL_DELTA` ;
- outil reconstruit → `TOOL_CALL_COMPLETED` ;
- usage → `USAGE` ;
- fin → `COMPLETED` ;
- erreur en cours de stream → `ERROR` avec reason code DTSC.

Les consumers métier ne lisent jamais directement les chunks OpenRouter.

## Politique provider

L'adapter envoie par défaut :

```json
{
  "provider": {
    "allow_fallbacks": false,
    "data_collection": "deny"
  }
}
```

`allow_fallbacks: false` est volontaire : les fallbacks doivent rester dans `lib/ai/orchestrator.ts` pour repasser par la policy, être observables et ne jamais réduire la confidentialité.

`data_collection: "deny"` constitue la base minimale de confidentialité côté routage OpenRouter. Une policy future pourra ajouter ZDR ou une allow-list de providers lorsque le Policy Router V2 sera livré, sans jamais élargir les droits DTSC.

## Modèles certifiés

`AI_OPENROUTER_CERTIFIED_MODELS_JSON` contient uniquement des `AiModelDefinition` explicitement approuvées. Chaque définition doit notamment déclarer :

- un `code` DTSC stable ;
- `providerCode: "OPENROUTER"` ;
- le `providerModelId` exact ;
- capacités vérifiées ;
- `profileCodes` parmi `FAST`, `BALANCED`, `REASONING`, `LONG_CONTEXT`, `TOOLS`, `VISION`, `PREMIUM` ;
- contexte et tâches autorisés ;
- plan minimum ;
- politique de données (`OPENROUTER_CONTROLLED` ou `INHERIT_PROVIDER`) ;
- fallbacks DTSC explicites ;
- version/date de certification lorsque disponibles.

Le catalogue générique `AI_MODEL_CATALOG_JSON` n'est pas autorisé à injecter un modèle OpenRouter. Cette séparation évite qu'une simple configuration générique contourne la certification.

## Audit du catalogue distant

`scripts/ai/audit-openrouter-catalog.mjs` compare en lecture seule les `providerModelId` certifiés au catalogue distant OpenRouter.

Comportement :

- aucun modèle certifié → skip ;
- modèle disparu → échec ;
- fenêtre de contexte distante inférieure à la certification → échec ;
- indisponibilité réseau → warning en mode normal ;
- `AI_OPENROUTER_CATALOG_AUDIT_STRICT=true` → indisponibilité réseau devient bloquante.

Le script ne modifie jamais automatiquement le catalogue DTSC.

## Fallback et rollback

OpenAI direct reste disponible selon son propre catalogue et sa policy. Un modèle OpenRouter peut déclarer un fallback OpenAI certifié/autorisé, mais l'orchestrateur recalcule l'éligibilité avant toute tentative.

Rollback OpenRouter : retirer/désactiver la clé ou vider l'allow-list certifiée. Aucune migration destructive n'est nécessaire et OpenAI direct reste le chemin compatible lorsqu'il est configuré et autorisé.

## Limites de cette itération

- pas de marketplace de modèles ;
- pas d'activation automatique depuis `/models` ;
- pas de choix arbitraire de provider par le client ;
- pas d'exécution de tool call ;
- pas de MCP ;
- pas de changement du provider d'embeddings ;
- les données sensibles externes restent refusées par défaut par le Policy Engine Sprint 0.
