# Architecture d’orchestration IA

`lib/ai/classifier.ts` classe la tâche. `lib/ai/orchestrator.ts` sélectionne une liste ordonnée de candidats selon capacités, contexte, langue, disponibilité, politique et préférence autorisée.

## Chaîne

Question → contexte et langue → classification → candidats autorisés → tentative fournisseur → fallback retryable → streaming → usage/coût → audit.

## Tâches

`GENERAL_CHAT`, `REASONING`, `SUMMARIZATION`, `DOCUMENT_ANALYSIS`, `EXTRACTION`, `STRUCTURED_GENERATION`, `CODE`, `TRANSLATION`, `ENTERPRISE_SEARCH`, `TOOL_EXECUTION`, `VISION`, `AUDIO`, `EMBEDDING`, `RERANKING`.

## Fallback

Le fallback ne peut pas affaiblir la politique de données, changer de tenant, exécuter deux fois un outil, dépasser le plan ou perdre une contrainte structurée. Seules les erreurs retryables progressent vers le candidat suivant. Chaque tentative est enregistrée dans `AiModelCall`.

## Limite actuelle

Le protocole fournisseur livré dans cette itération est `OPENAI_RESPONSES`. Les modèles/fournisseurs supplémentaires ne deviennent actifs qu’avec une définition valide et un secret Production configuré.
