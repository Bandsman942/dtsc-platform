# WF-06S2D — Reçus d'exécution inertes (#850 ; parent #843 / #819)

**Statut : PR brouillon, non activée.** Base `main@db93113b` ; #848 est fusionné avec OWNER_E2E BON. La sécurité du préflight reste consultative et sans effet runtime.

## Contrat
L'occurrence du ledger #841 gagne des métadonnées nullables de tentative, lease, révision, temps, erreur sûre, lien vers `EnterpriseWorkflowRun` et vers le **même** `EnterpriseDomainEvent` canonique. Pas de duplication d'outbox, pas de payload métier sensible, pas de worker ni de changement de droits. FKs composites `(organizationId,id)` empêchent les liens cross-tenant ; index uniques interdisent de réutiliser un run ou événement pour deux reçus du même tenant.

**Verrou de sécurité conservé :** le CHECK historique n'accepte que `RESERVED` ; le nouveau `EW_Occurrence_inert_execution_check` exige que toutes les colonnes de claim/run/outbox restent nulles et `attemptCount = 0`. Donc aucune activation accidentelle même via une mutation Prisma directe. Migration additive ; données existantes compatibles sans backfill.

## Hors scope
États READY/CLAIMED/EXECUTED, déclenchement, activation ENABLED, nouvelle route/API, worker/Cron, quotas commerciaux, effet ERP, UI, secrets, changement de schéma préexistant. Aucun import runtime de ces nouvelles colonnes.

## Activation future #843 (condition impérative)
Il faudra une migration distincte révisant explicitement les CHECKs **uniquement après** preuves : revalidation transactionnelle tenant/acteur/source/entitlements, claims concurrents SKIP LOCKED et CAS de bail, outbox et run dans la même transaction que le reçu, clé idempotente unique par occurrence, reprise après crash, quotas/catch-up bornés, DST SKIP/FIRST, absence de double action ERP, audit et OWNER_E2E #843. Le préflight #848 est consultatif et non une autorisation runtime.

## QA et rollback
Test PostgreSQL isolé : deux tenants, valeurs par défaut, 11 écritures interdites, présence des 4 contraintes DB et 2 indexes uniques, 0 run/événement. Jobs Quality et Migration requis, ainsi que Prisma/typecheck/lint/régression/build et OWNER_E2E #850. Rollback : conserver colonnes et historique inertes, ne jamais supprimer ni modifier une migration appliquée.
