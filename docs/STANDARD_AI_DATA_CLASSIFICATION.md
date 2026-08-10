# Classification des données IA

- `PUBLIC` : contenu publiable.
- `INTERNAL` : usage interne ordinaire.
- `CONFIDENTIAL` : accès limité à des membres autorisés.
- `RESTRICTED` : accès explicitement restreint.
- `HEALTH_SENSITIVE` : données cliniques ou de santé.
- `HR_SENSITIVE` : dossiers RH, rémunérations et évaluations.
- `FINANCIAL_SENSITIVE` : comptes, paiements, écritures et états non publics.
- `LEGAL_SENSITIVE` : contrats, litiges et avis juridiques.
- `SECRET` : secrets techniques ou stratégiques ; jamais envoyés au modèle externe.

Chaque politique modèle peut interdire une classe, exiger minimisation, masquage ou pseudonymisation. Les données Health, RH, Finance et Legal restent soumises à leurs services et permissions canoniques. Une réponse IA n’est pas une décision médicale, juridique, financière ou administrative validée.

## Contrat runtime — AI00

`AiRouteRequest.dataClassifications` transporte les classifications résolues côté serveur et `lib/ai/policy.ts` les évalue avant toute tentative fournisseur.

Règles opposables :

1. `SECRET` est refusé pour tout provider externe.
2. `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE` et `LEGAL_SENSITIVE` exigent une autorisation explicite de policy avant un provider externe.
3. Une autorisation de modèle ne remplace jamais les contrôles métier source : membership, permission, module, entitlement, propriété de l'objet et `organizationId` restent obligatoires avant construction du contexte IA.
4. Une classification ou un flag sensible ne doit jamais être accepté directement depuis un payload client comme autorité. La route/service métier doit le résoudre depuis le contexte serveur.
5. Un fallback ne peut jamais élargir la politique de données. Chaque candidat repasse par le même Policy Engine.
6. Les prompts, logs et observations ne doivent pas persister un secret complet uniquement pour expliquer une décision de routage.

## Multi-provider — AI02

OpenAI direct et OpenRouter passent par la même autorité `lib/ai/*`. OpenRouter est considéré externe par défaut et n'est utilisable qu'avec une clé serveur et des modèles explicitement présents dans l'allow-list DTSC certifiée.

La baseline OpenRouter ajoute systématiquement : `allow_fallbacks:false`, `data_collection:"deny"` et `zdr:true`. Ces protections provider ne remplacent jamais la classification DTSC.

## Policy Router V2 — AI03

Le health registry, le coût, la latence et la préférence utilisateur interviennent après l'éligibilité de policy. Aucun score, état `HEALTHY`, coût inférieur ou modèle préféré ne peut rendre un candidat interdit à nouveau éligible.

Un fallback multi-provider reste soumis aux mêmes classifications et à `listAvailableAiModels()`. Une erreur retryable ne permet donc jamais de basculer vers un provider moins sûr ou vers un modèle non autorisé.

Les métadonnées `selectionScore` et `selectionCriteria` ne contiennent que des scores, statuts health, raisons non sensibles et codes modèles. Elles ne stockent ni prompt complet, ni messages, ni secret, ni document métier.

## RAG V2 — classification des sources Enterprise

La confidentialité documentaire (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `MANAGERS_ONLY`) contrôle l'accès au document, mais elle n'est pas utilisée seule comme autorité de routage fournisseur. Une classification de données distincte est dérivée côté serveur lors de la préparation/réindexation.

Règles conservatrices initiales :

- source `PUBLIC` → `PUBLIC` ;
- source non publique d'une organisation `HEALTH_CARE` ou `PHARMACY` → `HEALTH_SENSITIVE` ;
- module HR/PAYROLL → `HR_SENSITIVE` ;
- module FINANCE/ACCOUNT/BUDGET → `FINANCIAL_SENSITIVE` ;
- module LEGAL/CONTRACT → `LEGAL_SENSITIVE` ;
- autre source `CONFIDENTIAL` ou `MANAGERS_ONLY` → `CONFIDENTIAL` ;
- autre source → `INTERNAL`.

Cette première résolution privilégie une sur-classification sûre à une sous-classification risquée. Une future règle plus fine ne pourra réduire cette classification qu'à partir de métadonnées canoniques et d'une QA dédiée.

Le retrieval renvoie les classifications des chunks réellement sélectionnés. La route Enterprise fusionne ces classes avec celles du Context Engine, puis transmet l'ensemble au Policy Router avant tout appel modèle. Une question qui devient sensible après retrieval ne continue donc pas avec une classification initiale trop faible.

## Embeddings et index

Les embeddings sont séparés du runtime génératif et passent par `lib/ai/embeddings.ts`. Le provider, le modèle, la dimension et la version d'index sont enregistrés séparément de la classification métier.

Les vecteurs historiques conservent `legacy-openai-1536-v1` et `LEGACY_UNKNOWN`. Aucun ancien vecteur n'est rétroactivement attribué à un modèle non vérifié ; seule une réindexation explicite effectue le cutover vers une nouvelle version.
