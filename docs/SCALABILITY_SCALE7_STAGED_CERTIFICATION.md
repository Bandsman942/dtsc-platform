# SCALE-7 — Staged load certification

## SCALE-7F — fermeture du 500-soak Dashboard

Deux soaks consécutifs sur `main@7cc7cca3a5ff352e4445b6cd9d74fbfb36130bef` ont confirmé un hotspot Dashboard sous plateau long, alors que la capacité DB globale reste faible (< 9 %), Redis reste OK et l’isolation tenant reste à 100 %.

- run `37021376106` : Dashboard P95/P99 1 618,11 / 2 598,45 ms ;
- run `37022663945` : Dashboard P95/P99 1 255,12 / 2 429,49 ms ;
- le second run fait passer Enterprise, Shop et Collaboration sous leurs seuils ;
- `idle-in-transaction` reste observé au maximum à 1 session, avec un âge de 0 à 0,01 s ; la gate reste strictement zéro.

SCALE-7F (#771) réduit le nombre de round-trips exacts du Dashboard sans cache ni approximation :

- `requireUser(session)` réutilise `idleTimeoutMinutes` déjà signé dans le JWT et ne relit la préférence en DB que pour une ancienne session ne contenant pas cette valeur ;
- `listUserIdentityLinksForWorkspace` résout le lien et l’organisation dans une seule requête SQL tenant/user-scoped ;
- abonnement personnel, usage du jour et nombre de documents sont regroupés dans une seule projection DB exacte ;
- les notifications, permissions et règles d’accès restent sur leurs chemins canoniques ;
- les SLO restent P95 < 1 000 ms et P99 < 2 000 ms ;
- `noIdleInTransaction` reste strictement `maxIdleInTransaction === 0`.

Aucun 500-spike n’est autorisé avant un nouveau 500-soak officiellement PASS.

## SCALE-7E — progression fondée sur les preuves CI_PROVEN

Le run Production SCALE-7D `37014598384` sur `main@649aeeae55f005827630d09e4f28a876bb3c918f` a certifié le 500-ramp **PASS**. Le 500-soak suivant (`37016167904`) a été bloqué avant k6 parce que l'ancien verrou de progression lisait le registre versionné `data/scalability/scale7-certifications.json`, encore vide et jamais alimenté automatiquement par le workflow.

SCALE-7E (#768 / PR #769) sépare désormais clairement deux responsabilités :

- le **registre versionné** reste une archive secret-free destinée à l'affichage CTO et à l'archivage manuel ;
- le **verrou d'exécution** consomme les preuves `CI_PROVEN` publiées par `github-actions[bot]` sur l'Issue #360 et recoupe chaque `githubRunId` avec l'API GitHub Actions.

Une preuve de progression n'est acceptée que si le run référencé est un vrai run SCALE-7 terminé en `success`, sur `main`, avec le SHA déclaré dans le résultat. Une preuve d'un SHA parent peut rester valable après un hotfix de gouvernance uniquement si le diff jusqu'au SHA courant ne touche que les fichiers SCALE-7 de workflow, vérification, QA et documentation explicitement autorisés. Tout changement applicatif/runtime invalide automatiquement la preuve et impose une nouvelle certification du profil préalable.

Ainsi, le ramp PASS `37014598384` reste admissible après SCALE-7E, mais il ne pourrait pas être réutilisé après une nouvelle modification de code applicatif.


## SCALE-7D — fermeture du workload Dashboard après #761

Les runs Production SCALE-7C sur `main@c2fb6051d6d4d12315000dab5e04fc3a92edb9af` ont fermé les régressions globales, isolation et idle-in-transaction. Le run #91 (`37004079918`) reste officiellement FAIL uniquement parce que le workload Dashboard dépasse encore les seuils : P95 1 149,06 ms et P99 2 447,86 ms, alors que les seuils restent P95 < 1 000 ms et P99 < 2 000 ms.

SCALE-7D (#764 / PR #765) :
- lance les lectures memberships et identity-links en parallèle ;
- borne la seconde rafale du workspace à neuf tâches DB-backed, cohérente avec `connection_limit=9` ;
- remplace le chargement des entitlements ERP complets par un résumé commercial workspace basé sur le contexte commercial canonique, sans charger modules ERP ni sous-secteur ;
- conserve tous les compteurs et données visibles exacts ;
- ajoute au rapport sanitizé les gates P95/P99 de Dashboard, Enterprise, Shop et Collaboration ;
- publie les percentiles workloads dans le commentaire OWNER afin que le statut du rapport ne puisse plus diverger de l'enforcement k6.

Aucun SLO n'est abaissé, aucun cache de droits n'est ajouté et aucun 500-soak n'est autorisé avant un 500-ramp officiellement PASS.

## SCALE-7C — fermeture du 500-ramp après #755

Le run Production `36987070876` sur `main@8597e83074acb9dc86c261d0a20ef4c00e5b18ab` reste **FAIL** malgré une forte amélioration : P95 1 034,80 ms, P99 2 197,14 ms, isolation 99,9142 % et un échantillon idle-in-transaction non nul. SCALE-7C (#760 / PR #761) conserve les mêmes SLO et `connection_limit=9`.

Le hotfix :
- réutilise la session déjà vérifiée par `/dashboard` et parallélise la lecture utilisateur avec sa préférence de durée de session, supprimant deux étapes séquentielles du chemin critique sans modifier les données affichées ;
- réutilise le fuseau de l’organisation déjà autorisée dans `business-context` et supprime une relecture `Organization` ;
- retente une sonde d’isolation une seule fois et uniquement après un échec transport (`status=0`), sans jamais transformer le timeout en succès ; la gate reste exactement 100 % ;
- conserve la gate idle-in-transaction à zéro et archive désormais le nombre maximal et l’âge maximal observés, sans SQL, utilisateur, tenant ni identifiant sensible.

Aucun 500-soak n’est autorisé avant un nouveau 500-ramp PASS en Production.
Si la nouvelle télémétrie confirme une session idle-in-transaction persistante, sa correction sera tracée par une Issue dédiée à partir de cette preuve Production ; aucune cause n’est présumée avant mesure.

Issue: #360
Parent programme: #352
Depends on: #359 / SCALE-6

## Objective

Certify DTSC Platform progressively at **500 → 1,000 → 2,500 → 5,000 simultaneous users** without turning a target into an unsupported capacity claim.

Each stage is tested with three explicit profiles:

- `ramp`: progressive ramp-up plus bounded plateau;
- `soak`: longer plateau for saturation/leak detection;
- `spike`: fast rise/drop/re-rise resilience.

A stage is certified only when all required profiles have archived PASS evidence for the relevant SHA/environment.

## Workload contract

`scripts/load/scale7-staged-certification.js` uses at least two authenticated tenant contexts and mixes:

- dashboard reads;
- notifications;
- common enterprise/ERP reads;
- Shop/Retail reads;
- collaboration reads;
- a low-frequency real AI request path governed by SCALE-6;
- explicit cross-tenant probes that must stay 403/404.

By default, the workflow provisions its dedicated multi-tenant auth pool through **GitHub Actions OIDC**. No cookie secret is required for this path.

The application accepts the provisioning request only when the OIDC token is cryptographically valid and all claims match the exact DTSC contract:

- issuer `https://token.actions.githubusercontent.com`;
- audience `dtsc-scale7`;
- repository `Bandsman942/dtsc-platform`;
- ref `refs/heads/main`;
- workflow `.github/workflows/scale7-staged-certification.yml`;
- event `issue_comment` or `workflow_dispatch`.

The managed pool uses two fixed synthetic organizations, no customer data, and synthetic identities that cannot authenticate with a product password. Sessions are signed by the application at run time and remain only in the GitHub Actions runner environment. The returned topology is never written to Issues, artifacts or the versioned certification registry.

The same OIDC verifier authorizes **only** `GET /api/admin/scalability/observability` for this exact workflow. An OIDC request must also carry an exact same-origin `Origin` header. The route keeps its existing `SECURITY_READ` path for human CTO users; OIDC is not a general Console bypass and does not authorize any other Administration DTSC route.

Because `/api/admin/*` is normally session-gated by `middleware.ts`, the middleware delegates only this exact observability path when a Bearer header is present. That delegation grants no access by itself: invalid or non-SCALE-7 bearers still fail in the route verifier. All other Admin APIs remain session/context protected in middleware.

To avoid measuring per-user AI/rate-limit ceilings as if they were platform capacity, the governed pool is deliberately larger than the minimum contract: it uses approximately **10% of the VU target**, i.e. 50 / 100 / 250 / 500 unique sessions for 500 / 1,000 / 2,500 / 5,000 VU, split across the two synthetic tenants.

An operator may still provide `SCALE7_AUTH_CONTEXTS_JSON` as an **operator override**. When present, the workflow uses it instead of OIDC provisioning. The same harness validation still requires at least two distinct tenants, unique sessions and the stage-specific minimum `max(8, ceil(targetVus / 100))`.

The AI path remains mandatory and intentionally represents about 1% of iterations so SCALE-6 user/organization/provider ceilings remain a governed subsystem rather than dominating the whole workload.

For SCALE-7B, that 1% workload uses the canonical **Enterprise AI** route `POST /api/enterprise/ai/chat`, bound to the current synthetic tenant with `useKnowledge=false` and `useTools=false`. The previous `/api/chat/v2` path is a PERSONAL chatbot surface and therefore measured STARTER/personal admission ceilings instead of the Enterprise organization provisioned for SCALE-7; it is no longer used as the representative Enterprise AI capacity probe.

Use only the managed synthetic organizations or an equivalent dedicated operator pool. Never point the certification harness at real customer records.

## SLO gates

Every run enforces:

- HTTP failure rate < 1%;
- aggregate P95 < 1,000 ms;
- aggregate P99 < 2,000 ms;
- checks > 99%;
- cross-tenant probe success = 100%;
- PostgreSQL connection utilization < 80%;
- no connection exhaustion;
- no idle-in-transaction sessions;
- Redis never observed as `UNAVAILABLE`.

The report additionally archives throughput, DB pressure, Redis state, queue state and AI concurrency/throttling signals.

## 500-ramp remediation baseline

The Production run `36906230174` on `main@036f550c1c9c470e335aa02b558b3be97d602def` established the SCALE-7B baseline after the Prisma pooled candidate 9:

- HTTP failure rate: 0.6218% — PASS;
- checks: 99.376% — PASS;
- tenant isolation: 100% — PASS;
- P95: 1,190.43 ms — FAIL;
- P99: 3,118.61 ms — FAIL;
- Dashboard: 1,950.49 / 3,504.73 ms;
- Shop/Retail: 1,206.44 / 2,598.60 ms;
- Collaboration: 871.71 / 2,284.22 ms;
- Enterprise: 725.13 / 1,776.83 ms;
- PostgreSQL: 63 / 901 max connections (6.99%), no P2024, no idle-in-transaction;
- Redis: OK.

SCALE-7B keeps `connection_limit=9` and all SLOs unchanged. Its first remediation targets are therefore application read-path fan-out and the representative AI surface, not additional database pool growth.

## Stage progression

The workflow enforces progression from **CI_PROVEN GitHub Actions evidence**, not from the static archive registry. `soak` requires a PASS `ramp` at the same stage, `spike` requires PASS `ramp` + `soak`, and 1,000/2,500/5,000 cannot start until the previous stage has PASS evidence for all three profiles.

The verifier reads only `SCALE7_RESULT_JSON` comments emitted by `github-actions[bot]` on Issue #360, validates the referenced Actions run and SHA, and fails closed when evidence is absent or inconsistent. A parent-SHA proof is reusable only across a bounded governance-only SCALE-7 diff; any application/runtime file change invalidates that lineage.

## Execution

Workflow: `.github/workflows/scale7-staged-certification.yml`

Manual inputs:

1. stage: 500 / 1,000 / 2,500 / 5,000;
2. profile: ramp / soak / spike;
3. exact confirmation: `RUN_SCALE7_CERTIFICATION`.

Required configuration:

- secret `VERCEL_AUTOMATION_BYPASS_SECRET`.

SCALE-7 no longer requires a human CTO session cookie. The workflow mints short-lived GitHub Actions OIDC tokens with audience `dtsc-scale7` and uses them only for the governed auth-pool endpoint and the Scalability observability snapshot. The normal Administration DTSC UI still requires a human session with `SECURITY_READ`.

Optional configuration:

- secret `SCALE7_AUTH_CONTEXTS_JSON` — operator override only. Without it, the workflow mints a GitHub Actions OIDC token and requests the managed synthetic pool from `/api/internal/scale7/auth-pool`.

Governed fallbacks reduce duplicate Production configuration:

- application origin: `SCALE7_LOAD_BASE_URL` overrides `SCALE1_LOAD_BASE_URL`; if neither repository variable exists, the canonical Production origin `https://app.dtsc-platform.com` is used.

The older SCALE-7 CTO-cookie fallback from #687 is intentionally superseded for this workflow because a human session can expire before a certification run. SCALE-1 may continue to use its own governed CTO session contract. SCALE-7 instead renews its short-lived OIDC authorization while sampling observability.

This does not weaken the workload topology. A dedicated SCALE-7 multi-tenant identity pool remains mandatory; it is either generated through the governed OIDC path or supplied explicitly by the operator override.

No workflow runs on push, pull request or schedule.

### Owner-only Issue #360 trigger

The repository OWNER may trigger the same bounded workflow by posting an exact command on Issue #360:

- `RUN_SCALE7_500_RAMP`, `RUN_SCALE7_500_SOAK`, `RUN_SCALE7_500_SPIKE`;
- the same form for `1000`, `2500` and `5000`.

The workflow rejects non-OWNER authors, comments outside #360 and unsupported commands. It does not bypass the versioned progression gate. After an owner-triggered run it posts a `SCALE7_RESULT_JSON` secret-free summary back to #360 so the evidence can be archived through the normal PR/CI path.

## Archived certification registry

GitHub Actions artifacts are the execution evidence. After a real run, download the sanitized `scale7-certification-report.json` and archive only its safe summary:

```bash
node scripts/load/archive-scale7-certification.mjs path/to/scale7-certification-report.json
```

This updates `data/scalability/scale7-certifications.json`. The versioned registry is intentionally secret-free and feeds **Administration DTSC → CTO → Scalabilité**, where archived certification is shown separately from live observability.

The registry stores no cookie, DSN, tenant identifier, prompt, response body or provider secret.

## Promotion rule

Do not attempt a higher user stage until the prior stage has the required PASS evidence. A FAIL is an engineering signal, not something to bypass.

## Rollback

All SCALE-7 repository changes are additive application/QA/workflow/documentation changes. Rollback is a revert. No Prisma migration is introduced by this iteration.
