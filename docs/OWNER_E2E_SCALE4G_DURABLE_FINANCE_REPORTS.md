# OWNER_E2E — SCALE-4G durable Finance reports

Issue: #516

Run only against the exact final PR head after automated gates are green. Do not use a Vercel Preview; follow the repository production-only delivery policy.

## Required scenarios

1. Open `REPORTS` as an authorized organization member and create a `BUDGET_VS_ACTUAL` report. Confirm POST `/reports/generate` returns quickly with HTTP 202 and the UI shows a queued/processing state instead of blocking the workspace.
2. Leave the Reports module while the job is pending, return in the same browser session, and confirm tracking resumes from the organization-scoped stored job.
3. Wait for completion. Confirm the new report appears once, opens normally, has a real immutable `snapshotJson`, non-null `generationKey`, and `calculationVersion >= 1`.
4. Submit the exact same report parameters twice within the five-minute freshness window. Confirm the durable request is reused and no duplicate `EnterpriseReport` snapshot is created.
5. Exercise at least one `FINANCE_OVERVIEW` generation so Finance + Procurement source capability revalidation and multiple aggregate families are used in one durable job.
6. Remove/revoke the user's required REPORTS or source-module access after enqueue but before processing where practical. Confirm the job fails with a human message and no report is produced; no Prisma/queue/error code is shown in the UI.
7. Try to read a job id belonging to another organization or another non-visible actor. Confirm 404/403 semantics without leaked report metadata.
8. Export a completed READY report with the current bounded CSV path. Confirm download works, remains private/no-store, and spreadsheet-leading formula characters are neutralized if such data is present.
9. Confirm a failed/retrying job shows an exploitable localized state and allows the workspace to remain usable. Confirm FR and EN labels for queued, processing/retrying, ready and failed states.
10. Check mobile at approximately 390 px and desktop: no horizontal page overflow, no permanent spinner, creation dialog closes after queue acceptance, and existing report open/publish/archive actions still work.
11. Where worker diagnostics are available to the owner, confirm Finance report observability exposes queue state, completion/dead counts, terminal failure rate and average duration without financial amounts or snapshot content.
12. Confirm no Preview deployment was created for the feature branch.

## Historical regression acceptance

The existing `tests/e2e/hotfix-574-finance-owner.spec.mjs` has been updated to follow durable report generation until `COMPLETED` before asserting the immutable snapshot. This scenario remains part of the manual authenticated OWNER_E2E contract.

## Evidence rule

Only an explicit owner confirmation such as `E2E #<PR> bon` on the exact unchanged final PR head qualifies as `OWNER_E2E`. Any commit after that confirmation invalidates the evidence and requires rerun.
