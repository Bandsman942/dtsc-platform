# ERP — Runbook opérationnel final

## Avant déploiement

1. Vérifier le SHA de la PR et le SHA attendu de `main`.
2. Exécuter `pnpm prisma generate`, type-check, lint, toutes les QA et `pnpm build`.
3. Exécuter les migrations depuis une base vide.
4. Exécuter les audits sur une copie réaliste anonymisée.
5. Vérifier qu’aucun état de convergence bloquant ne subsiste.
6. Exécuter le gate final du programme de stabilisation :

```bash
node scripts/qa-erp-stabilization-final.mjs
```

Ce gate agrège readiness Finance, onboarding, RBAC, observabilité et convergence cross-module. Il ne remplace pas les tests production-like.

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

## Acceptance stabilisation #167

Sur le même head de PR, vérifier :

- Finance onboarding navigateur sur tenant neuf ;
- Sales, Procurement et Payroll vers le posting Finance commun ;
- isolation tenant hostile ;
- redémarrage du serveur avant la suite de clôture ;
- clôture de période et immutabilité de l'historique ;
- behavioral gate Shop 2 lorsque déclenché ;
- Delivery governance, Quality et Migration verts.

Les flux Inventory, Assets, Retail, Health et Pharmacy restent également couverts par les gates de registre/services/adapters et les suites dédiées existantes.

## Ordre de vérification Production

SHA mergé → SHA `main` → SHA Production → GitHub Release → migrations → build → authentification → tenant → navigation → Core → Finance → Pharmacy → Health → workflows → notifications → rapports → mobile → sécurité → intégrité comptable → absence d’écriture legacy.

Pour la clôture #173/#167 :

1. le SHA fusionné doit être celui validé par la CI ;
2. `main` doit pointer sur ce SHA ;
3. Vercel doit déclarer un déploiement `Production` `READY` pour ce SHA exact ;
4. la GitHub Release générée doit cibler le même SHA ;
5. seulement ensuite fermer #173 puis le parent #167.

Un preview Vercel désactivé ou normalisé n'est jamais une preuve de Production.

## Incident

- Suspendre la route ou le domaine affecté sans supprimer de données.
- Conserver les écritures, paiements, factures, lots et dossiers.
- Utiliser contrepassation/avoir pour toute correction financière.
- Réactiver uniquement une lecture historique, jamais un dual-write permanent.
- Documenter l’incident, le SHA, l’organisation, le domaine et la décision de reprise.

## Limite de portée

La réussite de la stabilisation ERP prouve les contrats techniques et opérationnels ciblés. Elle ne vaut pas certification réglementaire d'un plan comptable, d'une fiscalité nationale ou d'un secteur réglementé.
