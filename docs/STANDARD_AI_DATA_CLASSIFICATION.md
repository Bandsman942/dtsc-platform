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

## Contrat runtime

`AiRouteRequest.dataClassifications` transporte les classifications résolues côté serveur et `lib/ai/policy.ts` les évalue avant toute tentative fournisseur.

Règles opposables :

1. `SECRET` est refusé pour tout provider externe.
2. `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE` et `LEGAL_SENSITIVE` exigent une autorisation explicite de policy avant un provider externe.
3. Une autorisation de modèle ne remplace jamais les contrôles métier source : membership, permission, module, entitlement, propriété de l'objet et `organizationId` restent obligatoires avant construction du contexte IA.
4. Une classification ou un flag sensible ne doit jamais être accepté directement depuis un payload client comme autorité. La route/service métier doit le résoudre depuis le contexte serveur.
5. Un fallback ne peut jamais élargir la politique de données. Chaque candidat repasse par le même Policy Engine.
6. Les prompts, logs et observations ne doivent pas persister un secret complet uniquement pour expliquer une décision de routage.

## RAG V2

Les sources Enterprise possèdent désormais une classification de données d'index dérivée côté serveur. Le formulaire historique continue d'exprimer une confidentialité d'accès (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `MANAGERS_ONLY`), mais cette valeur n'est pas utilisée seule comme autorité de routage fournisseur.

Règles conservatrices initiales :

- source `PUBLIC` → `PUBLIC` ;
- source non publique d'une organisation `HEALTH_CARE` ou `PHARMACY` → `HEALTH_SENSITIVE` ;
- module dont le code contient HR/PAYROLL → `HR_SENSITIVE` ;
- module FINANCE/ACCOUNT/BUDGET → `FINANCIAL_SENSITIVE` ;
- module LEGAL/CONTRACT → `LEGAL_SENSITIVE` ;
- autre source `CONFIDENTIAL` ou `MANAGERS_ONLY` → `CONFIDENTIAL` ;
- autre source → `INTERNAL`.

Cette première résolution privilégie une sur-classification sûre à une sous-classification risquée. Une future règle métier plus fine peut réduire le surclassement uniquement si elle repose sur des métadonnées canoniques et une QA dédiée.

Le retrieval renvoie les classifications des chunks réellement sélectionnés. La route Enterprise fusionne ces classes avec celles du Context Engine puis transmet l'ensemble au Policy Router **avant** tout appel modèle. Ainsi, une question qui devient sensible après retrieval ne peut pas continuer vers un provider avec la classification initiale plus faible.

## Embeddings

Les embeddings sont séparés du runtime génératif et passent par `lib/ai/embeddings.ts`. Le provider/modèle/dimension/version d'index sont enregistrés séparément des classifications de données.

Un vecteur legacy ne reçoit jamais rétroactivement un modèle d'embedding non vérifié : il reste `LEGACY_UNKNOWN` jusqu'à réindexation explicite.
