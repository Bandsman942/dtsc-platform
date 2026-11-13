# HOTFIX — Diffusions globales DTSC / Web Push (13/11/2026)

Candidat **v1.16.2**, PR #1139 / Issue #1138 **ouverte, NON FUSIONNÉE, NON DÉPLOYÉE**.
E2E manuel propriétaire : **NON EXÉCUTÉ**.

## Diagnostic confirmé

Incident Production du 13/11/2026 à 08:34:16 UTC : `POST /api/admin/broadcast`
retourne HTTP 500, Prisma P2003, FK
`EnterpriseDomainEvent_organizationId_fkey`.
Les files Push et mail globales utilisaient l'ID synthétique
`__DTSC_PLATFORM__` qui n'existe pas en table `Organization`.
La transaction de diffusion est annulée avant l'envoi Zoho.
Une tentative échouée n'est pas rejouée automatiquement.

## Correctif retenu et compatibilité Prisma

L'hypothèse initiale de rendre `EnterpriseDomainEvent.organizationId`
nullable a été abandonnée en audit : Prisma 6 impose des champs
**obligatoires** dans `@@unique([organizationId, id])`, exploité par la
relation composite avec `EnterpriseWorkflowScheduleOccurrence`.
Rendre cette colonne nullable casserait la validation Prisma et
affaiblirait l'isolation tenant du moteur Workflow.

La solution est d'employer l'organisation **réelle** et canonique
`dtsc-internal` (`DTSC_INTERNAL_ORGANIZATION_ID` dans
`lib/organizations.ts`), vérifiée présente dans Neon Production :

- Notification globale utilisateur : `Notification.organizationId = NULL`
  demeure inchangé.
- Événement Push global en outbox : `organizationId = dtsc-internal`,
  tandis qu'un Push d'entreprise conserve son véritable ID d'entreprise.
- Événement e-mail de diffusion globale (payload maître et jobs) :
  `organizationId = dtsc-internal`.
- Workers Web Push / mail restent isolés par `eventType` et vérifient
  la notification canonique avant diffusion.
- La migration `20261113104500_global_platform_outbox_scope` est
  **additive** : CHECK empêchant les événements e-mail de diffusion
  d'être rattachés à une entreprise cliente. Les colonnes, la
  contrainte FK et `@@unique([organizationId, id])` ne changent pas.

Aucune organisation artificielle créée, aucune donnée historique supprimée,
aucune clé étrangère supprimée. Si `dtsc-internal` est absente dans un
environnement neuf, le bootstrap interne doit la créer avant toute
diffusion (Quality Gates le fait pour le test isolé).

## API et livraison

- `POST /api/admin/broadcast` : session ADMIN, Zod, transaction durable,
  notifications préférées + Push + payload mail + jobs dans un commit.
- Retour HTTP 202 : **mis en file**, pas livré par le fournisseur.
  L'échec de l'ApiLog après le commit n'est plus transformé en 500,
  afin de ne pas encourager des retries doublonnants.
- Incident 500 : réponse expurgée, `incidentId` traçable dans Vercel.
- Console : bouton désactivé lors d'une soumission en cours, compteurs
  d'audience, état mise en file ≠ livraison réelle.
- Worker e-mail : `/api/internal/admin-broadcast-email/process?batch=50`,
  cron chaque minute, concurrency 5, retries / lease / DLQ.
- Worker Push : `/api/internal/web-push/process?batch=50`, validation
  canonique du scope, gestion indépendante par `eventType`.

Vérifier sans exposer les secrets :
`DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET` ou
`WORKFLOW_WORKER_SECRET`, `ADMIN_BROADCAST_EMAIL_CRON_ENABLED`,
`WEB_PUSH_CRON_ENABLED`, configuration Zoho et Web Push/VAPID.
En lecture seule, Vercel Production a confirmé l'existence des
variables de cron et leur activation à `true`. Leur fonctionnement de
bout en bout reste à valider après déploiement.

## QA automatique

- Statique : `pnpm qa:global-outbox`, ancienne QA SCALE-4C et SCALE-4D,
  intégration au run-regression-qa-ci.
- PostgreSQL réel : `pnpm qa:global-outbox:postgres` sur base locale
  portant `test` dans son nom (et uniquement localhost). 3 destinataires,
  2 préférences Push activées, CCI groupée, personnalisation `{user}`,
  vérification FK réelle, refus d'owner client pour mail global,
  nettoyage des fixtures, **aucun envoi SMTP/Push**.
- GitHub Quality Gates : `prisma generate`, `prisma migrate deploy`,
  scripts QA, TypeScript, lint, régression, build.
- Une branche Neon QA isolée doit valider le CHECK et les insertions
  réelles sous `dtsc-internal` ; cela ne remplace pas E2E métier.

## E2E final propriétaire (à faire après Quality Gates)

- [ ] Quality Gates GitHub vertes, aucun conflit main, migration validée.
- [ ] Une diffusion de test vers une audience contrôlée (éviter d'emblée
      les 525 utilisateurs réels).
- [ ] HTTP 202 avec `broadcastId`, compteurs cohérents ;
      aucune double soumission UI pendant chargement.
- [ ] Notification interne présente, Push navigateur reçu.
- [ ] E-mail groupé CCI reçu depuis Zoho.
- [ ] E-mail personnalisé `{user}` reçu, sans doublon.
- [ ] Statut mail en outbox passe à PROCESSED, absence de DEAD imprévu.
- [ ] Isolement entreprise vérifié, FK de tenant fictif refusée.
- [ ] Logs Vercel propres (API + workers), erreurs humaines sans stack.
- [ ] **E2E final BON** fourni explicitement par le propriétaire avant fusion.

## Rollback

Aucun schéma structurel supprimé. Le CHECK peut rester lors d'un rollback
du code ; l'ancien code sentinelle **ne doit pas être redéployé** sans
adaptation sous peine de reproduire P2003. Production uniquement via
`main` après fusion autorisée ; pas de `vercel --prod` manuel.
