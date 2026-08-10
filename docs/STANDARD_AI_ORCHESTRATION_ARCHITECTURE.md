# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` résout d'abord le plan effectif côté serveur, puis sélectionne une liste ordonnée de candidats qui ont déjà passé `lib/ai/policy.ts`.

## Chaîne

Question → contexte serveur → classification de tâche → résolution du plan → classification des données/capacités → Policy Engine → candidats autorisés → tentative fournisseur → fallback retryable → streaming → usage/coût → audit.

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

## Données sensibles

- `SECRET` : jamais transmis à un provider externe.
- `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` : refus externe par défaut dans Sprint 0, sauf décision explicite de policy résolue côté serveur.
- Un fallback doit repasser par la même policy et ne peut pas réduire le niveau de confidentialité.

## Fallback

Le fallback ne peut pas affaiblir la politique de données, changer de tenant, exécuter deux fois un outil, dépasser le plan ou perdre une contrainte structurée. Seules les erreurs provider retryables progressent vers le candidat suivant. Les tentatives sont exposées au contrat d'observabilité sans journaliser le prompt complet.

## Cohérence UI/runtime

`/api/models` utilise le même catalogue filtré par policy et le plan effectif. Un modèle affiché doit donc être réellement éligible au runtime dans le même contexte. Cette propriété est protégée par les QA Sprint 0.

## Bypass providers

Les appels historiques qui contournent encore `lib/ai/*` sont versionnés dans `docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md`. Ils ne doivent pas être oubliés lors de l'introduction de nouveaux providers. Les embeddings restent une capacité séparée et seront abstraits dans RAG V2.

## Limite actuelle

Le protocole fournisseur livré à ce stade reste `OPENAI_RESPONSES`. OpenRouter n'est pas activé dans Sprint 0. L'Itération 1 doit d'abord découpler le streaming et les consumers métier des événements natifs OpenAI avant toute activation multi-provider.
