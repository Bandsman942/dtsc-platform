# WF-06S2A — Préparation d'horaires désactivés (#844, parent #843 / #819)

**Statut : PR de développement, jamais une activation.** Dépend de #841 (ledger transactionnel, PR #842, `main@dddcc2e4`, Vercel Production READY). Cette tranche est explicitement non exécutable.

## Chemin serveur créé

- `GET /api/enterprise/[organizationId]/workflow-schedules` : réponse paginée de 1 à 50 lignes, exclusivement `DISABLED`, filtrage tenant et type source ERP réellement lisible ; aucun horaire STAGED interne visible.
- `POST /api/enterprise/[organizationId]/workflow-schedules` : crée une ligne DISABLED uniquement ; le client fournit `workflowDefinitionId`, `workflowVersionId` et `schedule` (DAILY/WEEKLY, fuseau IANA, heure et jour éventuel). **Aucun champ `status` autorisé** et aucune action d'activation.
- La route vérifie session, contexte actif ORGANIZATION, membership/client, entitlement WORKFLOWS, permission de création, accès au module ERP source de la définition persistée, same-origin, rate limit awaited, audit et erreurs contrôlées.
- Le service `createDisabledWorkflowSchedule` revalide en transaction tenant, membership actif, définition ACTIVE non archivée, version PUBLISHED courante et liaison définition/version. Il conserve la version épinglée, n'effectue aucun transfert automatique lors d'une future publication.
- `getNextWorkflowOccurrence` calcule le premier curseur UTC futur. Politique DST SKIP (heure inexistante) / FIRST (heure doublée) conservée de #837. L'horaire est **DISABLED** même avec un `nextRunAt` renseigné.

## Frontière de sécurité

La création d'un horaire désactivé ne signifie pas qu'une entité source a été choisie ou qu'un acteur a reçu mandat d'exécution. `triggerEntityType` permet seulement d'identifier le module ERP nécessaire à la permission de lecture. Ni la route ni le service ne créent d'occurrence, event, outbox, run, tâche ou paiement. Le Vercel Cron existant et `worker-isolated.ts` ne sont pas raccordés.

Aucune sélection silencieuse d'utilisateur « système » ni reprise d'une autorisation ancienne. Les prochaines tranches de #843 doivent persister/contrôler l'entité source et le mandat d'exécution, effectuer l'évaluation récurrente du module et de l'abonnement, encadrer la cadence/catch-up, établir le claim lease, les états/retries et le commit atomique receipt → run/outbox. Rien de cela n'est prétendu livré dans #844.

## Assurance qualité

`node scripts/qa-workflow-844-postgres.mjs` est exécuté par **Quality et Migration** contre une DB PostgreSQL de test localhost ; la commande refuse toute URL distante ou sans `test` dans le nom DB. Preuves attendues :

- schéma strict et statut client ENABLED rejeté ;
- fuseaux IANA, règle DST FALL FIRST et prochaine occurrence ;
- séparation tenant/définition/version, version retirée et membership révoqué ;
- persistance DISABLED sans événement, receipt ou workflow run ;
- contrôles statiques des barrières API (les tests navigateur et autorisations différenciées restent à confirmer dans OWNER_E2E).

La CI est l'autorité sur Prisma, TypeScript, lint, QA régression, build et Migration. Toute validation non encore vérifiée reste `NOT_EXECUTED`.

## Risques et rollback

Le seul comportement exposé est la préparation serveur d'un horaire désactivé. Un client peut créer des drafts non consommés ; prévoir des quotas de nombre de drafts et un mécanisme d'archivage dans la suite #843 avant mise à disposition UI. Les créations actuelles sont bornées par rate limit (30/heure/utilisateur), mais **ce n'est pas un quota commercial**.

Rollback applicatif : supprimer/désactiver la nouvelle route par hotfix, sans modifier le schéma ni effacer le ledger. Aucune migration ni variable d'environnement supplémentaire pour cette tranche. Il est interdit de réduire les checks ou d'activer un status `ENABLED` pour contourner cette limite.

**OWNER_E2E #844 : NOT_EXECUTED** jusqu'à confirmation humaine. Aucune fusion/production pour cette tranche avant CI et validation.
