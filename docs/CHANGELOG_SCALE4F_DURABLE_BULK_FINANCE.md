# Changelog — SCALE-4F (#515)

## Added

- file durable commune pour imports/exports volumineux basée sur `EnterpriseDomainEvent` ;
- worker interne `enterprise-bulk` avec lease, retry/backoff, dead state et métriques de queue ;
- import bancaire durable au-delà de 250 lignes, jusqu’à 10 000 lignes, avec chunks de 500 et reprise idempotente ;
- suivi de progression des imports Banque ;
- export Audit durable au-delà de 500 lignes avec artefact privé temporaire ;
- téléchargement Audit revalidant permissions, expiration et approbation sensible ;
- purge des artefacts expirés ;
- QA permanente SCALE-4F.

## Changed

- le rapprochement refuse désormais un relevé qui n’est pas complètement `IMPORTED` ;
- les petits imports/exports restent synchrones sous des seuils explicites ;
- les workspaces historiques Finance/Administration sont conservés derrière des wrappers de compatibilité afin de ne pas réécrire les parcours déjà OWNER_E2E.

## Database

Aucune migration. Réutilisation de `EnterpriseDomainEvent`, `EnterpriseBankStatement`, `EnterpriseBankStatementLine`, `AuditLog` et `EnterpriseApproval`.

## Deployment

Production uniquement depuis `main`. Aucun Preview Vercel pour la branche ou la PR.
