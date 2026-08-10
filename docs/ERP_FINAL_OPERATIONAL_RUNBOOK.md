# ERP — Runbook opérationnel final

## Avant déploiement

1. Vérifier le SHA de la PR et le SHA attendu de `main`.
2. Exécuter `pnpm prisma generate`, type-check, lint, toutes les QA et `pnpm build`.
3. Exécuter les migrations depuis une base vide.
4. Exécuter les audits sur une copie réaliste anonymisée.
5. Vérifier qu’aucun état de convergence bloquant ne subsiste.

## Audits

```bash
pnpm audit:erp-cutover -- --dry-run --json --output artifacts/erp-cutover.json
pnpm audit:financial-integrity -- --json
```

Les rapports ne contiennent que des identifiants techniques d’organisation, des comptes et des statuts agrégés. Ils ne journalisent aucune donnée médicale ou financière sensible en clair.

## Métriques à surveiller

- `legacy_write_attempts`
- `deprecated_route_hits`
- `sector_sync_failures`
- `duplicate_posting_attempts`
- `unmapped_sector_records`
- `unallocated_payments`
- `orphan_financial_documents`

Les tentatives de mutation legacy sont dérivées des `ApiLog`/`AuditLog` portant `legacyWriteAttempt` ou une action `*_WRITE_ATTEMPT_BLOCKED`.

## Ordre de vérification Production

SHA mergé → SHA `main` → SHA Production → migrations → build → authentification → tenant → navigation → Core → Finance → Pharmacy → Health → workflows → notifications → rapports → mobile → sécurité → intégrité comptable → absence d’écriture legacy.

## Incident

- Suspendre la route ou le domaine affecté sans supprimer de données.
- Conserver les écritures, paiements, factures, lots et dossiers.
- Utiliser contrepassation/avoir pour toute correction financière.
- Réactiver uniquement une lecture historique, jamais un dual-write permanent.
- Documenter l’incident, le SHA, l’organisation, le domaine et la décision de reprise.
