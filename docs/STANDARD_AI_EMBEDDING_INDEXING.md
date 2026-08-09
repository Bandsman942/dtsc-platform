# DTSC AI — Embedding & Indexing

## Contrat

Les embeddings sont une capacité distincte de la génération LLM. Leur point d’entrée canonique est `lib/ai/embeddings.ts`.

Le provider actif expose : providerCode, modelCode, dimension, maximumInputCharacters, supportsBatch, maximumBatchSize et version.

## Version d’index

`getEmbeddingIndexVersion()` produit une identité d’index à partir du provider, du modèle, de la dimension et de la version du contrat.

Une nouvelle dimension, un nouveau modèle ou un changement incompatible de provider exige un nouvel `indexVersion`. Aucun vecteur existant n’est converti implicitement.

## Legacy

Les vecteurs antérieurs à RAG V2 restent `legacy-openai-1536-v1`. Le modèle historique est `LEGACY_UNKNOWN` parce qu’il était configurable par environnement.

Le cutover autorise temporairement le retrieval de l’index courant et du legacy 1536, mais chaque source ne peut sélectionner que les chunks portant exactement son propre `indexVersion`.

## Chunking

Le chunking courant est `char-overlap-v2` : taille bornée, overlap et offsets. Les chunks conservent un hash de contenu pour l’idempotence.

Une évolution incompatible du chunking doit changer `chunkingVersion` et être réindexée explicitement.

## Batch

Le provider actif accepte les lots. L’indexation envoie jusqu’à 48 chunks par batch, en restant sous la limite provider déclarée.

## États

- `PROCESSING` : stockage/extraction ou indexation en cours ;
- `READY` : index complet disponible ;
- `FAILED` : erreur explicite, source rejouable si le texte extrait est présent ;
- `ARCHIVED` : source hors retrieval actif.

Un échec ne doit jamais produire un faux `READY`.

## Retry Enterprise

`indexPreparedEnterpriseAiKnowledgeSource({ sourceId, organizationId })` est le job canonique retryable. Il relit uniquement une source du tenant donné, utilise le texte extrait persistant, recalcule les chunks avec le provider courant et applique l’idempotence via `contentHash`.

L’API d’action `reindex` est réservée aux utilisateurs pouvant gérer les sources. Elle refuse les sources archivées et celles sans texte préparé.

## Planificateur

```bash
node scripts/ai/plan-rag-reindex.mjs --domain=enterprise --from-index=legacy-openai-1536-v1 --limit=25
```

Options :

- `--domain=enterprise|personal` ;
- `--source-id=<id>` ;
- `--from-index=<indexVersion>` ;
- `--limit=1..100`.

Le script est toujours dry-run : il ne modifie pas les sources et n’appelle aucun provider. Cette séparation évite de créer un second chemin d’embedding en dehors du contrat canonique.

## Production

Aucune réindexation globale automatique. Procédure attendue : dry-run → petit lot → validation → lots bornés → observation → poursuite. Le rollback consiste à conserver l’ancien `indexVersion` tant qu’il n’est pas explicitement remplacé par source.
