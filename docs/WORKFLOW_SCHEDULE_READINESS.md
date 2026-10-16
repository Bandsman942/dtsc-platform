# WF-06S2C — Préflight inerte des horaires (#848 ; parent #843 / #819)

**Statut : branche de développement.** Base `main@f6e803f76195ae92a1f07fd260d1c3dd26e2fc21` (WF-06S2B #846 OWNER_E2E BON + déploiement Vercel READY). La tranche **ne rend aucun horaire exécutable**.

## Frontière de sécurité

`lib/enterprise/workflows/schedule-readiness.ts` exporte `assertDisabledWorkflowScheduleReadiness({organizationId,scheduleId,asOf?})`. Cette API est **interne et lecture seule**, non exposée par une route, un écran, un cron ou un worker. Elle n'accepte que des identifiants tenant/schedule bornés et une date fiable ; elle exige :

1. Entreprise `CLIENT` active non supprimée ; schedule du même tenant en état `DISABLED`.
2. Définition ACTIVE non archivée et version **courante** PUBLISHED épinglée : ni publication remplacée ni re-ciblage implicite.
3. Mandat persistant complet (#846) avec même `triggerEntityType` que la définition, utilisateur réel membre actif, `mandateVerifiedAt` renseigné ; l'horodatage seul **n'accorde jamais de permission**.
4. Décision LIVE du registre `WORKFLOWS` (plan/module/permission, `resolveEnterpriseModuleAccess`) et du module ERP source (`requireWorkflowSourceAccess`) ; entité via adaptateur allow-listé `loadEntity(org,id)`, vérification stricte tenant/id ; acteur réévalué via `resolveWorkflowExecutionUser`. Aucune identité SYSTEM de repli.
5. Curseur `nextRunAt` existant et strictement conforme à `getNextWorkflowOccurrence` pour le fuseau IANA et la politique **DST SKIP / FIRST** ; rejette la seconde occurrence d'une heure répétée. Aucun réajustement silencieux.
6. Rattrapage : maximum **24 heures** d'ancienneté du curseur. Une vieille file d'attente requiert une intervention et une politique explicite dans #843 ; aucune boucle/catch-up massif.
7. Toute occurrence préexistante `RESERVED` sur cet horaire est un **reçu non rapproché** et interdit l'éligibilité, afin de ne jamais transformer un ancien ticket de réservation en effet métier par accident.
8. **Plafonds techniques de sécurité** avant activation : au plus **50 horaires par entreprise** et **10 par définition**. Ils ne sont **pas des quotas commerciaux par plan**. La fixation de quotas par abonnement, l'allocation atomique des capacités et la protection multi-worker sont reportées à #843.

Le résultat est gelé, contient exclusivement `kind: INERT_READINESS_ONLY`, tenant, schedule, version, révision, `status: DISABLED` et UTC `nextRunAt`. Il n'expose **aucune entité ERP**, aucun document ni attribut bancaire/santé, aucun token, et n'autorise ni ne crée de run, occurrence, événement, action ou paiement.

### Important : préflight = instantané consultatif (TOCTOU)

Les droits, les modules, l'entité, la version et les plafonds peuvent changer immédiatement après cette lecture. Le futur dispatcher/worker doit **revalider ces informations dans son propre protocole de réservation transactionnelle**, avec lease, quota plan et outbox/run atomique. **Ne jamais utiliser le succès du préflight comme une autorisation d'exécution persistante.** Un scheduler ne peut consommer cet indicateur pour appeler un service de mutation en #848.

## Qualité

`node scripts/qa-workflow-848-postgres.mjs` avec une base PostgreSQL locale dédiée `*test*`, intégrée à **Quality** et **Migration** sur base vierge. Le test utilise les vraies opérations Prisma et un adaptateur d'entité tenant-scoped sur les vraies tâches de fixture ; les frontières externes d'abonnement/permissions sont des doubles contrôlés. Il vérifie 2 tenants, refus source étrangère, tenant inactif, acteur révoqué, accès WORKFLOWS refusé, source refusée, version retirée, mandat absent, DST FALL FIRST et SPRING SKIP, reçu RESERVED à rapprocher, rattrapage ancien, plafonds de 10 et 50, 0 run/reçu/événement net. Ce n'est **pas un E2E navigateur réel**.

Aucune modification Prisma, migration, variable d'environnement, API de production, UI ou intégration cron. Repli possible en retirant uniquement le module non utilisé ; aucune donnée persistée ni migration à annuler. OWNER_E2E #848 **distinct et indispensable** avant merge après CI. Les jobs GitHub sont preuve uniquement après leur succès effectif.
