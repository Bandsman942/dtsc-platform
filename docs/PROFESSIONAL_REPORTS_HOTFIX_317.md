# Hotfix #317 — Rapports professionnels DTSC

## Objectif

Le hotfix #317 remplace les représentations de rapports orientées système (snapshot JSON, codes de politique, enums et identifiants techniques) par un contrat de présentation métier commun à DTSC Platform.

Le contrat couvre les surfaces de rapport explicitement identifiées dans le repository au moment du hotfix :

- Rapports Enterprise Core ;
- états financiers et comptables ;
- reporting de paie ;
- rapports Pharmacie ;
- rapport consolidé Retail POS / Mobile Money / Télécom.

Le hotfix ne modifie pas les vérités comptables, de paie, de change ou sectorielles. Il transforme uniquement la manière dont les données autorisées sont présentées et exportées.

## Contrat partagé

La primitive `components/reports/professional-report-view.tsx` rend un `ProfessionalReportExportModel` normalisé avec :

- identité de l’organisation ;
- titre, période et périmètre ;
- cartes KPI ;
- comparaisons lorsque les données comparables existent ;
- graphique accessible avec valeurs textuelles ;
- interprétations déterministes, sans causalité inventée ;
- tableau détaillé ;
- recherche interactive dans les lignes ;
- filtres/périmètre lisibles ;
- exports CSV, Excel et PDF.

La recherche du tableau agit également sur le périmètre exporté depuis la primitive commune, afin qu’un utilisateur puisse explorer puis exporter le sous-ensemble visible sans exposer la structure JSON d’origine.

## Exports

### CSV

Le CSV exporte la donnée tabulaire métier et le périmètre utile. Le CSV historique Enterprise généré par l’API a également été corrigé pour utiliser la projection professionnelle : il ne contient plus le snapshot JSON, `sourcePolicyCode` ni `roundingPolicyCode`.

### Excel / XLSX

L’export XLSX est produit sans nouvelle dépendance lourde. Le classeur contient :

- une feuille `Synthèse` avec identité, périmètre et KPI ;
- une feuille `Données` ;
- une feuille `Interprétation` ;
- un graphique Excel lorsque le rapport contient une série comparable ;
- l’accent de marque fourni par le modèle, avec fallback DTSC.

### PDF

Le PDF est un document imprimable avec :

- identité/branding ;
- titre et période ;
- KPI ;
- visualisation ;
- interprétation ;
- tableau ;
- pagination et pied de page.

## Branding

Le hotfix propage le `name` et le `logoUrl` de l’organisation cliente aux workspaces de rapports lorsque cette donnée est configurée. Sans logo client, la vue utilise le fallback DTSC.

Le modèle d’export accepte également `accentHex`. Dans ce hotfix, les projections utilisent l’accent DTSC par défaut tant qu’aucune source canonique d’accent de marque client n’est disponible dans le modèle d’organisation existant. Le hotfix ne prétend donc pas inventer une configuration de couleur qui n’existe pas encore.

## Enterprise Reports

`EnterpriseReportsWorkspace` utilise désormais `buildEnterpriseProfessionalReport` et `ProfessionalReportView`.

La vue détaillée précédente qui exposait le snapshot n’est plus utilisée. Les codes internes tels que `CANONICAL_BUDGET_AND_APPROVED_EXPENSES` et `HALF_UP_2` restent autorisés dans les services/registre qui en ont besoin, mais ne font pas partie de la projection utilisateur ou de l’export professionnel.

L’historique métier du rapport reste disponible sous la présentation professionnelle.

## États financiers

Les états financiers utilisent une route de détail dédiée :

`GET /api/enterprise/[organizationId]/financial-statements/[id]`

La liste ne transporte pas le snapshot complet. Le snapshot est chargé à l’ouverture du détail et seulement après :

- `authorizeFinanceRequest(..., "FINANCE_STATEMENTS", "view")` ;
- contrainte `id + organizationId` côté requête Prisma ;
- journalisation API.

`buildFinancialStatementProfessionalReport` projette les familles suivantes :

- balance générale ;
- grand livre ;
- journaux ;
- compte de résultat ;
- bilan ;
- flux de trésorerie ;
- ancienneté des créances ;
- ancienneté des dettes ;
- trésorerie ;
- budget vs réalisé ;
- fiscalité ;
- immobilisations ;
- valorisation du stock.

Les champs purement techniques sont exclus du tableau de présentation. Les interprétations restent bornées aux données réellement présentes dans le snapshot immuable.

## Paie

Le détail d’une exécution de paie utilise le même contrat professionnel. Les KPI disponibles couvrent notamment le brut, le net, les retenues/ajustements et les effectifs selon le modèle de données existant.

Lorsqu’une exécution antérieure de même devise est disponible, la comparaison choisit la période strictement antérieure la plus proche, et non une exécution arbitraire.

Les bulletins individuels et contrôles existants restent sous le rapport agrégé. Le hotfix n’ajoute aucun nouvel accès aux données salariales et ne modifie pas les permissions de paie existantes.

## Pharmacie

Les rapports Pharmacie utilisent `ProfessionalReportView` tout en conservant leurs filtres métier et leur export CSV audité historique.

Avant projection :

- les UUID de produit, lot, fournisseur, utilisateur et département sont résolus vers leurs libellés lorsqu’ils sont disponibles ;
- les types de rapport sont projetés vers des libellés métier ;
- les statuts visibles sont projetés vers des libellés métier ;
- l’historique des exports et snapshots n’affiche plus directement les codes de rapport/statut dans les zones traitées.

## Retail

Le rapport consolidé Retail POS / Mobile Money / Télécom utilise le contrat professionnel partagé.

Règle de vérité multi-devise :

- les montants natifs restent séparés par devise ;
- la consolidation monétaire n’est présentée que lorsque les taux historiques nécessaires sont complets ;
- en cas de taux manquant, le rapport montre le manque et les opérations affectées au lieu de produire un total partiel trompeur ;
- les comparaisons et graphiques consolidés utilisent la devise de reporting uniquement quand cette consolidation est valide.

Le contrat de readiness Shop conserve en parallèle un état machine non visible `COMPLETE`/`INCOMPLETE` pour la QA et l’automatisation, tandis que l’interface présente uniquement les libellés métier localisés `Complète`/`Suspendue` ou `Complete`/`Withheld`.

## Sécurité et isolation tenant

Le hotfix ne retire aucun guard existant.

Enterprise Reports conserve :

- session ;
- `getEnterpriseFinanceAccess` ;
- `enterpriseReportVisibilityWhere` ;
- audit de l’export.

Le détail d’état financier ajoute explicitement :

- autorisation Finance ;
- contrainte d’organisation côté base ;
- journalisation API.

Paie, Pharmacie et Retail continuent d’utiliser leurs workspaces/routes et droits existants. Aucun endpoint public de données sensibles n’est introduit.

## Base de données et migrations

Aucune migration Prisma n’est nécessaire pour #317. Aucun backfill n’est requis. Aucune variable d’environnement supplémentaire n’est introduite.

## QA

`scripts/qa-professional-reports-317.mjs` est intégré à `scripts/run-regression-qa-ci.mjs`.

La QA garde notamment :

- KPI, graphique, filtres, recherche, interprétation et tableau dans la primitive partagée ;
- CSV/XLSX/PDF ;
- feuilles et graphique Excel ;
- branding ;
- suppression de l’ancienne vue snapshot Enterprise ;
- absence de `HALF_UP_2` et de la source `CANONICAL_*` de l’incident dans les surfaces gardées ;
- RBAC/visibilité Enterprise ;
- isolation tenant et autorisation Finance ;
- intégration Finance, Paie, Pharmacie et Retail ;
- règle multi-devise Retail ;
- absence des codemods/workflows temporaires de livraison.

Les derniers contrats de types sont également couverts par le type-check CI : KPI financiers typés selon `ProfessionalReportExportModel`, réduction numérique des buckets, propagation du logo uniquement vers les workspaces qui l’acceptent, et fallback de nom d’organisation sur le chemin d’administration Pharmacie historique.

La CI complète doit également prouver type-check, régression, lint, build et contrats de migrations existants.

## OWNER_E2E requis avant merge

Le propriétaire doit vérifier au minimum :

- le rapport Enterprise qui exposait auparavant le JSON brut ;
- un état financier ;
- un rapport de paie ;
- un rapport Pharmacie ;
- le rapport consolidé Retail ;
- ouverture réelle des exports CSV/XLSX/PDF ;
- desktop + mobile ;
- thèmes clair + sombre ;
- FR/EN sur les surfaces qui supportent ces locales ;
- logo client quand configuré et fallback DTSC sinon ;
- clavier/focus/touch ;
- absence de codes techniques visibles ;
- absence de régression d’accès inter-tenant ou de permissions.

Aucune PR #317 ne doit être fusionnée avant cette preuve OWNER_E2E.

## Rollback

Le hotfix est sans migration. Le rollback applicatif consiste à revert le commit de merge de #317. Les snapshots, écritures comptables, exécutions de paie, données Pharmacie et données Retail ne nécessitent aucun rollback de données, car le hotfix ne les modifie pas.