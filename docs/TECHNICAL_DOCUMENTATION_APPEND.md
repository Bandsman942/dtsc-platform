

## ERP Finance commune — Itération 3

<!-- TECHNICAL_DOCUMENTATION_FINANCE_V1 -->

Le schéma Finance est réparti entre `prisma/enterprise-accounting.prisma`, `prisma/enterprise-accounting-credit-note-items.prisma` et `prisma/enterprise-finance-reporting.prisma`. Les migrations `20260731163001` à `20260731163010` sont additives, ordonnées et testées depuis PostgreSQL vide.

Le moteur central se trouve dans `lib/enterprise/accounting/`. `posting-registry.ts` expose une allow-list statique d’événements ; `posting-service.ts` applique configuration, période, mappings, devises, snapshots de taux, partie double, verrou advisory, idempotence et transaction sérialisable. `journal-service.ts` et `reversal-service.ts` maintiennent l’immuabilité des écritures `POSTED`.

Les routes `/api/enterprise/[organizationId]/*` utilisent `authorizeFinanceRequest`: session, membership, module canonique, entitlement, permission, same-origin, Zod, `await rateLimit`, journalisation et gestion cohérente des conflits. Les workspaces sous `/enterprise-modules/FINANCE_*` partagent un shell responsive, mais conservent des endpoints dédiés.

Le Workflow Engine connaît les entités Finance via `lib/enterprise/workflows/adapters/finance.ts`. Les actions restent des allow-lists et appellent les services de domaine ; aucune transition financière n’est écrite directement par le moteur.

Les Quality Gates spécifiques sont `qa:enterprise-accounting`, `qa:enterprise-receivables`, `qa:enterprise-payables`, `qa:enterprise-treasury`, `qa:enterprise-financial-close` et `qa:enterprise-financial-statements`, tous inclus dans `qa:regression`.
