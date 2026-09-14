# Reporting 2.0 — issue #634

## Objectif

Cette évolution professionnalise le module commun `REPORTS` sans créer de seconde source de vérité. Les données métier restent autoritatives dans leurs domaines ERP (budgets, dépenses, achats, etc.) et `EnterpriseReport` reste un snapshot dérivé, immuable et auditable.

Le périmètre couvre :

- génération pilotée par le catalogue canonique de rapports ;
- filtres de référence contrôlés et tenant-scoped ;
- refus explicite des rapports sans données exploitables ;
- détail responsive, drill-down autorisé et exports professionnels ;
- PDF multi-page indépendant du thème de l’interface ;
- planification récurrente et historique de livraison ;
- analyse de rapport par l’IA DTSC, bornée au snapshot déjà autorisé.

## Sources de vérité conservées

- `lib/enterprise/reporting/metric-registry.ts` : catalogue des rapports et métriques ;
- `EnterpriseReport` : snapshot historique dérivé ;
- `EnterpriseReportView` : vues enregistrées ;
- domaines Finance/Procurement : données métier sources ;
- `EnterpriseDomainEvent` et le worker bulk existant : génération durable ;
- registre des modules, entitlements et permissions : contrôle d’accès ;
- AI Tool Gateway : point d’entrée canonique des outils IA.

Aucun dual-write de montant, aucune table de jobs de rapport parallèle et aucune lecture IA directe des tables sources n’est introduit.

## Génération et filtres

Le formulaire de génération utilise le catalogue serveur et les `supportedFilters` de chaque définition. Les options budget, département, fournisseur, devise et catégorie proviennent d’une route protégée qui :

1. exige l’accès `REPORTS` ;
2. résout les capacités Finance et Procurement de l’utilisateur ;
3. applique `organizationId` à toutes les références ;
4. applique la visibilité métier des budgets ;
5. ne retourne pas de références d’une autre organisation.

Le backend revalide chaque identifiant reçu. Modifier manuellement un identifiant dans le navigateur ne permet donc pas de contourner la séparation tenant ou la visibilité de l’utilisateur.

Avant toute persistance, `generateEnterpriseReport` construit le snapshot puis vérifie qu’il contient des données exploitables. Un périmètre vide produit `REPORT_NO_DATA` avec un message métier et aucun `EnterpriseReport` vide n’est enregistré.

## Budget vs réalisé

Le snapshot `budget-vs-actual/v2` conserve, par devise et par ligne :

- planifié ;
- engagé restant ;
- réalisé approuvé ;
- disponible ;
- écart ;
- taux d’utilisation.

Les devises restent séparées. Aucune addition USD + CDF + EUR n’est autorisée sans taux historique explicite.

Les lignes peuvent porter un `deepLink` interne vers le contexte Budget. La vue professionnelle n’affiche cette action que pour un chemin interne validé commençant par `/enterprise-modules/` ; les URL externes, protocol-relative et chemins contenant un antislash sont refusés.

## Présentation et PDF

`ProfessionalReportView` reste la primitive partagée. Les changements Reporting 2.0 ajoutent :

- rail KPI horizontal borné sur petits écrans puis grille aux breakpoints supérieurs ;
- tableau avec scroll horizontal local seulement ;
- recherche et chargement progressif des lignes visibles ;
- fallback de logo ;
- drill-down contrôlé ;
- formulaire et détail en overlay plein écran sur mobile.

Le PDF Reporting 2.0 est généré avec un thème d’impression propre :

- fond clair et contraste fixe, indépendants du dark mode ;
- en-tête compact ;
- périmètre, KPI, graphique et interprétation ;
- tableau détaillé sur plusieurs pages ;
- orientation paysage lorsque le nombre de colonnes l’exige ;
- en-têtes de colonnes répétés ;
- pied de page avec référence et `Page X/Y`.

CSV et XLSX restent disponibles. XLSX conserve les feuilles Synthèse, Données et Interprétation ainsi que son graphique natif.

## Rapports planifiés

Deux modèles additifs sont introduits :

- `EnterpriseReportSchedule` ;
- `EnterpriseReportScheduleRun`.

Une planification contient uniquement sa configuration : type de rapport, fréquence, fuseau, heure, filtres et destinations. Une exécution (`Run`) conserve le lien vers le job durable et, lorsqu’il est produit, le rapport final.

Fréquences initiales :

- quotidienne ;
- hebdomadaire ;
- mensuelle.

Périodes dynamiques initiales : mois précédent, mois en cours, 7 derniers jours, 30 derniers jours, toutes les données disponibles et période fixe personnalisée.

### Idempotence

`(organizationId, scheduleId, dueAt)` est unique. Une même échéance ne peut donc pas créer deux runs persistés. Le run appelle ensuite `enqueueFinanceReportGeneration`, c’est-à-dire la file durable canonique déjà utilisée par la génération manuelle. Aucune deuxième file de jobs n’est créée.

### Distribution

Chaque exécution est archivée dans DTSC Platform. L’e-mail est une destination supplémentaire seulement si la capacité Zoho existante est configurée. Aucune nouvelle variable d’environnement n’est requise par #634 : le worker de planification réutilise `CRON_SECRET` ou `WORKFLOW_WORKER_SECRET`, et l’e-mail réutilise la configuration Zoho existante.

Les erreurs de livraison persistées sont des codes contrôlés (`EMAIL_FAILED`, etc.), jamais des erreurs brutes du fournisseur.

### Permissions

La lecture et la gestion des planifications sont réservées à `REPORTS.manage`, car une planification peut contenir des adresses de destinataires. Les mutations utilisent same-origin, Zod, rate-limit, ApiLog et AuditLog.

## IA DTSC — analyse de rapport

L’outil `ERP_REPORT_ANALYSIS_READ` est un outil `READ` du gateway IA existant.

Contrat :

- contexte `ORGANIZATION` obligatoire ;
- module `REPORTS` obligatoire ;
- `ENTERPRISE_AI.TOOLS.READ` ;
- plan minimum `BUSINESS` ;
- assistant autorisé selon la politique ERP existante ;
- visibilité appliquée avec `enterpriseReportVisibilityWhere` ;
- source exclusivement `EnterpriseReport.snapshotJson` déjà persisté et autorisé ;
- aucune requête directe aux budgets, dépenses ou achats pour enrichir silencieusement le rapport ;
- sortie bornée : filtres, KPI, graphique, insights et maximum 25 lignes de preuve.

La sortie fournit une politique explicite au modèle :

- l’analyse doit être annoncée comme générée par l’IA DTSC ;
- chaque conclusion doit être reliée aux valeurs fournies ;
- les causes ne peuvent pas être inventées ;
- le contexte métier absent ne peut pas être supposé ;
- les devises ne sont pas agrégées sans conversion explicitement présente ;
- `INSUFFICIENT_DATA` impose de signaler que les preuves sont insuffisantes.

Cette conception évite qu’une demande « analyse ce rapport » devienne implicitement une autorisation de relire tous les modules ERP.

## API ajoutée ou étendue

```text
GET   /api/enterprise/{organizationId}/reports/options
GET   /api/enterprise/{organizationId}/reports/schedules
POST  /api/enterprise/{organizationId}/reports/schedules
PATCH /api/enterprise/{organizationId}/reports/schedules/{scheduleId}
GET|POST /api/internal/report-schedules/process?batch=20
```

Les routes historiques de génération/détail/export restent en place et conservent leurs contrôles d’accès.

## Migration

Migration additive :

`prisma/migrations/20260914012000_reporting_2_schedules/migration.sql`

Elle crée uniquement les tables de planification/historique, leurs index et une relation composite tenant-aware entre run et schedule. Aucune migration historique n’est réécrite et aucun backfill n’est requis.

## QA automatique

`scripts/qa-reporting-2-634.mjs` contrôle statiquement les invariants propres à #634 :

- no-data avant persistance ;
- revalidation tenant des références ;
- sécurité des planifications ;
- réutilisation de la file durable ;
- contrat PDF multi-page ;
- responsive/drill-down ;
- branchement AI Tool Gateway ;
- snapshot-only et anti-causalité IA ;
- cron et i18n.

Le script est ajouté à `scripts/run-regression-qa-ci.mjs`. Cette inspection statique ne remplace ni type-check, ni lint, ni build, ni migrations, ni OWNER_E2E.

## OWNER_E2E requis

Avant fusion, le propriétaire doit valider au minimum :

1. génération d’un rapport avec données ;
2. génération avec périmètre vide et message métier sans création de rapport ;
3. filtres budget/département/fournisseur avec test négatif cross-tenant ;
4. détail sur 320, 360, 375, 390, 414, 768 et desktop sans overflow global ;
5. CSV, XLSX et PDF ouverts dans un lecteur réel ;
6. PDF multi-page avec tableau, en-têtes répétés et pagination ;
7. création d’une planification puis pause/reprise/archivage ;
8. livraison e-mail lorsque configurée et état sûr lorsqu’elle ne l’est pas ;
9. IA DTSC autorisée sur un rapport visible ;
10. IA DTSC refusée sur un rapport non visible ou sans accès REPORTS ;
11. réponse IA explicitement identifiée comme IA, fondée sur les valeurs et sans causalité inventée ;
12. FR/EN, thème clair/sombre et navigation clavier.

## Rollback

Rollback applicatif : revert de la PR #634. Les deux tables additives de planification peuvent rester présentes et inutilisées ; aucune suppression de données n’est nécessaire pour revenir au comportement antérieur.

Avant rollback applicatif, désactiver les planifications actives ou retirer le cron de planification pour empêcher de nouvelles exécutions. Les `EnterpriseReport` déjà générés restent des snapshots historiques valides et ne doivent pas être supprimés.

Aucune suppression SQL des tables de planification n’est nécessaire pendant un rollback d’urgence. Une suppression physique éventuelle serait une opération séparée, après observation Production et sauvegarde conformément à `docs/CONTRIBUTING.md`.

## Release note

**Reporting 2.0** apporte des rapports plus lisibles et fiables, des exports PDF multi-pages, des filtres métier contrôlés, des rapports récurrents avec archivage/livraison, ainsi qu’une analyse DTSC AI strictement fondée sur les données du rapport que l’utilisateur est déjà autorisé à consulter.
