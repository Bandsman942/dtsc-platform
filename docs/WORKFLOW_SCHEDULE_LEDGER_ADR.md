# ADR — WF-06S1 : registre durable d'occurrences, inerte par défaut (#841, parent #819)

**Statut : candidate (PR DRAFT), non activée.** Base vérifiée `main@12e0bdfd`, en production READY ; dépendances #837 (DST SKIP/FIRST) et #839 (conditions/mappings) fusionnées.

## Problème résolu

Les occurrences calculées par WF-06A n'avaient pas de garantie de persistance : un scan répété à l'heure d'hiver, deux workers ou un crash pouvaient théoriquement dériver vers plusieurs actions. La clé SHA-256 est utile comme identifiant mais **n'est pas une contrainte DB**.

## Contrat de persistance additive

- `EnterpriseWorkflowSchedule` enregistre `organizationId`, la **définition et sa version cohérentes par FK composite**, fuseau IANA/frequency/heure, cursor UTC `nextRunAt` et révision.
- `EnterpriseWorkflowScheduleOccurrence` enregistre **uniquement** tenant, schedule, version, date locale et heure locale, UTC due et `occurrenceKey` SHA-256 ; pas de données métier, pièces jointes, entité source, crédits, identité d'exécution ni secret.
- Index unique sur `[organizationId,scheduleId,workflowVersionId,localDate,localTime]` et index unique sur `occurrenceKey`. Une FK triple empêche qu'un reçu change de tenant ou de version. La relation composite schedule→version→définition empêche qu'un horaire pointe vers une version d'un autre workflow.
- Contrôle DB `status` strict : horaires `DISABLED` (défaut), `STAGED` (tests internes uniquement), `PAUSED`. **Pas de `ACTIVE` ou `ENABLED`** tant que WF-06S2 n'est pas certifiée. Les reçus ne disposent que de `RESERVED` (pas de consommation). Aucune route/worker de production n'importe le service WF-06S1.
- Migration additive `20261016190000_workflow_schedule_ledger` et contrainte UNIQUE sur `EnterpriseWorkflowVersion(organizationId,id,definitionId)` (les lignes existantes satisfont déjà cette unicité). Aucune migration appliquée n'est réécrite, aucun backfill, aucun drop.

## Contrat de réservation transactionnelle

`reserveDueStagedWorkflowOccurrence(orgId, scheduleId, asOf)` n'est **pas** un dispatcher. Dans une unique transaction PostgreSQL :

1. `SELECT ... FOR UPDATE SKIP LOCKED` avec tenant + identifiant précis, statut STAGED et `nextRunAt <= asOf`. Une seconde exécution simultanée ne bloque pas et ne réserve pas la même échéance.
2. Vérification : définition ACTIVE non archivée, version PUBLISHED, version courante attachée à la bonne définition ; fréquence/zone validés par le schéma WF-06A.
3. Recalcul de l'occurrence au milliseconde près à partir de `nextRunAt - 1 ms`. Refus du deuxième instant d'une heure répétée, des heures inexistantes et des curseurs corrompus ; aucune auto-correction silencieuse.
4. Insertion du reçu via `createMany(skipDuplicates)` et progression `nextRunAt`/révision par CAS dans **la même transaction**. Relecture/replay de la date n'ajoute pas un deuxième reçu (la UNIQUE fait foi) ; le curseur passe à la prochaine date canonique. Échec de l'une des écritures → rollback du tout.
5. La réservation **ne crée ni workflow run ni événement de domaine**. Elle n'a pas d'effet sur les tâches/paiements/comptes, n'active pas de calendrier ni de cron.

## Risques, gardes d'activation et suites

- Le service est un point d'entrée interne de démonstration du ledger : aucune interface publique et aucun wiring au worker. **Son appel par une future route** exigera authentification, same-origin, membership actif, module/abonnement/permission, quotas/cadence, audit, source/acteur attestés, catch-up borné et contrôles anti-duplication transactionnels avec run/outbox.
- Le journal `RESERVED` ne veut pas dire `EXECUTED`. La transformation en `ENQUEUED/CLAIMED/COMPLETED/FAILED`, les leases, la reprise crash, l'observabilité et la déduplication du run source seront certifiés dans **WF-06S2**, issue distincte avant activation réelle.
- Une version peut être retirée entre deux réservations : vérification de `currentVersionId` refuse une version non courante. Pas de migration implicite des horaires vers la nouvelle version, et pas de rattrapage silencieux.
- Rollback applicatif = ne pas importer le service (état par défaut), interrompre toute future utilisation expérimentale, laisser persister les tables et leurs reçus pour audit ; jamais DROP des données après déploiement. Pour un rollback de développement avant production, supprimer uniquement la migration neuve **non appliquée**.

## QA et preuves attendues

`scripts/qa-workflow-841-postgres.mjs` sur une DB PostgreSQL `localhost/*test*` avec vraie migration : 12 réservations concurrentes pour la même échéance DST New York, UNIQUE tenant/date/heure, cursor CAS, replay, débordement des contraintes FK multi-tenant/versions, DEFAULT DISABLED, entrée invalide et absence d'ERP run. Intégration obligatoire au job **Quality** et au job **Migration** sur base vierge, plus Prisma generate, type-check, lint, régression et build. **OWNER_E2E #841 requis avant fusion**. L'E2E d'exécution à heure prévue est, lui, réservé à WF-06S2.
