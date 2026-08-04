# Architecture connaissance documentaire et RAG

DTSC réutilise `KnowledgeDocument/KnowledgeChunk` pour le compte personnel et `EnterpriseAiKnowledgeSource/EnterpriseAiKnowledgeChunk` pour l’organisation. Aucun index parallèle n’est créé.

## Pipeline

Upload autorisé → validation type/taille/quota → stockage privé → extraction → découpage → embeddings → indexation → état `READY` ou `FAILED`.

Chaque source et fragment conserve désormais langue et version ; les fragments peuvent porter page, section et offsets. Une source en traitement ou en échec n’est jamais présentée comme analysée.

## Recherche

La recherche entreprise filtre `organizationId`, assistant, archive, statut, module/secteur et niveaux de confidentialité autorisés avant de retourner des fragments. La requête multilingue utilise les embeddings existants ; la réponse suit la langue utilisateur tandis que la citation conserve la langue source.

## Révocation

Archiver ou révoquer une source la retire des recherches futures. Les fichiers, fragments, embeddings, caches et audits sont traités selon la politique de suppression non destructive et les droits applicables.
