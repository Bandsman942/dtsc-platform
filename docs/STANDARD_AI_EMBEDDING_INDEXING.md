# DTSC AI — Embedding & Indexing

## Contrat

Les embeddings sont une capacité distincte de la génération LLM. Leur point d’entrée canonique est `lib/ai/embeddings.ts`.

Le provider actif expose : `providerCode`, `modelCode`, `dimension`, `maximumInputCharacters`, `supportsBatch`, `maximumBatchSize` et `version`.

## Version d’index

`getEmbeddingIndexVersion()` produit une identité d’index à partir du provider, du modèle, de la dimension et de la version du contrat.

Une nouvelle dimension, un nouveau modèle ou un changement incompatible de provider exige un nouvel `indexVersion`. Aucun vecteur existant n’est converti implicitement.

## Legacy

Les vecteurs antérieurs à RAG V2 restent `legacy-openai-1536-v1`. Le modèle historique est `LEGACY_UNKNOWN` parce qu’il était configurable par environnement.

Le cutover autorise temporairement le retrieval de l’index courant et du legacy 1536, mais chaque source ne peut sélectionner que les chunks portant exactement son propre `indexVersion`.

## Chunking

Le chunking courant est `char-overlap-v2` : taille bornée, overlap, offsets et SHA-256 du contenu. La page n’est inférée que lorsqu’un séparateur de page existe ; la section n’est inférée que depuis un heading Markdown détectable.

Une évolution incompatible du chunking doit changer `chunkingVersion` et être réindexée explicitement.

## Batch et validation

Le provider actif accepte les lots. L’indexation envoie jusqu’à 48 chunks par batch, en restant sous la limite provider déclarée. La cardinalité du résultat et la dimension de chaque vecteur sont vérifiées avant écriture ; une réponse provider incohérente échoue fermée.

## États

- `PROCESSING` : stockage/extraction ou indexation en cours ;
- `READY` : index complet disponible ;
- `FAILED` : erreur explicite, source rejouable si le texte extrait est présent ;
- `ARCHIVED` : source Enterprise hors retrieval actif.

Un échec ne doit jamais produire un faux `READY`.

## Indexation différée

Les uploads personnels et Enterprise persistent d’abord la source et le texte extrait, retournent HTTP `202`, puis utilisent `after()` de Next.js/Vercel pour terminer l’indexation. Ce mécanisme évite de maintenir la requête d’upload ouverte pendant tous les appels embedding.

Les fonctions canoniques retryables sont :

- `indexPreparedKnowledgeDocument({ documentId, userId, organizationId })` ;
- `indexPreparedEnterpriseAiKnowledgeSource({ sourceId, organizationId })`.

L’idempotence des chunks repose sur `contentHash + indexVersion` et `ON CONFLICT DO NOTHING`.

## Réindexation contrôlée

Les APIs de reindex relisent uniquement une source appartenant au même utilisateur/tenant et exigeant un texte extrait persistant. Une source Enterprise archivée ne peut pas être réindexée.

Le planificateur est volontairement dry-run :

```bash
node scripts/ai/plan-rag-reindex.mjs --domain=enterprise --from-index=legacy-openai-1536-v1 --limit=25
```

Options :

- `--domain=enterprise|personal` ;
- `--source-id=<id>` ;
- `--from-index=<indexVersion>` ;
- `--limit=1..100`.

Aucune réindexation globale automatique n’est activée en Production. Procédure attendue : dry-run → petit lot → validation → lots bornés → observation → poursuite.
