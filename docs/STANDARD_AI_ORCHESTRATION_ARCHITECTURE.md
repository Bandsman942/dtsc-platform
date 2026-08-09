# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` résout d'abord le plan effectif côté serveur, puis sélectionne une liste ordonnée de candidats qui ont déjà passé `lib/ai/policy.ts`.

## Chaîne

Question → contexte serveur → classification de tâche → résolution du plan → classification des données/capacités → Policy Engine → candidats autorisés → provider adapter → événements normalisés DTSC → streaming applicatif → usage/coût → audit.

## Tâches

`GENERAL_CHAT`, `REASONING`, `SUMMARIZATION`, `DOCUMENT_ANALYSIS`, `EXTRACTION`, `STRUCTURED_GENERATION`, `CODE`, `TRANSLATION`, `ENTERPRISE_SEARCH`, `TOOL_EXECUTION`, `VISION`, `AUDIO`, `EMBEDDING`, `RERANKING`.

## Policy Engine Sprint 0

`lib/ai/policy.ts` est la première couche exécutable de gouvernance modèle/provider. Chaque candidat doit satisfaire : contexte, locale, tâche, plan minimum, capacités requises, fenêtre de contexte, classification des données et compatibilité de policy modèle/provider.

Le plan effectif n'est pas une valeur de confiance client. L'orchestrateur le résout via les abonnements canoniques. Le contexte `DTSC_INTERNAL` conserve un niveau d'entitlement interne équivalent `ENTERPRISE`, sans devenir un passe-droit vers les données privées d'une entreprise cliente.

Une préférence modèle utilisateur est un signal borné : si le modèle demandé existe mais n'est pas autorisé par le plan ou la policy, la requête est refusée avec une erreur stable au lieu d'un downgrade silencieux.

## Provider abstraction — Itération 1

Le runtime métier ne consomme plus directement les événements natifs OpenAI Responses.

Architecture :

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

Le contrat `AiProviderEvent` est défini dans `lib/ai/provider-events.ts` et couvre :

- `TEXT_DELTA` ;
- `TOOL_CALL_DELTA` ;
- `TOOL_CALL_COMPLETED` ;
- `USAGE` ;
- `COMPLETED` ;
- `ERROR`.

Le parsing des événements `response.output_text.delta` et `response.completed` appartient exclusivement à `lib/ai/providers/openai-responses.ts`. Les routes de chat et `lib/ai/stream.ts` ne doivent jamais dépendre de ces noms natifs.

`lib/ai/provider.ts` sert de façade d'adapters. Le protocole du catalogue prépare désormais `OPENAI_RESPONSES`, `OPENAI_CHAT_COMPLETIONS` et `OPENROUTER_CHAT_COMPLETIONS`, mais seul l'adapter OpenAI Responses est actif à ce stade. Un protocole déclaré sans adapter actif échoue explicitement ; il n'est jamais routé silencieusement.

## Données sensibles

- `SECRET` : jamais transmis à un provider externe.
- `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` : refus externe par défaut dans Sprint 0, sauf décision explicite de policy résolue côté serveur.
- Un fallback doit repasser par la même policy et ne peut pas réduire le niveau de confidentialité.

## Fallback

Le fallback ne peut pas affaiblir la politique de données, changer de tenant, exécuter deux fois un outil, dépasser le plan ou perdre une contrainte structurée. Seules les erreurs provider retryables progressent vers le candidat suivant. Les tentatives sont exposées au contrat d'observabilité sans journaliser le prompt complet.

## Cohérence UI/runtime

`/api/models` utilise le même catalogue filtré par policy et le plan effectif. Un modèle affiché doit donc être réellement éligible au runtime dans le même contexte.

## Bypass providers

Les appels historiques qui contournent encore `lib/ai/*` sont versionnés dans `docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md`. Les embeddings restent une capacité séparée et seront abstraits dans RAG V2.

## État actuel

Sprint 0 et le premier lot de l'Itération 1 vivent sur des branches isolées du programme AI. OpenRouter n'est pas encore activé. La prochaine étape de l'Itération 1 consiste à durcir cancellation, erreurs, tool-call normalization et observabilité des tentatives avant de commencer l'Itération 2.
