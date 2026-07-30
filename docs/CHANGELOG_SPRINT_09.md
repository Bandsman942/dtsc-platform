# Changelog — Sprint 9 Common Workflow Engine

## 2026-07-30

### Ajouté

- Ajout d’un moteur commun de workflows pour les entreprises clientes, limité à l’orchestration des objets ERP Core v2 stabilisés dans les Sprints 6 à 8.
- Ajout des définitions, versions immuables après publication, étapes typées, transitions structurées, exécutions, step runs, timeline, action attempts et événements métier durables.
- Ajout d’une validation de graphe orienté acyclique avec exactement un START, au moins un END, contrôle des étapes orphelines, branches ambiguës, cycles et reachability.
- Ajout d’un registry statique d’adapters pour Task, Request, Meeting, Purchase, Budget, Expense et Report.
- Ajout des étapes START, CONDITION, ASSIGN, CREATE_APPROVAL, CREATE_TASK, DOMAIN_ACTION, NOTIFICATION, WAIT_UNTIL et END.
- Ajout de templates brouillons contrôlés pour les demandes internes, achats, budgets et dépenses.
- Ajout d’un workspace Workflows avec vues Définitions, Exécutions et À surveiller, readiness explicite, éditeur en liste ordonnée, timeline et actions retry/cancel.
- Ajout d’une route worker interne protégée par `WORKFLOW_WORKER_SECRET`, avec batch borné, lease, `FOR UPDATE SKIP LOCKED`, backoff et événements DEAD.
- Ajout d’une documentation technique/exploitation et d’une checklist QA Sprint 9 dédiées.

### Modifié

- `EnterpriseApproval` peut désormais référencer structurellement le workflow run et le step run qui l’attendent.
- Le système central de notifications accepte une clé d’idempotence pour empêcher les doublons produits par un retry de workflow.
- Le module entreprise WORKFLOWS ouvre désormais le workspace spécialisé Engine v2 tout en conservant le catalogue legacy en lecture seule.
- `qa:regression` inclut désormais `qa:enterprise-workflows`.

### Sécurisé

- Les définitions, versions, événements, runs, affectations, approvals, tâches et notifications restent strictement isolés par `organizationId` et membership client actif.
- Le rôle global DTSC ADMIN ne contourne pas le membership d’une entreprise cliente.
- Les conditions, placeholders, triggers et actions sont allow-listés; aucun JavaScript, SQL, HTTP arbitraire ou accès Prisma dynamique n’est accepté.
- Les payloads de l’outbox sont minimaux et n’incluent pas les métadonnées métier complètes, documents privés, données cliniques ou coordonnées bancaires.
- Le no-self-approval est préservé et une assignation introuvable bloque explicitement l’exécution.

### Fiabilisé

- Les événements ERP allow-listés sont copiés dans une outbox durable dans la même transaction que `EnterpriseOperationalEvent`.
- Les runs restent épinglés à leur version initiale.
- Les actions générées utilisent des clés d’idempotence stables.
- Les claims d’étapes et d’actions empêchent l’exécution concurrente du même effet métier.
- Les retries sont bornés et les erreurs TRANSIENT, BUSINESS, SECURITY, CONFIGURATION et TERMINAL sont distinguées.
- Les attentes temporelles sont persistées via `WAITING_TIME + resumeAt`.
- L’annulation arrête les étapes futures sans supprimer les actions déjà réussies ni tenter une compensation automatique.

### CI/CD

- Aucune Preview Vercel fonctionnelle n’est activée.
- `vercel.json`, `deploymentEnabled` et `ignoreCommand` restent conformes à la politique production-only.
- Le déploiement reste: feature branch → Quality Gates → PR → review → merge main → unique Vercel Production → `prisma migrate deploy` → `pnpm build` → vérification du SHA.
- La validation de la PR est pilotée par `.github/workflows/quality-gates.yml`: diff checks, génération Prisma, type-check, QA de régression, lint, build et migration-from-scratch.
- Le merge vers `main` n’est autorisé qu’après réussite des jobs `quality` et `migration` sur le head final de la PR.
