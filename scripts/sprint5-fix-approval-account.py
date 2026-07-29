from pathlib import Path

TECH_MARKER = "<!-- SPRINT_05_PAYROLL_TECHNICAL -->"
CHANGELOG_MARKER = "<!-- SPRINT_05_PAYROLL_CHANGELOG -->"

technical_path = Path("docs/TECHNICAL_DOCUMENTATION.md")
technical = technical_path.read_text()
if TECH_MARKER not in technical:
    technical += r'''

<!-- SPRINT_05_PAYROLL_TECHNICAL -->
## Sprint 5 — Prestations approuvées vers paie DTSC

Le workflow de paie interne consomme uniquement les prestations approuvées via `getApprovedWorkForPayroll()`. `HrcfoPayroll` conserve la compatibilité des historiques existants et les nouvelles paies `workflowVersion = 1` suivent une machine d'état explicite : `DRAFT → PENDING_APPROVAL → VALIDATED → PAID`, avec branches `CHANGES_REQUESTED`, `REJECTED` et `CANCELLED`.

Les preuves opérationnelles sont figées dans `HrcfoPayrollWorkEntry` avec les minutes approuvées, la soumission source et la vraie date de travail. Une unicité partielle empêche qu'une même entrée de travail soit consommée par plusieurs paies actives. Les périodes mensuelles coupant une semaine Sprint 4 filtrent les entrées par `workDate`; une semaine 27 juillet–2 août est donc répartie selon les dates réelles, jamais entièrement imputée à un seul mois.

Pour un mois calendrier complet, la rémunération de base vient de `HrcfoEmployee.monthlyCompensation`. Les minutes approuvées restent une preuve et ne sont jamais transformées automatiquement en salaire, prorata ou retenue. Une période partielle exige un montant de base explicite et un motif. Toute prime ou retenue positive exige également un motif audité.

HR & CFO prépare, corrige, soumet et confirme le paiement. Le CEO approuve les paies standards et le COO approuve uniquement la paie du CEO. Le serveur réévalue le poste officiel et interdit toute auto-approbation, y compris pour ADMIN. DRAFT et PENDING_APPROVAL n'ont aucun impact financier. Lors de VALIDATED, le moteur existant `createValidatedTransactionInTx()` crée au plus une transaction `PAYROLL_WORKFLOW` idempotente; PAID réutilise cette transaction sans second débit.

Les bulletins et l'espace Activités restent propriétaires : le collaborateur voit uniquement ses paies et bulletins validés/payés, sans budget ni compte financier. Les paies historiques sans snapshot Sprint 4 restent lisibles comme legacy et ne reçoivent aucun faux lien de prestation.

Le déploiement reste Production Only : feature branch → GitHub Quality Gates → PR/review → merge `main` → Vercel Production → `prisma migrate deploy` → `pnpm build`. Aucun Preview Deployment n'est requis ou activé.
<!-- /SPRINT_05_PAYROLL_TECHNICAL -->
'''
    technical_path.write_text(technical)

changelog_path = Path("docs/CHANGELOG.md")
changelog = changelog_path.read_text()
if CHANGELOG_MARKER not in changelog:
    changelog += r'''

<!-- SPRINT_05_PAYROLL_CHANGELOG -->
## 2026-07-29 — Sprint 5 paie DTSC

### Ajouté
- Ajout du workflow de paie DTSC fondé uniquement sur les prestations Sprint 4 approuvées, avec snapshots de travail, liens `HrcfoPayrollWorkEntry`, couverture opérationnelle et historique `HrcfoPayrollReview`.
- Ajout des espaces dédiés HR & CFO pour préparer/soumettre/payer, CEO pour approuver les paies standards et COO pour contre-valider uniquement la paie du CEO.
- Ajout des protections PostgreSQL contre l'auto-approbation, les transitions arbitraires, la double consommation d'une prestation et la double transaction `PAYROLL_WORKFLOW`.

### Sécurisé
- Suppression de la paie du CRUD HR & CFO générique afin qu'un statut client ne puisse plus créer directement une paie VALIDATED/PAID ou provoquer une sortie financière.
- La rémunération mensuelle standard vient du dossier RH; les périodes partielles, primes, retenues et couvertures incomplètes nécessitent des motifs explicites et audités.
- Les collaborateurs ne voient que leurs propres paies et bulletins validés/payés; budgets et comptes financiers ne sont plus exposés dans leur vue ou leur bulletin.

### Compatibilité
- Les anciennes `HrcfoPayroll` restent consultables sans backfill artificiel de prestations Sprint 4. La migration Sprint 5 est additive et n'effectue aucun `DROP` ni réécriture destructive des historiques.
<!-- /SPRINT_05_PAYROLL_CHANGELOG -->
'''
    changelog_path.write_text(changelog)

print("Sprint 5 final documentation appended idempotently.")
