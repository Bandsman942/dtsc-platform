# HOTFIX — Portée globale de l'outbox Diffusion DTSC et Web Push (13/11/2026)

Version candidate : **v1.16.2** — PR en validation, **NON FUSIONNÉE / NON DÉPLOYÉE**.

## Incident confirmé (lecture seule Production)

Le 13 novembre 2026 à 08:34:16 UTC (10:34:16 Kinshasa), l'API
`POST /api/admin/broadcast` a retourné HTTP 500. Vercel a enregistré
`PrismaClientKnownRequestError P2003` lors de
`enterpriseDomainEvent.createMany()`, FK
`EnterpriseDomainEvent_organizationId_fkey`.
La file conservait la sentinelle `__DTSC_PLATFORM__` alors qu'aucune
organisation correspondante n'existait dans Neon. Le traitement s'est arrêté
avant Zoho ; la transaction de création était annulée. Une tentative échouée
**ne sera pas rejouée automatiquement** ; l'opérateur doit relancer après
validation, après contrôle de la file et de l'absence de doublon.

## Modèle de portée après migration

- `EnterpriseDomainEvent.organizationId = NULL` : événement **global
  plateforme**, uniquement pour les trois types autorisés par la contrainte SQL :
  `PLATFORM_WEB_PUSH_NOTIFICATION`,
  `PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD`,
  `PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY`.
- `organizationId` non nul : événement d'organisation réelle, FK
  `EnterpriseDomainEvent_organizationId_fkey` **conservée**.
- Toutes les autres familles d'événements doivent rester tenant-scoped ;
  leur `organizationId = NULL` est bloqué au niveau PostgreSQL.
- La colonne est désormais `String?` dans
  `prisma/enterprise-workflow-engine.prisma`, avec migration versionnée
  `20261113104500_global_platform_outbox_scope`.
- Pas de création d'organisation factice, pas de suppression de donnée
  historique, pas de modification de la sentinelle dans les anciens
  enregistrements (aucun enregistrement sentinel confirmé dans l'analyse).
- Workflows, projections, purge des artifacts entreprise : **ignore/rejette
  les événements de plateforme sans organisation** avant d'accéder aux
  services sensibles. Les workers Push/e-mail restent isolés par `eventType`.

## Flux Diffusion DTSC

1. `POST /api/admin/broadcast` valide l'administrateur, le payload et
   récupère les utilisateurs actifs.
2. `enqueueAdminBroadcast` crée dans **une transaction** les notifications
   applicatives préférées, leurs événements Push, le payload e-mail maître
   et les jobs e-mail (groupé CCI ou unitaire avec `{user}`).
3. HTTP **202 Accepted** signifie **mis en file**, jamais `envoyé`.
4. Worker `/api/internal/admin-broadcast-email/process?batch=50` :
   cron une minute, batch 50, concurrence 5, `FOR UPDATE SKIP LOCKED`,
   retry/lease/DLQ jusqu'à 5 tentatives, puis provider Zoho ou webhook.
5. Worker Web Push `/api/internal/web-push/process?batch=50` : dispatch
   asynchrone, scope vérifié contre la notification canonique (nullable).
6. Les exceptions techniques restent dans les logs serveur ; l'API renvoie
   un `incidentId` non sensible. Le formulaire interdit la double
   soumission locale pendant l'attente HTTP.

Variables de configuration existantes à contrôler en Production :
`DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET` ou
`WORKFLOW_WORKER_SECRET`, `ADMIN_BROADCAST_EMAIL_CRON_ENABLED` et
configuration Zoho/webhook ; pour Push :
`WEB_PUSH_WORKER_SECRET`, VAPID et activation du cron. Ne jamais
imprimer les valeurs des secrets dans une issue ou un rapport.

## Validation et preuves

- Statique : `pnpm qa:global-outbox` ;
  `node scripts/qa-scale4c-web-push-worker.mjs` ;
  `node scripts/qa-scale4d-admin-broadcast-email.mjs`.
- PostgreSQL réel : `pnpm qa:global-outbox:postgres` sur **localhost**
  et une base `*test*` déjà migrée (Quality Gates PostgreSQL).
  Cas : 3 destinataires, préférences (2 notifications), Push global,
  e-mail groupé (1 job), personnalisé (3 jobs), données atomiques,
  contrainte FK réelle tenant, refus de scope NULL hors allow-list.
- Quality Gates : `prisma generate`, `prisma migrate deploy`, test
  PostgreSQL, `type-check`, lint, QA régression, build.
- Vérification indépendante sur la branche Neon isolée
  `qa-global-platform-outbox-20261113` : migration appliquée,
  trois insertions de jobs NULL acceptées,
  événement tenant NULL interdit (SQLSTATE 23514), fausse organisation
  interdite (SQLSTATE 23503). **Ce test n'est pas une validation E2E
  d'une diffusion réelle.**
- L'E2E propriétaire reste **NON EXÉCUTÉ** jusqu'à une validation
  explicite de l'utilisateur.

## Checklist E2E manuelle après fusion + migration Production

- [ ] Vérifier déploiement main/prod et migrations sans erreur.
- [ ] Vérifier la file de diffusion (absence de job orphelin / doublon).
- [ ] Lancer une diffusion vers une audience de test autorisée, jamais
      tous les clients pour le premier essai.
- [ ] Attester réponse 202, `broadcastId`, compteurs de jobs et notification.
- [ ] Confirmer qu'une deuxième soumission pendant le chargement est bloquée.
- [ ] Confirmer livraison Zoho réelle à la boîte test et statut worker PROCESSED.
- [ ] Confirmer notification Web Push globale et refus cross-tenant.
- [ ] Tester la personnalisation `{user}` et l'envoi groupé CCI.
- [ ] Provoquer un échec contrôlé en base test et confirmer rollback atomique.
- [ ] Contrôler erreurs et alertes Vercel ; relever l'E2E final.

## Rollback

La migration est **additive**, sans suppression : elle peut rester appliquée
en cas de rollback applicatif ; éviter de rétablir `NOT NULL` si des
jobs globaux NULL existent. L'ancien code avec sentinelle ne doit pas être
redéployé sans correction : il reproduirait P2003. Aucun `--prod` manuel :
production uniquement depuis `main` après Quality Gates et E2E propriétaire.
