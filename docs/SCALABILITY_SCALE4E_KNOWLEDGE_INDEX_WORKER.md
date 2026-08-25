# SCALE-4E — Indexation IA durable

Issue #458 · parent #357 · programme #352.

## Problème corrigé
L'upload de connaissance préparait le document puis lançait l'indexation via `after()`. Ce mécanisme n'apportait ni persistance de job, ni retry, ni lease, ni DLQ.

## Contrat
- event `PLATFORM_KNOWLEDGE_INDEX_JOB` dans `EnterpriseDomainEvent` ;
- `entityId = KnowledgeDocument.id` ; aucun texte, chunk ou embedding dans le job ;
- upload interactif : préparation puis enqueue, réponse HTTP 202 ;
- récupération périodique des documents `PROCESSING` préparés mais sans job ;
- worker dédié : batch 8, concurrence 2, lease 300 s, 5 essais, backoff exponentiel plafonné à 900 s ;
- claim PostgreSQL `FOR UPDATE SKIP LOCKED` ;
- état terminal `DEAD` ;
- document canonique relu avant chaque indexation ; un document `READY` rend le job idempotent ;
- workers workflow standard et isolé excluent ce type d'event ;
- endpoint interne `/api/internal/knowledge-index/process?batch=8`, protégé par secret ;
- cron Production toutes les minutes ;
- snapshots de file sans identifiants ni contenu documentaire.

## Sécurité
Le worker ne renvoie ni `documentId`, ni `userId`, ni `organizationId`, ni texte extrait. Les erreurs de file sont des codes internes stables.

## Validation
`scripts/qa-scale4e-knowledge-index-worker.mjs` est exécuté par Regression QA. Aucune migration Prisma n'est introduite.

## Rollback
Revert applicatif. Les documents déjà READY restent exploitables ; les events SCALE-4E peuvent être laissés inertes puis retraités après correction.
