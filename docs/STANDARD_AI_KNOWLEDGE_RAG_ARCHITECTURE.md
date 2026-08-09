# Architecture connaissance documentaire et RAG V2

DTSC réutilise `KnowledgeDocument/KnowledgeChunk` pour le compte personnel et `EnterpriseAiKnowledgeSource/EnterpriseAiKnowledgeChunk` pour l’organisation. Aucun index parallèle n’est créé.

## Pipeline

```text
Upload autorisé
  → validation type/taille/quota
  → stockage privé
  → extraction persistée
  → source PROCESSING
  → chunking versionné
  → EmbeddingProvider
  → indexVersion explicite
  → pgvector + métadonnées
  → retrieval vectoriel + lexical
  → reranking optionnel
  → citations
  → classifications remontées au Policy Router
```

## Embeddings

`lib/ai/embeddings.ts` est l’abstraction provider indépendante. Elle décrit provider, modèle, dimension, limite d’entrée, capacité batch, taille batch et version.

L’implémentation active reste OpenAI en 1536 dimensions afin de préserver le schéma pgvector existant. `lib/rag.ts` et `lib/enterprise-ai/knowledge.ts` ne font plus d’appel réseau direct vers l’endpoint embeddings OpenAI.

## Index versionné et cutover legacy

Les nouveaux documents/sources et chunks reçoivent :

- `embeddingProviderCode` ;
- `embeddingModelCode` ;
- `embeddingDimension` ;
- `indexVersion` ;
- `chunkingVersion` ;
- version source ;
- `indexedAt` sur la source ;
- `contentHash` sur les chunks.

Les vecteurs existants ne sont jamais renommés comme appartenant à un modèle non vérifié. Ils restent explicitement :

- provider `OPENAI` ;
- modèle `LEGACY_UNKNOWN` ;
- dimension `1536` ;
- index `legacy-openai-1536-v1` ;
- chunking `legacy-char-v1`.

Le retrieval exige que `chunk.indexVersion = source.indexVersion`. Un ancien chunk ne peut donc pas être mélangé silencieusement avec un nouvel index de sa source.

## Idempotence et batch

Les nouveaux chunks possèdent un SHA-256 `contentHash`. Des index uniques bornent document/source + hash + indexVersion. Les insertions utilisent `ON CONFLICT DO NOTHING`.

Les embeddings sont calculés par lots au lieu d’un appel réseau par chunk.

## Indexation Enterprise asynchrone et retryable

L’upload Enterprise :

1. crée la source en `PROCESSING` ;
2. confirme le stockage ;
3. extrait et persiste le texte ;
4. retourne HTTP `202` ;
5. utilise `after()` de Next.js/Vercel pour lancer l’indexation batch ;
6. passe à `READY` seulement après index complet ;
7. passe à `FAILED` sur erreur.

L’action sécurisée `reindex` relance le même job par `sourceId + organizationId` à partir du texte extrait déjà persisté. Le retry ne nécessite pas de ré-upload et ne duplique pas les chunks.

## Retrieval hybride

Le ranking combine :

- similarité cosinus pgvector ;
- recherche lexicale PostgreSQL `to_tsvector` / `plainto_tsquery` ;
- seuil de pertinence ;
- score hybride ;
- tri stable par score puis distance.

Les filtres de sécurité s’appliquent avant le ranking : tenant, statut READY, archive, confidentialité, secteur/module et compatibilité d’index.

La configuration full-text `simple` est utilisée pour rester compatible avec les documents français et anglais sans appliquer une stemming de langue incorrecte.

## Reranking

`lib/ai/reranking.ts` définit un contrat optionnel. Aucun reranker externe n’est requis. Sans reranker, ou si le reranker échoue, le classement hybride reste disponible et déterministe.

## Data classification Enterprise

La classification est dérivée côté serveur, jamais librement abaissée par le client.

Règles conservatrices initiales :

- `PUBLIC` → PUBLIC ;
- source non publique `HEALTH_CARE` ou `PHARMACY` → HEALTH_SENSITIVE ;
- module HR/PAYROLL → HR_SENSITIVE ;
- module FINANCE/ACCOUNT/BUDGET → FINANCIAL_SENSITIVE ;
- module LEGAL/CONTRACT → LEGAL_SENSITIVE ;
- autres sources confidentielles/managers → CONFIDENTIAL ;
- autres → INTERNAL.

Les classifications des citations réellement sélectionnées sont fusionnées avec celles du tour et transmises au Policy Router avant l’appel modèle.

## Citations

Les citations Enterprise peuvent conserver : sourceId, titre, confidentialité, dataClassification, sourceVersion, indexVersion, langue, page, section, distance et hybridScore interne.

Page et section restent null lorsqu’aucune structure fiable n’est disponible. RAG V2 ne fabrique pas une page ou un titre de section.

## Révocation

Une source archivée est exclue par SQL (`archivedAt IS NULL`) avant le ranking. Aucun cache de retrieval ne peut donc réintroduire une source archivée.

## Réindexation contrôlée

`scripts/ai/plan-rag-reindex.mjs` est un planificateur dry-run, borné à 100 candidats maximum, filtrable par domaine, source et index d’origine.

La réindexation effective Enterprise passe par le job canonique `indexPreparedEnterpriseAiKnowledgeSource()` via l’action `reindex`. Aucun reindex global automatique n’est lancé en Production.
