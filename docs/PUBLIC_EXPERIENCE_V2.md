# DTSC Public Experience V2 — Hotfix #967

## Scope
Strengthen rich HTML sanitation, synchronize publication categories with the weekly editorial calendar and distinguish publishing chronology. No destructive migration and no second source of truth.

## Contracts
- Keep existing PublicPublication and PublicPublicationVersion, including historical drafts.
- Add DEMONSTRATION and REFLEXION_BUSINESS_TECH to the existing categories in validation, console and labels.
- Sort public resources by publishedAt descending, fallback order createdAt descending. Show publishedAt when available, otherwise createdAt.
- Parse HTML via parse5 and rebuild a strict whitelist. Reject scripts, SVG/MathML, iframes, handlers, executable protocols and arbitrary CSS. Preserve basic editorial styles, tables, safe images and external links.
- Historical content is sanitized on render without mutating the database. Permissions CONTENT_READ and CONTENT_MANAGE remain intact.
- Test existing articles/announcements visually for legacy formatting and media compatibility.

## Validation
Use pnpm qa:public-ux-01; then generate Prisma, type-check, responsive and standard QA, regression, lint, build, plus owner E2E for draft, publish, comments, images and mobile 320–1024.
Only CI results and explicit owner confirmation count as execution evidence.
No feature branch Vercel Preview/Production; merge main and verify Production READY plus release before claiming delivery.
Rollback: revert this focused change. No schema migration.

## Planned follow-up
#968 design/navigation; #969 commercial pages; #970 resources; #971 article reader; #972 editorial studio; #973 final quality and performance.
