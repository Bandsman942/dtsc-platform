# RFC — WF-06 : automation avancée sans régression du moteur V1 (#819)

**Statut : proposition progressive, non activée.** Issue parent #819 ; tranche implémentée #837 (WF-06A). Dépendances #813/#817/#818 fusionnées ; base `main@0860a463` (16 octobre 2026).

## Invariants non négociables

- Le moteur V1 est un DAG séquentiel, ses runs demeurent épinglés à la version publiée, les modèles V1 ne sont jamais convertis destructivement.
- Le studio #818 et les API ne publient ni n'exécutent silencieusement une définition. Même en V2, les actions passent par les services métier, l'identité de l'acteur exécutant, les modules souscrits et les permissions/tenants.
- Les branches, boucles ou appels au sous-workflow **ne peuvent être activés** qu'une fois leur persistence, le protocole d'acquisition de lease et les tests de crash/duplication certifiés. Pas de JS/SQL/prisma/HTTP arbitraire, pas de secrets dans les payloads.
- Durée/volume/fanout/profondeur restent limités par des quotas serveur et un compteur transactionnel (pas par l'UI). La revue humaine de publication reste exigée.

## WF-06A — calcul horaire uniquement (PR candidate)

`lib/enterprise/workflows/advanced-schedule.ts` expose un contrat **purement calculatoire**:
`{ frequency: "DAILY" | "WEEKLY", timeZone: IANA, hour: 0..23, minute: 0..59, dayOfWeek?: 0..6 }`.
La clé d'occurrence = SHA-256 de la combinaison canonique `[organizationId,scheduleId,versionId,YYYY-MM-DD,HH:mm]`. Chaque date civile locale ne possède **qu'une** occurrence. `afterExclusive` est un instant UTC et la sortie `scheduledAt` est une date UTC ; jamais `new Date("YYYY-MM-DD HH:mm")` ni le fuseau du serveur.

**Politique DST choisie, à soumettre à l'acceptation** :
- *Heure manquante* (spring forward) : SKIP de cette date locale, sans translation implicite ; prochain jour/hebdomadaire.
- *Heure répétée* (fall back) : FIRST occurrence UTC uniquement. Si le scanner est rappelé entre les deux instants du pli, il passe au jour/semaine suivant. La clé locale est identique pour les instants du pli.
- Recherche bornée à 35 jours, résolution des offsets dans la fenêtre ±36h avec 13 sondages ; zones à décalage 30/45min supportées.
- Aucun autre cron/rrule, MONTHLY ni horaire subminute n'est accepté à ce stade. Pas d'effet ERP, base, API, worker, abonnement ou Vercel Cron modifié. Le contrat d'entrée peut évoluer seulement de façon versionnée.

### Contrat futur nécessaire AVANT activation du déclenchement

1. Table additive `EnterpriseWorkflowSchedule` : tenant, définition active, version publiée, timezone, fréquence, horaire local, `nextRunAt`, état, révision, créateur/membership, `enabledAt` et audit ; aucun schedule ne peut se lier à un workflow non publié.
2. Table additive `EnterpriseWorkflowScheduleOccurrence` : composite unique `organizationId + scheduleId + versionId + localDate + localTime` (ou `occurrenceKey` stable), dueAt UTC, leasedAt, attempt, execution receipt/runId et état ; TOUT write est atomique avec outbox/déclenchement. Le hash seul ne garantit pas l'unicité, **la contrainte DB la garantit**.
3. Claim transactionnel, pagination bornée, compare-and-swap de lease, workers concurrents, replay des jobs expirés, compteur quotas/abonnements, suspension lorsque l'organisation perd le module ou le membre les droits. Une occurrence refusée reste observable, jamais silencieusement perdue.
4. La source ERP n'est jamais « au hasard » : la planification doit disposer d'un contrat tenant/module explicitement autorisé pour identifier l'entité source, avec identité d'exécution auditée. Aucune impersonation du propriétaire du tenant.
5. Le `vercel.json` possède déjà un Vercel Cron interne pour workflow chaque minute ; la future orchestration s'y intègre, sans créer un Cron parallèle ou autoriser des previews. Le worker actuel sert les V1 ; aucun changement avant certification.
6. Migration/backfill additifs avec feature-flag initial OFF, aucune relecture rétroactive automatique ni double déclenchement à l'activation. Rollback : arrêt des nouveaux claims, conserver les occurrences/runs pour réconciliation, ne jamais supprimer les journaux.

## WF-06B — variables/mappings et conditions composées

Schéma Zod versionné de variables JSON scalaires/collections bornées ; adapter autorise explicitement champs source/destination par domaine et entitlement ; transformation par opérateurs statiques (sans script). Conditions `AND/OR` bornées en profondeur/nombre, réutilisant `workflowConditionError` et `Prisma.Decimal` ; le moteur V1 continue à utiliser le contrat plat. Champs confidentiels, documents bruts, jetons OAuth et montants hors autorisation ne transitent pas dans le contexte.

## WF-06C — fanout/join durables

Ne pas reprendre la contrainte V1 `@@unique(workflowRunId, workflowStepId)` pour les occurrences multiples. Introduire additivement `EnterpriseWorkflowStepOccurrence` (token ID, iteration, parent occurrence, branch ID, join key, état) + receipts idempotents par occurrence, taille de payload bornée. Join exige un set explicite de parents et une transaction CAS, en protégeant les tâches/actions métier d'une exécution double même sous workers concurrents. Émettre des événements bornés et audités, offrir reprise/cancellation sans compensation destructive.

## WF-06D — boucles, sous-workflows et échecs

Boucles avec `maxIterations`, `maxDuration`, profondeur et budget action global ; une boucle sans borne est interdite. Child run lié `parentRunId`/occurrence et tenant identiques, no recursion illimitée ; cancellation descendante, retry ciblé avec receipt, impossibilité de replay de START. Rollback du runtime V2 conserve les runs engagés et traite leur réconciliation hors-ligne.

## Certification et gates à exiger par tranche

- #837: test pur IANA/DST avec Paris, New York, Kinshasa, UTC, weekly, limites et key-scope, type-check/lint/régression/migration/build ; aucune « automation à l'heure » revendiquée.
- Activation du scheduler: tests vrais PostgreSQL, heures perdues et répétées, lease/retry/outbox, conflits simultanés, crash entre claim et publication de run, scopes de modules, quotas, désactivation et observabilité ; E2E avec occurrence réelle.
- Runtime branches/loops: 2 workers concurrents, replay, cancel, 100+ transitions sous limites, 3 tentatives, 2 tenants, seuil budget, payload confidentiel et compensation prohibée ; E2E humain distinct.
- Ne modifier `lib/enterprise/workflows/AGENTS.md` pour autoriser les cycles qu'après preuves V2 et sans supprimer l'invariant V1.

## Risque, gouvernance et livraison

WF-06A peut être revert sans migration ni effet. Les sous-tranches suivantes ne s'activent que si leurs critères de sécurité, migrations-from-scratch et revue humaine sont verts. Aucun branchement automatique vers WF-07 OAuth/MCP tant que #819 et ses dépendances ne sont réellement livrés.


## WF-06S1 — Persistance transactionnelle du calendrier (#841)

La première tranche de persistance (distincte de WF-06C fanout/join) ajoute un registre DISABLED et une table de reçus uniques tenant-scoped avec FKs composites ; réservations STAGED internes sous verrou et transaction unique pour le curseur, **sans** déclenchement de run, worker ni API. Voir [WORKFLOW_SCHEDULE_LEDGER_ADR.md](WORKFLOW_SCHEDULE_LEDGER_ADR.md). La politique DST SKIP/FIRST a été approuvée par OWNER_E2E #837 ; les conditions et mappings WF-06B ont été fusionnés après OWNER_E2E #839. **WF-06S2 doit encore implémenter activation et outbox/run atomiques, droits, abonnement, quotas, E2E de vrais horaires, reprise et observabilité.**
