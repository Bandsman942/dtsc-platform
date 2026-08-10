# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` résout d'abord le plan effectif côté serveur, puis sélectionne une liste ordonnée de candidats qui ont déjà passé `lib/ai/policy.ts`.

## Chaîne

Question → contexte serveur → classification de tâche → résolution du plan → classification des données/capacités → Policy Engine → candidats autorisés → provider adapter → événements normalisés DTSC → streaming applicatif → usage/coût → audit.

## Tâches

`GENERAL_CHAT`, `REASONING`, `SUMMARIZATION`, `DOCUMENT_ANALYSIS`, `EXTRACTION`, `STRUCTURED_GENERATION`, `CODE`, `TRANSLATION`, `ENTERPRISE_SEARCH`, `TOOL_EXECUTION`, `VISION`, `AUDIO`, `EMBEDDING`, `RERANKING`.

## Policy Engine Sprint 0

`lib/ai/policy.ts` est la première couche exécutable de gouvernance modèle/provider. Chaque candidat doit satisfaire :

- contexte autorisé ;
- locale autorisée ;
- type de tâche ;
- plan minimum ;
- capacités requises ;
- fenêtre de contexte ;
- classification des données ;
- compatibilité de la policy modèle/provider.

Le plan effectif n'est pas une valeur de confiance client. L'orchestrateur le résout via les abonnements canoniques. Le contexte `DTSC_INTERNAL` conserve un niveau d'entitlement interne équivalent `ENTERPRISE`, sans devenir un passe-droit vers les données privées d'une entreprise cliente.

Une préférence modèle utilisateur est un signal borné : si le modèle demandé existe mais n'est pas autorisé par le plan ou la policy, la requête est refusée avec une erreur stable au lieu d'un downgrade silencieux.

## Provider abstraction — AI01

Le runtime métier ne consomme plus directement les événements natifs OpenAI Responses.

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

Le parsing de `response.output_text.delta`, `response.function_call_arguments.*` et `response.completed` appartient exclusivement à `lib/ai/providers/openai-responses.ts`. Les routes de chat et `lib/ai/stream.ts` ne dépendent plus de ces noms natifs.

`lib/ai/provider.ts` est une façade d'adapters. Le type de protocole prépare `OPENAI_RESPONSES`, `OPENAI_CHAT_COMPLETIONS` et `OPENROUTER_CHAT_COMPLETIONS`, mais AI01 n'active que l'adapter OpenAI Responses. Tout protocole sans adapter exécutable échoue explicitement ; aucun provider n'est activé par simple présence dans un JSON de configuration.

La cancellation du consumer est propagée jusqu'au reader HTTP natif. Un transport qui se termine sans événement `COMPLETED` est classé `STREAM_INTERRUPTED` au lieu d'être compté comme succès.

## Données sensibles

- `SECRET` : jamais transmis à un provider externe.
- `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` : refus externe par défaut tant qu'une décision explicite de policy résolue côté serveur ne l'autorise pas.
- Un fallback doit repasser par la même policy et ne peut pas réduire le niveau de confidentialité.

## Fallback

Le fallback ne peut pas affaiblir la politique de données, changer de tenant, exécuter deux fois un outil, dépasser le plan ou perdre une contrainte structurée. Seules les erreurs provider retryables survenues avant remise du stream au consumer progressent vers le candidat suivant. Les erreurs survenues après début du streaming sont auditées comme état terminal du provider courant et ne déclenchent pas de second stream susceptible de dupliquer une réponse partielle.

## Observabilité des tentatives

`AiModelCall` reste la trace de l'appel IA consommé par l'application. `AiProviderAttempt` trace séparément chaque tentative provider/modèle d'une même décision de routage, avec un `routeRequestId`, un index, un statut, un reason code et une durée, sans prompt ni contenu de message.

La tentative n'est pas marquée `SUCCESS` à l'ouverture HTTP : `observeAiProviderAttemptStream()` la clôture seulement à la réception de `COMPLETED`. Une fin de transport prématurée devient `FAILED/STREAM_INTERRUPTED` et une cancellation devient `CANCELLED`.

## Cohérence UI/runtime

`/api/models` utilise le même catalogue filtré par policy et le plan effectif. Un modèle affiché doit donc être réellement éligible au runtime dans le même contexte.

## Bypass providers

Les appels historiques qui contournent encore `lib/ai/*` sont versionnés dans `docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md`. Les embeddings restent une capacité séparée et seront abstraits dans RAG V2.

## État actuel

AI00 et AI01 constituent la baseline du futur multi-provider : Policy Engine opposable, provider facade, flux normalisé, cancellation propagée et observabilité par tentative. OpenRouter reste désactivé jusqu'à AI02 et devra passer par cette abstraction, les plans et la policy DTSC sans voie parallèle.
