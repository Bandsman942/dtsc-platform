# WF-06S2B — Mandat de source et acteur des horaires DISABLED (#846)

**Statut** : développement, aucune activation. Parent #843 / #819 ; dépend de #844, déployé READY sur `main@cbabb4fa19e0818037498a014b407910a8361f49`.

## Contrat de liaison inerte

- Nouvelle API `PATCH /api/enterprise/[organizationId]/workflow-schedules/[scheduleId]/mandate`, corps strict `{sourceEntityId, revision}`. Ni `executionActorUserId`, ni `sourceEntityType`, ni `status` ne sont contrôlés par le client.
- Contexte actif de l'entreprise CLIENT, membership actif, permission WORKFLOWS **edit draft**, abonnement et module source ERP vérifiés via les résolveurs canoniques. Même origine, limite 30/h/utilisateur et journal d'audit.
- Type de source **exclusivement** depuis la définition persistée (ACTIVE, non archivée), version PUBLISHED courante et stable ; adaptateur `getWorkflowEntityAdapter` allow-listé, `loadEntity(organizationId,sourceEntityId)` réel tenant-scoped. Refus 404 inter-tenant. Identité autorisée **uniquement l'utilisateur de session lui-même** ; `resolveWorkflowExecutionUser(startedByUserId)` contrôle membre et accès module de l'acteur avant stockage.
- Transaction Prisma avec revalidation du contexte tenant/version/membership, comparaison optimiste de `revision`, état `DISABLED` immuable. Référence d'objet, type de source, acteur et date de vérification persistés ; **jamais de copie du snapshot ERP, document privé ou donnée financière**.
- Migration additive quatre colonnes nullable, `CHECK` quatre champs tout null OU tous renseignés et index tenant/source ; les horaires antérieurs restent non liés. Aucune modification du `CHECK status` : `ENABLED` est toujours interdit en PostgreSQL.
- `GET` existant expose exclusivement les références de mandat et reste limité à l'entreprise/aux sources lisibles et au statut `DISABLED`.

## Frontière NON exécutable

La date `mandateVerifiedAt` représente une vérification ponctuelle, **pas un mandat exécutable permanent**. L'entité peut être supprimée, l'acteur révoqué, l'abonnement interrompu ou la version remplacée entre création et activation : **les prochaines tranches de #843 doivent tout revalider au moment de l'activation et à chaque occurrence avant les effets métiers**. Les travailleurs et cron restent inchangés. Aucun status ENABLED/READY/EXECUTED, aucun outbox/run et aucune action ERP n'est déclenché ici.

## Assurance qualité

`node scripts/qa-workflow-846-postgres.mjs` sur base locale `*test*`, **Quality et Migration**. Vraie PostgreSQL et handlers GET/PATCH sous frontières de session/module simulées (il ne s'agit pas d'un test navigateur authentifié). Deux tenants, source existante et externe, version retirée, CAS, double écriture impossible, CHECK SQL, refus API 401/403/404/409/429 et absence de run/receipt/event. Les autorisations de production restent basées sur le résolveur canonique, non sur les mocks de tests.

**OWNER_E2E #846 requis avant fusion.** Aucun Vercel Preview par politique ; production uniquement après squash merge approuvé sur main.

## Déploiement et rollback

Migration additive non destructive avec NULL par défaut ; aucun backfill, aucune variable/secrète supplémentaire. Compatible avec le code antérieur si rollback applicatif : revenir aux anciennes routes et ignorer les colonnes persistées ; ne jamais DROP les données. Aucune requalification de l'horodatage de vérification en autorisation de runtime. La suite de #843 doit traiter quotas, lease, atomicité receipt/outbox/run, moteur worker et retries.
