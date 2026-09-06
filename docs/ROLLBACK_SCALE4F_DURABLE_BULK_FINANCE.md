# Rollback #515 — SCALE-4F

Le rollback ne doit jamais réactiver automatiquement les traitements volumineux synchrones dangereux.

1. Désactiver le cron `/api/internal/enterprise-bulk/process?batch=2` si le worker provoque un incident.
2. Bloquer temporairement la création de nouveaux jobs bulk côté routes, tout en conservant les petits volumes bornés.
3. Conserver tous les `EnterpriseDomainEvent` existants pour audit et reprise.
4. Conserver les `EnterpriseBankStatement` `IMPORTING` / `IMPORT_FAILED` et leurs lignes déjà importées ; ne pas les supprimer.
5. Le rapprochement doit continuer à exiger `status = IMPORTED`.
6. Conserver les artefacts Audit privés existants jusqu’à expiration/purge ; ne jamais les rendre publics pour contourner le worker.
7. Aucune migration n’étant introduite par #515, aucun rollback de schéma n’est requis.

Après correction, le worker peut reprendre les jobs `FAILED` de manière idempotente grâce aux clés de job et aux contraintes uniques des lignes bancaires.
