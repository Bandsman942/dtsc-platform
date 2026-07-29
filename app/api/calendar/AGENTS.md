# Calendar API rules

These rules extend the root `AGENTS.md` for `app/api/calendar/**`.

- In `DTSC_INTERNAL`, collaborators manage only their own recurring availability and schedule exceptions. Resolve the write owner from `session.userId -> HrcfoEmployee -> employee.id`; never trust an arbitrary `collaboratorId` from a request body.
- Keep read visibility separate from write ownership. CEO, COO, HR & CFO and authorized technical roles may receive team/organization read visibility without gaining CRUD ownership of another collaborator's schedule.
- Availability is planning data only. Never create worked-time, timesheet, payroll, salary, deduction or payment data from availability.
- Recurring weekly availability and dated exceptions/absences are distinct business concepts even while Sprint 3 keeps the shared `CollaboratorAvailability` compatibility table.
- Calendar conflict checks for DTSC internal events must use effective availability after applying dated exceptions and absences.
- Preserve `ORGANIZATION` calendar behavior unless a tenant-isolation or security correction is explicitly required.
- Past schedule history must not be silently rewritten. Use effective periods/versioning for recurring planning and lock fully past exceptions.
- Mutating calendar routes must keep same-origin protection, strict Zod validation, awaited rate limiting, audit logging and organization scoping.
- Absence notifications must never expose sensitive reasons in push payloads.
- Do not introduce Sprint 4 worked-time validation or Sprint 5 payroll logic in calendar routes.
