# Classification des données IA

- `PUBLIC` : contenu publiable.
- `INTERNAL` : usage interne ordinaire.
- `CONFIDENTIAL` : accès limité à des membres autorisés.
- `RESTRICTED` : accès explicitement restreint.
- `HEALTH_SENSITIVE` : données cliniques ou de santé.
- `HR_SENSITIVE` : dossiers RH, rémunérations et évaluations.
- `FINANCIAL_SENSITIVE` : comptes, paiements, écritures et états non publics.
- `LEGAL_SENSITIVE` : contrats, litiges et avis juridiques.
- `SECRET` : secrets techniques ou stratégiques ; jamais envoyés au modèle.

Chaque politique modèle peut interdire une classe, exiger minimisation, masquage ou pseudonymisation. Les données Health, RH, Finance et Legal restent soumises à leurs services et permissions canoniques. Une réponse IA n’est pas une décision médicale, juridique, financière ou administrative validée.

## Contrat runtime — AI00

La classification n'est plus uniquement documentaire. `AiRouteRequest.dataClassifications` transporte les classifications résolues côté serveur et `lib/ai/policy.ts` les évalue avant toute tentative fournisseur.

Règles opposables :

1. `SECRET` est refusé pour tout provider externe.
2. `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE` et `LEGAL_SENSITIVE` exigent une autorisation explicite de policy avant un provider externe.
3. Une autorisation de modèle ne remplace jamais les contrôles métier source : membership, permission, module, entitlement, propriété de l'objet et `organizationId` restent obligatoires avant construction du contexte IA.
4. Une classification ou un flag sensible ne doit jamais être accepté directement depuis un payload client comme autorité. La route/service métier doit le résoudre depuis le contexte serveur.
5. Un fallback ne peut jamais élargir la politique de données. Chaque candidat repasse par le même Policy Engine.
6. Les prompts, logs et observations ne doivent pas persister un secret complet uniquement pour expliquer une décision de routage.

## Multi-provider — AI02

OpenAI direct et OpenRouter passent par la même autorité `lib/ai/*`. OpenRouter est considéré externe par défaut et n'est utilisable qu'avec une clé serveur et des modèles explicitement présents dans l'allow-list DTSC certifiée.

La baseline OpenRouter ajoute systématiquement :

- `allow_fallbacks:false` afin qu'OpenRouter ne masque pas un changement de provider ;
- `data_collection:"deny"` afin d'exclure les endpoints qui collectent les données ;
- `zdr:true` afin d'exiger une route Zero Data Retention.

Ces protections provider ne remplacent jamais la classification DTSC.

## Policy Router V2 — AI03

Le health registry, le coût, la latence et la préférence utilisateur interviennent **après** l'éligibilité de policy. Aucun score, état `HEALTHY`, coût inférieur ou modèle préféré ne peut rendre un candidat interdit à nouveau éligible.

`routeAiStream()` conserve actuellement `allowSensitiveExternalModel:false` dans la requête effective résolue côté serveur. Les contraintes de routage AI03 sont uniquement restrictives : plafond de coût, préférence coût/latence, ZDR réaffirmé, plafond de prix provider et ordre technique OpenRouter. Elles ne contiennent aucun mécanisme d'assouplissement de classification.

Un fallback multi-provider reste soumis aux mêmes classifications et à `listAvailableAiModels()`. Une erreur retryable ne permet donc jamais de basculer vers un provider moins sûr ou vers un modèle non autorisé.

Les métadonnées `selectionScore` et `selectionCriteria` ne contiennent que des scores, statuts health, raisons non sensibles et codes modèles. Elles ne stockent ni prompt complet, ni messages, ni secret, ni document métier.

## Frontière RAG

Les embeddings directs historiques sont inventoriés séparément et seront traités par une abstraction `EmbeddingProvider` dans RAG V2. Ils ne sont pas fusionnés artificiellement avec le runtime de génération et restent soumis à leur propre réconciliation de classification.