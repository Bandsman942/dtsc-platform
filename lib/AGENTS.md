# Règles locales — `lib/`

Ces règles complètent `../AGENTS.md` pour l'authentification, les sessions, les notifications Push et les services métier entreprise.

- Les durées de session sont contrôlées côté serveur. Ne jamais accepter une durée arbitraire envoyée par le client ni réintroduire une constante globale unique pour tous les utilisateurs.
- Une session glissante doit rester bornée par une durée absolue liée à l'authentification initiale. Un heartbeat, un changement de contexte ou un Web Push ne doit jamais réinitialiser cette durée absolue.
- Ne jamais utiliser polling caché, heartbeat permanent, Service Worker ou connexion LiveKit comme mécanisme pour maintenir artificiellement une session ou un processus web en arrière-plan.
- Web Push et authentification sont indépendants : recevoir un push ne renouvelle jamais une session et cliquer une notification ne contourne jamais les contrôles d'accès.
- Les payloads Push doivent rester minimaux et neutres par défaut. Ne jamais exposer automatiquement de données médicales, pharmaceutiques, RH, financières, juridiques ou autres informations sensibles sur l'écran verrouillé.
- Toute URL provenant d'un payload Push doit être normalisée vers une route interne DTSC et ne doit jamais devenir un open redirect.
- La clé VAPID privée reste strictement serveur et ne doit jamais utiliser un préfixe `NEXT_PUBLIC_`.
- Un échec Web Push est secondaire : il ne doit jamais rollback une transaction métier ou la création de la `Notification` persistée.

## ERP Core v2 — règles permanentes Sprint 6

- Tasks, requests, approvals and meetings in `ORGANIZATION` ERP contexts use their dedicated Sprint 6 models as the source of truth: `EnterpriseTask`, `EnterpriseRequest`, `EnterpriseApproval` and `EnterpriseMeeting`.
- `EnterpriseCoreRecord` remains a legacy/common compatibility model for domains not yet migrated. Do not create new generic `TASK`, `OPERATION`, `INTERNAL_REQUEST`, `VALIDATION`, `MEETING` or `MINUTES` records when a dedicated Sprint 6 model applies.
- Never create two editable sources of truth for the same Sprint 6 business object. A compatibility view or legacy history must be derived/read-only.
- Every ERP entity and every transverse relation must remain isolated by `organizationId` and active organization membership. Global DTSC roles never bypass organization membership.
- `EnterpriseEntityLink` must never connect objects from different organizations. Validate the source object server-side before creating a link.
- Dedicated domain state machines are enforced server-side. Do not reuse the legacy generic Core action map for Tasks, Requests, Approvals or Meetings.
- Sensitive transitions must be race-safe and use expected status plus optimistic revision or an equivalent atomic guard. Never silently overwrite a newer edit.
- Approval decisions must validate the designated approver, prohibit self-approval by default, validate the target organization and require a rejection reason. Sprint 6 supports a simple single pending approval per target; multi-step policies belong to the Workflow Engine sprint.
- Sector-specific tables remain the business source of truth. Common ERP tasks/requests are transverse work objects linked to sector data, not replacements for Pharmacy, Healthcare or future sector entities.
- Do not copy confidential sector detail into a broader ERP object. Prefer a minimal summary plus an authorized source link.
- `EnterpriseActivityRequest` remains useful for the Activities Enterprise experience, but new transversal requests are represented by a linked `EnterpriseRequest`; do not maintain parallel editable request workflows.
- Meeting participants must be active members of the same organization. Meeting minutes belong to `EnterpriseMeeting`; do not recreate `MINUTES` as a pseudo-meeting.
- Meeting decisions may create `EnterpriseTask` actions only through a linked, transaction-safe path that prevents duplicate task generation.
- Comments and operational timelines must stay bounded/paginated and reusable; do not duplicate four identical comment systems unless a domain-specific integrity rule requires it.
- Vercel deployments remain production-only from `main`; no feature-branch Preview deployment or manual production deployment is introduced by ERP Core work.

## ERP Core v2 — règles permanentes Sprint 8

- New organization ERP budgets, expenses and reports use `EnterpriseBudget`, `EnterpriseExpense` and `EnterpriseReport` as their sources of truth. Do not create new generic `EnterpriseCoreRecord` `BUDGET`, `EXPENSE` or `REPORT` records when dedicated models apply.
- Organization client finance is isolated from `DTSC_INTERNAL` HR & CFO finance (`HrcfoBudget`, `HrcfoExpense`, payroll and `FinancialAccount`) and from sector-specific financial or stock models.
- Budget totals, commitments, realized expenses and available amounts are calculated server-side with decimal-safe arithmetic. The client is never authoritative for a financial total.
- Never aggregate different currencies into one monetary total without an explicit FX engine. Sprint 8 has no FX engine.
- Purchase commitments and approved expenses must not double-count the same budget consumption. Purchase approval creates an idempotent commitment; approved expenses realize it; purchase cancellation releases its remaining amount.
- `EnterpriseApproval` is reused for budget and expense decisions. Do not create parallel financial approval engines or hidden amount thresholds.
- No user may self-approve a budget or expense in the normal workflow. Global DTSC roles never bypass active organization membership.
- `ACTIVE` budgets and `APPROVED` expenses are immutable in their financially material fields. Future amendment/reversal workflows must be explicit and auditable.
- `EnterpriseExpense` represents ERP budget consumption, not a bank payment, general-ledger entry or tax/accounting journal.
- `EnterpriseReport` is a derived immutable snapshot. Its JSON contains versioned aggregates and filters, never primary financial truth, private document contents, patient data or banking secrets.
- Report generation must use bounded server-side aggregates/grouping and keep currencies separated. Do not load the entire organization database into Node to build a report.
- Sprint 9 Workflow Engine may orchestrate the stabilized entrypoints, but Sprint 8 must not introduce BPMN, dynamic multi-stage approval chains or automation-builder behavior.
- Vercel remains production-only from `main`; intentionally disabled previews are expected and are never treated as functional validation.
