# DTSC AI — inventaire des bypass providers

Statut : Sprint 0 / issue #179  
Autorité cible : `lib/ai/*`

## Objet

Cet inventaire recense les chemins qui appellent directement un fournisseur IA ou une API fournisseur sans passer entièrement par l'orchestrateur canonique DTSC. Il sert de contrat de migration : aucun nouveau bypass ne doit être introduit.

## Classification

- `MIGRATE_TO_ORCHESTRATOR` : génération LLM qui doit rejoindre le runtime canonique.
- `KEEP_DIRECT_TEMPORARILY` : compatibilité temporaire explicitement documentée.
- `REMOVE_LEGACY` : ancien chemin à supprimer après preuve de non-régression.
- `EMBEDDING_PROVIDER_SEPARATE` : embedding à sortir du générateur LLM vers une abstraction dédiée.

## Inventaire confirmé

| Chemin | Usage | Classification | Cible | Risque actuel |
|---|---|---|---|---|
| `lib/rag.ts` | Appel direct `POST /v1/embeddings`, modèle d'embedding OpenAI et dimension 1536 | `EMBEDDING_PROVIDER_SEPARATE` | Itération RAG V2 : `EmbeddingProvider` versionné | Dépendance fournisseur/dimension codée en dur ; hors Policy Router génératif |
| `lib/openai.ts` | Helpers historiques OpenAI et contrats/messages utilisés par plusieurs surfaces | `KEEP_DIRECT_TEMPORARILY` | Réduire progressivement ce fichier aux contrats partagés ; génération via `lib/ai/*` | Risque de double source de vérité si de nouveaux appels réseau y sont ajoutés |
| `lib/private-chat-actions.ts` | Actions chatbot privées et intégration historique utilisant la configuration OpenAI | `MIGRATE_TO_ORCHESTRATOR` | DTSC Tool Gateway (#185) + runtime assistant | Extraction/exécution parallèle au registre d'outils canonique |
| `app/api/public/dtsc-agent/route.ts` | Agent public avec chemin OpenAI direct | `MIGRATE_TO_ORCHESTRATOR` | Assistant Runtime/Policy Router avec profil public dédié | Le runtime public peut contourner plan/policy/observabilité communs |

## Chemins déjà canoniques ou en cours de convergence

- `app/api/chat/v2/route.ts` → `routeAiStream()`.
- `app/api/enterprise/ai/chat/route.ts` → `routeAiStream()`.
- `lib/ai/catalog.ts` → catalogue canonique providers/modèles.
- `lib/ai/orchestrator.ts` → sélection et fallback canoniques.
- `lib/ai/provider.ts` → exécution fournisseur actuelle, à abstraire en Itération 1.

## Règles de Sprint 0

1. Aucun identifiant de modèle arbitraire fourni par le client ne doit atteindre un provider.
2. `minimumPlan`, contexte, locale, tâche, capacités et politique de données doivent être appliqués avant exécution provider.
3. `SECRET` ne doit jamais être envoyé à un modèle externe.
4. Les domaines `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE` et `LEGAL_SENSITIVE` doivent passer par une décision de policy explicite avant provider.
5. Les embeddings restent séparés de la génération : leur migration fonctionnelle appartient à RAG V2 et ne doit pas être réalisée silencieusement dans Sprint 0.
6. Tout nouveau bypass détecté doit être ajouté ici avant merge.

## Recherche de contrôle

Les recherches repo utilisées pour cet inventaire incluent notamment :

- `OPENAI_API_KEY`
- `api.openai.com/v1`
- appels embeddings
- imports/configuration OpenAI hors `lib/ai/*`

Cet inventaire doit être réexécuté/étendu avant la clôture de #179 et vérifié par une QA statique dédiée.
