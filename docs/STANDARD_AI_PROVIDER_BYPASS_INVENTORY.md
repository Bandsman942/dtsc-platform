# DTSC AI — inventaire des bypass providers

Statut : programme DTSC AI, actualisé RAG V2 / issue #184
Autorité cible : `lib/ai/*`

## Objet

Cet inventaire recense les chemins qui appellent directement un fournisseur IA ou une API fournisseur sans passer par une abstraction canonique DTSC. Il sert de contrat de migration : aucun nouveau bypass ne doit être introduit.

## Classification

- `MIGRATE_TO_ORCHESTRATOR` : génération LLM qui doit rejoindre le runtime canonique.
- `KEEP_DIRECT_TEMPORARILY` : compatibilité temporaire explicitement documentée.
- `REMOVE_LEGACY` : ancien chemin à supprimer après preuve de non-régression.
- `EMBEDDING_PROVIDER_MIGRATED` : embedding passé derrière l'abstraction indépendante `EmbeddingProvider`.

## Inventaire confirmé

| Chemin | Usage | Classification | Cible | Risque actuel |
|---|---|---|---|---|
| `lib/rag.ts` | Embeddings du RAG personnel et fonctions partagées Enterprise | `EMBEDDING_PROVIDER_MIGRATED` | `lib/ai/embeddings.ts` avec provider/modèle/dimension/version et batch | L'index physique reste `vector(1536)` pendant le cutover ; toute nouvelle dimension exige une version d'index explicite |
| `lib/openai.ts` | Helpers historiques OpenAI et contrats/messages utilisés par plusieurs surfaces | `KEEP_DIRECT_TEMPORARILY` | Réduire progressivement ce fichier aux contrats partagés ; génération via `lib/ai/*` | Risque de double source de vérité si de nouveaux appels réseau y sont ajoutés |
| `lib/private-chat-actions.ts` | Actions chatbot privées et intégration historique utilisant la configuration OpenAI | `MIGRATE_TO_ORCHESTRATOR` | DTSC Tool Gateway (#185) + runtime assistant | Extraction/exécution parallèle au registre d'outils canonique |
| `app/api/public/dtsc-agent/route.ts` | Agent public avec chemin OpenAI direct | `MIGRATE_TO_ORCHESTRATOR` | Runtime assistant/Policy Router avec profil public dédié | Le runtime public peut contourner plan/policy/observabilité communs |

## Chemins canoniques

- `app/api/chat/v2/route.ts` → `prepareAiTurn()` puis `routeAiStream()`.
- `app/api/enterprise/ai/chat/route.ts` → `prepareAiTurn()` puis `routeAiStream()`.
- `lib/ai/catalog.ts` → catalogue canonique providers/modèles.
- `lib/ai/orchestrator.ts` → policy, scoring, sélection et fallback.
- `lib/ai/provider.ts` → façade des adapters de génération.
- `lib/ai/embeddings.ts` → abstraction provider indépendante pour les embeddings.
- `lib/rag.ts` et `lib/enterprise-ai/knowledge.ts` → consomment l'abstraction embedding ; aucun appel réseau OpenAI embedding direct n'y subsiste.

## Règles durables

1. Aucun identifiant de modèle arbitraire fourni par le client ne doit atteindre un provider.
2. Plan, contexte, locale, tâche, capacités et politique de données sont appliqués avant exécution provider.
3. `SECRET` ne doit jamais être envoyé à un modèle externe.
4. `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE` et `LEGAL_SENSITIVE` doivent remonter vers le Policy Router avant l'appel fournisseur.
5. Les embeddings sont séparés de la génération et possèdent leur propre provider, modèle, dimension et version d'index.
6. Un ancien vecteur n'est jamais renommé silencieusement vers un nouveau modèle : les lignes legacy conservent un index `legacy-openai-1536-v1` et un modèle `LEGACY_UNKNOWN` tant qu'elles ne sont pas réindexées explicitement.
7. Tout nouveau bypass détecté doit être ajouté ici avant merge.

## Recherche de contrôle

Les recherches repo de contrôle incluent notamment : `OPENAI_API_KEY`, `api.openai.com/v1`, `/embeddings`, `createEmbeddings` et les imports/configurations OpenAI hors `lib/ai/*`.
