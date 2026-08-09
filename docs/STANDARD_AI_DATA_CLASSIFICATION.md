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

## Contrat runtime — DTSC AI Sprint 0

La classification n'est plus uniquement documentaire. `AiRouteRequest.dataClassifications` transporte les classifications résolues côté serveur et `lib/ai/policy.ts` les évalue avant toute tentative fournisseur.

Règles opposables :

1. `SECRET` est refusé pour tout provider externe.
2. `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE` et `LEGAL_SENSITIVE` exigent une autorisation explicite de policy avant un provider externe.
3. Une autorisation de modèle ne remplace jamais les contrôles métier source : membership, permission, module, entitlement, propriété de l'objet et `organizationId` restent obligatoires avant construction du contexte IA.
4. Une classification ou un flag sensible ne doit jamais être accepté directement depuis un payload client comme autorité. La route/service métier doit le résoudre depuis le contexte serveur.
5. Un fallback ne peut jamais élargir la politique de données. Chaque candidat repasse par le même Policy Engine.
6. Les prompts, logs et observations ne doivent pas persister un secret complet uniquement pour expliquer une décision de routage.

## État transitoire

Le provider génératif actif reste OpenAI Responses. OpenRouter n'est pas encore actif sur cette branche. Les embeddings directs historiques de `lib/rag.ts` sont inventoriés séparément et seront traités par une abstraction `EmbeddingProvider` dans RAG V2 plutôt que fusionnés artificiellement avec le runtime de génération.
