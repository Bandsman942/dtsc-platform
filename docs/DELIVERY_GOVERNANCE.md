# DTSC Delivery Governance

Ce document est la référence humaine du flux officiel de livraison DTSC Platform.

## Chaîne officielle

Besoin → Issue structurée → labels/priorité/impact/milestone → branche dédiée → Conventional Commits → PR structurée → Delivery governance → Quality/Migration → Review → squash merge `main` → Vercel Production → Production READY → GitHub Release.

## Conventions

- Branches : `feat|fix|refactor|chore|docs|security/<issue>-<slug>`.
- PR et commits : Conventional Commits.
- Toute PR matérielle (`delivery-impact:high|medium`) porte un `type:*`, `priority:*`, `area:*`, `delivery-impact:*` et un milestone actif.
- Un seul collaborateur direct est actuellement éligible au merge ; le ruleset garde donc `required_approving_review_count=0` tout en exigeant la résolution des conversations. Passer à 1 dès qu’un second reviewer éligible existe.
- Squash merge est la stratégie normale.

## CI canonique

`Quality gates` est l’unique source de vérité PR pour `Delivery governance`, `Quality` et `Migration`. Les QA spécialisées restent dans cette gate lorsqu’elles sont obligatoires. Le workflow iteration 08 séparé a été supprimé car sa QA est déjà incluse dans la Quality Gate canonique.

## Production et Vercel

- `vercel.json` reste production-only : `main` uniquement.
- Aucun `vercel --prod` depuis une branche feature.
- `production-release.yml` consomme le `deployment_status` natif publié par `vercel[bot]` pour l’environnement `Production`; le statut GitHub `success` constitue la preuve native du Vercel `READY`.
- Aucun secret Vercel supplémentaire n’est requis pour la Release : la preuve utilise l’intégration GitHub/Vercel native.
- En cas d’échec Production, une Issue blocker P1/high est créée ou actualisée ; aucune Release réussie n’est créée.

## Rollback

Rollback = revenir au dernier SHA/Deployment Production sain via une PR/hotfix traçable ou le mécanisme Vercel de rollback autorisé. Une correction urgente suit toujours Issue P0/P1 → `fix/<issue>-...` → PR courte → gates → review → merge → Production → Release.

## Release

Tag déterministe : `prod-YYYYMMDD-HHmm-<sha7>`. Le tag et la Release pointent sur le SHA Production exact. La création est idempotente par SHA/tag.

## Commandes

- `pnpm delivery:governance:check` : audit dry-run.
- `pnpm delivery:governance:sync -- --apply` : synchronisation explicite GitHub.
- `pnpm delivery:pr:validate` : contrat PR/branche/Issue/labels/milestone.
- `pnpm delivery:commits:validate` : Conventional Commits.
- `pnpm qa:delivery-governance` : QA ciblée.

## Sources de vérité dynamiques

Issues, PR, checks CI, milestones, déploiements Vercel et GitHub Releases. Aucun workflow ne committe un rapport dynamique directement dans `main`.
