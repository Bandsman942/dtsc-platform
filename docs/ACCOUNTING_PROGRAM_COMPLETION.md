# Programme Comptabilité DTSC — dossier final

Date : 2026-08-09

## Statut final du référentiel par défaut

Par décision propriétaire explicite du 2026-08-09, `OHADA_SYSCOHADA@0.1.0` est la **baseline officielle, immuable et le plan comptable par défaut de DTSC Platform**.

Cette qualification vaut dans la gouvernance produit DTSC. Elle ne supprime pas le mécanisme de version : toute version officielle ultérieure est enregistrée séparément, vérifiée, comparée, prévisualisée puis migrée de manière contrôlée. Une version déjà utilisée n’est jamais réécrite.

`accountingTemplateProductionReadiness()` peut retourner `ACCOUNTING_TEMPLATE_PRODUCTION_READY` pour cette version lorsque les contrôles du registre, les mappings sémantiques et les rubriques d’états sont valides.

## Architecture

`Framework → Template versionné → Plan entreprise → Mappings sémantiques → Journaux → Posting → Ledger → États / Reporting`

Principes opposables :

- `chart-template-registry.ts` est la source de vérité des frameworks et versions ;
- `OHADA_SYSCOHADA@0.1.0` est le défaut explicite, pas un fallback caché ;
- chaque organisation possède son propre plan et ses personnalisations ;
- les secteurs ERP publient des événements et des clés sémantiques, jamais des numéros SYSCOHADA codés en dur ;
- les écritures `POSTED` sont équilibrées, idempotentes et immuables ;
- les périodes fermées bloquent les nouvelles comptabilisations ;
- les règles pays/fiscales variables restent séparées du référentiel OHADA commun ;
- toute nouvelle version passe par source vérifiée, dataset, diff et migration contrôlée.

## Couverture sémantique

Le template couvre les besoins ERP communs déjà implémentés et des extensions transverses pour les futurs secteurs.

| Domaine | Exemples de clés |
|---|---|
| Ventes | `SALES_REVENUE`, `SERVICE_REVENUE`, `WORK_REVENUE`, `ACCOUNTS_RECEIVABLE` |
| Achats | `ACCOUNTS_PAYABLE`, `ACCRUED_PAYABLES`, `OPERATING_EXPENSE` |
| Fiscalité | `TAX_PAYABLE`, `TAX_RECEIVABLE`, `VAT_DUE`, `INCOME_TAX_PAYABLE`, `INCOME_TAX_EXPENSE` |
| Stocks | `INVENTORY`, `GOODS_INVENTORY`, `RAW_MATERIALS_INVENTORY`, `CONSUMABLES_INVENTORY`, `FINISHED_GOODS_INVENTORY`, `COST_OF_SALES` |
| Immobilisations | `FIXED_ASSET`, `SOFTWARE_ASSET`, `ACCUMULATED_DEPRECIATION`, `DEPRECIATION_EXPENSE`, `ASSET_CLEARING` |
| Paiements | `CUSTOMER_ADVANCES`, `SUPPLIER_ADVANCES` |
| Paie | `PAYROLL_EXPENSE`, `PAYROLL_PAYABLE`, `PAYROLL_WITHHOLDING_PAYABLE`, `SOCIAL_SECURITY_PAYABLE` |
| Trésorerie | `CASH`, `BANK`, `MOBILE_MONEY`, `BANK_CHARGES`, `FX_GAIN`, `FX_LOSS`, `CLEARING` |
| Financement | `BORROWINGS`, `PROVISIONS`, `INTEREST_EXPENSE` |
| Capitaux propres | `EQUITY_CAPITAL`, `RETAINED_EARNINGS` |

Les mappings réellement utilisés par Retail/Shop, Health, Pharmacy et l’ERP commun restent obligatoires. Les clés futures sont présentes sans devenir artificiellement obligatoires pour les événements actuels.

## États financiers

`OHADA_SYSCOHADA@0.1.0` contient des rubriques versionnées pour :

- `BALANCE_SHEET` ;
- `INCOME_STATEMENT`.

Chaque rubrique possède :

- code stable ;
- libellés FR/EN ;
- comptes contributeurs ;
- `normalBalance` (`DEBIT` ou `CREDIT`) ;
- ordre de présentation.

Le service d’états calcule les montants dans le sens normal de chaque rubrique. Les produits, dettes et capitaux propres ne sont donc pas affichés négativement uniquement parce que leur solde normal est créditeur.

La traçabilité reste : `rubrique → comptes → écritures POSTED`.

## Lifecycle et personnalisation

L’adoption conserve `templateCode=code@version` et reste tenant-aware. L’entreprise peut créer des sous-comptes contrôlés sans modifier la version source.

Les protections incluent :

- plan utilisé non remplaçable silencieusement ;
- comptes système/utilisés protégés ;
- mappings effectifs par date comptable ;
- absence de fallback silencieux ;
- activation explicite après diagnostics de readiness ;
- audit des actions sensibles.

## Version N → N+1

`diffAccountingTemplates` compare comptes, hiérarchie, types, règles de saisie, mappings sémantiques, journaux et rubriques d’états, y compris leur `normalBalance`.

`previewChartTemplateUpgrade` mesure l’impact organisationnel : écritures postées, comptes personnalisés et changements cassants.

Une mise à niveau automatique n’est autorisée que lorsqu’elle est sûre. Sinon `CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION` impose une décision contrôlée. Aucune écriture historique n’est réécrite.

Le manifeste `source-manifest.json` conserve pour les futures versions les gates : source fiable vérifiée, dataset canonique fingerprinté et autorisation de publication.

## UX et i18n Finance

Le socle Finance client est FR/EN et centralise :

- statuts métier ;
- enums métier ;
- dates et montants ;
- erreurs et actions correctives.

Les surfaces clientes ne doivent pas afficher directement :

- messages backend bruts ;
- erreurs Zod ;
- types Prisma ;
- UUID comme libellé ;
- codes d’erreur comme message principal ;
- clés sémantiques internes comme explication client.

`safeFinanceError()` transforme les erreurs connues et les familles d’erreurs en messages orientés action. Les helpers de collections/mutations n’exposent plus `body.message` directement.

L’onboarding présente désormais SYSCOHADA comme version officielle par défaut, les étapes d’activation, les actions correctives et la disponibilité des états financiers sans jargon développeur.

## Modules Finance couverts

Le passage UX/i18n couvre le socle partagé des modules :

- `FINANCE_OVERVIEW` ;
- `FINANCE_RECEIVABLES` ;
- `FINANCE_PAYABLES` ;
- `FINANCE_PAYMENTS` ;
- `FINANCE_TREASURY` ;
- `FINANCE_CASH` ;
- `FINANCE_BANK` ;
- `FINANCE_RECONCILIATION` ;
- `FINANCE_ACCOUNTING` ;
- `FINANCE_TAX` ;
- `FINANCE_CLOSE` ;
- `FINANCE_STATEMENTS` ;
- `FINANCE_ASSETS` ;
- `FINANCE_INVENTORY`.

## Acceptance production-like

Le workflow dédié reconstruit PostgreSQL depuis zéro, applique les migrations, seed l’entreprise ERP canonique, build Next.js en mode production et exécute Chromium sur `next start`.

Le scénario prouve :

1. onboarding FR 390 px ;
2. SYSCOHADA sélectionné par défaut ;
3. statut `ACCOUNTING_TEMPLATE_PRODUCTION_READY` ;
4. blockers devise/période puis correction ;
5. activation ;
6. RBAC non-membre ;
7. facture réelle à taxe zéro ;
8. approbation indépendante ;
9. écriture `POSTED` débit = crédit ;
10. idempotence du posting ;
11. balance équilibrée ;
12. compte de résultat avec revenu au signe normal ;
13. protection historique lors d’un upgrade ;
14. clôture `SUBMIT → APPROVE → CLOSE` ;
15. refus d’une nouvelle comptabilisation dans la période fermée ;
16. historique inchangé ;
17. onboarding EN 768 px sans overflow structurel.

## QA opposable

Les gates couvrent :

- intégrité du registre et du template par défaut ;
- FR/EN des comptes et rubriques ;
- couverture sémantique ;
- journaux ;
- absence de hardcodes réglementaires sectoriels ;
- strict `gt(0)` pour les lignes comptables optionnelles ;
- multi-tenant/RBAC ;
- lifecycle et périodes ;
- version/diff/migration ;
- états financiers ;
- UX/i18n Finance et sanitisation des erreurs ;
- E2E production-like.

## Procédure d’une nouvelle version officielle

1. Enregistrer la source et sa provenance.
2. Vérifier/fingerprinter le fichier source.
3. Produire et valider le dataset canonique.
4. Générer une nouvelle version immuable ; ne jamais modifier `0.1.0`.
5. Compléter mappings, journaux, états et traductions.
6. Exécuter les QA d’intégrité et de posting.
7. Produire le diff N→N+1.
8. Prévisualiser l’impact sur chaque organisation concernée.
9. Appliquer uniquement via workflow contrôlé.
10. Conserver l’historique et l’audit.

## Runbook incident

En cas de problème : identifier organisation et événement, vérifier `PostingBatch`/idempotence, période, journal, mapping effectif à la date comptable, compte résolu, devise/taux de change et écriture. Ne jamais modifier une écriture `POSTED`; utiliser contrepassation ou workflow autorisé et conserver la cause racine dans l’audit.

## Limites durables

- les overlays pays ne sont pas inventés sans source ;
- la fiscalité nationale reste versionnée séparément ;
- les migrations complexes d’un plan actif sont volontairement bloquées pour revue ;
- une nouvelle version officielle ne remplace jamais silencieusement la version déjà utilisée.
