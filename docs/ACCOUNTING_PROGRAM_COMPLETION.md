# Programme Comptabilité DTSC — clôture technique des itérations 3 à 8

Date : 2026-08-09

## Statut important

`OHADA_SYSCOHADA@0.1.0` est un **bootstrap provisoire non officiel du SYSCOHADA révisé 2017**. Il est utilisable pour développer, tester et mettre en service le moteur comptable dans le périmètre autorisé par la gouvernance DTSC, mais il ne constitue ni une reproduction officielle OHADA ni une déclaration de conformité réglementaire.

Le statut `ACCOUNTING_TEMPLATE_PRODUCTION_READY` est explicitement interdit pour cette version tant que les conditions de l’itération 8 ne sont pas remplies : source réglementaire suffisamment fiable pour le dataset, revue comptable, rubriques réglementaires validées, QA complète et approbation humaine.

## 1. Architecture finale

Le moteur sépare désormais les responsabilités suivantes :

`Framework → Template versionné → Plan entreprise → Mappings sémantiques → Journaux → Posting → Ledger → Reporting de gestion / Reporting réglementaire`

Principes :

- le framework décrit le cadre comptable ;
- le template est une source immuable, versionnée et sourcée ;
- chaque organisation reçoit sa propre copie de travail ;
- la personnalisation ne modifie jamais le template ;
- les modules ERP publient des événements et des clés sémantiques, pas des numéros de comptes réglementaires ;
- les règles pays sont isolées dans des overlays sourcés ;
- la fiscalité opérationnelle reste dans `FINANCE_TAX` ;
- les états de gestion sont distincts des états réglementaires.

## 2. Itération 3 — adoption et lifecycle

### Filiation

`EnterpriseChartOfAccounts.templateCode` conserve une référence versionnée `code@version`, par exemple :

`OHADA_SYSCOHADA@0.1.0`

Cette stratégie évite une migration destructive tout en conservant la filiation exacte.

### Adoption

`adoptDraftChartTemplate` :

- vérifie que le template est publié ;
- refuse l’application sur un plan déjà rempli avec une autre source ;
- refuse une adoption destructive après écritures `POSTED` ;
- copie comptes, groupes, mappings et journaux ;
- reste idempotent pour la même référence ;
- conserve le plan en `DRAFT` jusqu’à l’activation explicite.

### Readiness

`getAccountingChartReadiness` vérifie notamment :

- devise fonctionnelle ;
- période ouverte ;
- présence de comptes ;
- filiation template ;
- couverture sémantique du template ;
- mappings effectifs de l’organisation ;
- journaux requis ;
- comptes de trésorerie comme avertissement contextualisé ;
- configuration fiscale comme avertissement contextualisé.

Chaque diagnostic possède un code stable, une sévérité, un message FR/EN et une action corrective lorsqu’elle est pertinente.

### Personnalisation

Un plan issu d’un template accepte des sous-comptes personnalisés contrôlés :

- parent obligatoire ;
- code prolongeant le code parent ;
- type et sous-type hérités ;
- compte non système ;
- isolation organisation stricte.

Un compte utilisé dans une écriture, un mapping, un compte financier ou comme parent ne peut pas être désactivé brutalement.

## 3. Itération 4 — semantic accounting layer

Le registre `semantic-account-registry.ts` définit le contrat commun ERP → comptabilité.

Chaque clé comporte :

- domaine ;
- libellés FR/EN ;
- catégorie ;
- types et sous-types de comptes attendus ;
- caractère obligatoire pour le posting ;
- autorisation ou non d’un fallback ;
- événements consommateurs ;
- statut de dépréciation éventuel.

Le resolver `semantic-account-resolver.ts` :

- est tenant-aware ;
- utilise la **date comptable de l’écriture** pour l’effectivité ;
- refuse un mapping futur ou expiré ;
- refuse un compte inactif ou archivé ;
- refuse un type/sous-type incompatible ;
- n’utilise aucun fallback silencieux ;
- conserve le support des comptes explicites `ACCOUNT_ID:*` pour les comptes financiers déjà résolus par le moteur.

Les adapters Retail, Health et Pharmacy restent indépendants de SYSCOHADA.

## 4. Itération 5 — journaux, pays et fiscalité

### Journaux

Le registre recommandé couvre les journaux opérationnels nécessaires au moteur :

- ventes ;
- achats ;
- banque ;
- caisse ;
- Mobile Money ;
- paie ;
- stock ;
- immobilisations ;
- opérations diverses ;
- journal général ;
- ouverture ;
- fiscalité.

Les journaux sont copiés dans l’organisation et restent personnalisables sans modifier le template source.

### Overlays pays

`country-accounting-overlays.ts` définit le contrat :

- pays ;
- version ;
- dates d’effet ;
- compatibilité framework/template ;
- comptes recommandés additionnels ;
- overrides sémantiques ;
- exigences de reporting ;
- provenance.

Le registre est volontairement vide tant qu’aucune règle nationale n’a été suffisamment sourcée et revue. DTSC ne fabrique pas de taux, obligations ou règles pays.

### Fiscalité

Le template peut recommander des comptes nécessaires à une mécanique fiscale, mais les taux, catégories, dates d’effet et obligations nationales restent dans `FINANCE_TAX` ou dans un overlay pays validé.

## 5. Itération 6 — reporting

Le service historique `statements-service.ts` reste la couche de **reporting de gestion** : balance, grand livre, résultat, bilan, trésorerie et états auxiliaires.

Le nouveau `regulatory-statements-service.ts` est une couche distincte :

- elle exige un plan actif et une filiation template connue ;
- elle lit uniquement des écritures `POSTED` ;
- elle utilise `financialStatementMappings` du template ;
- chaque ligne conserve la liste des comptes contributeurs ;
- elle refuse explicitement la génération si aucune rubrique réglementaire validée n’existe.

Pour `OHADA_SYSCOHADA@0.1.0`, `financialStatementMappings` reste vide. Le moteur doit donc afficher que le reporting réglementaire n’est pas encore validé au lieu de présenter les états de gestion comme conformes.

## 6. Itération 7 — onboarding, UX et guides

`FINANCE_ACCOUNTING` affiche un assistant de mise en service au-dessus du workspace Finance existant.

Il permet :

- création du plan entreprise ;
- sélection du template ;
- adoption explicite ;
- installation/vérification des journaux recommandés ;
- lecture du readiness ;
- activation lorsque tous les blockers sont corrigés ;
- lecture du statut du reporting réglementaire ;
- affichage permanent de l’avertissement du bootstrap non officiel.

Le composant est responsive et les mutations sont masquées aux utilisateurs non gestionnaires, tout en restant systématiquement protégées côté API.

Le guide natif FR/EN `accounting-onboarding-guide.ts` explique :

- choix du référentiel ;
- plan entreprise ;
- comptes système/personnalisés ;
- journaux et mappings ;
- readiness ;
- activation ;
- états ;
- changement de version ;
- limitations du bootstrap.

## 7. Itération 8 — version, migration et gouvernance

### Diff

`diffAccountingTemplates` compare :

- comptes ajoutés/retirés ;
- libellés ;
- parent/hiérarchie ;
- type/sous-type ;
- règle de saisie directe ;
- statut système/contrôle ;
- mappings sémantiques ;
- journaux ;
- rubriques d’états.

### Preview organisationnelle

`previewChartTemplateUpgrade` ajoute :

- nombre d’écritures `POSTED` ;
- nombre de comptes personnalisés ;
- détection des changements cassants ;
- décision `requiresHumanDecision` ;
- décision `canApplyAutomatically`.

### Application

Une mise à niveau automatique n’est autorisée que sur un plan `DRAFT/READY`, sans écritures `POSTED`, sans customisation et sans changement cassant.

Toute autre situation renvoie `CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION`.

Aucune écriture historique `POSTED` n’est modifiée ou réécrite.

### Production readiness

`accountingTemplateProductionReadiness` conserve les blockers réglementaires. Pour `OHADA_SYSCOHADA@0.1.0` :

- `TRUSTED_REGULATORY_SOURCE_REQUIRED` ;
- `REGULATORY_STATEMENT_MAPPINGS_NOT_VALIDATED` ;
- `ACCOUNTING_REVIEW_REQUIRED` ;
- `HUMAN_OWNER_APPROVAL_REQUIRED`.

## 8. Matrice ERP → clés sémantiques

| Domaine | Exemples de clés |
|---|---|
| Ventes | `ACCOUNTS_RECEIVABLE`, `SALES_REVENUE`, `TAX_PAYABLE` |
| Achats | `ACCOUNTS_PAYABLE`, `TAX_RECEIVABLE`, `OPERATING_EXPENSE` |
| Stock | `INVENTORY`, `COST_OF_SALES`, `GOODS_RECEIVED_CLEARING` |
| Paiements | `CUSTOMER_ADVANCES`, `SUPPLIER_ADVANCES` |
| Paie | `PAYROLL_EXPENSE`, `PAYROLL_PAYABLE`, `PAYROLL_WITHHOLDING_PAYABLE` |
| Immobilisations | `FIXED_ASSET`, `ASSET_CLEARING` |
| Trésorerie | `BANK_CHARGES`, `CASH_VARIANCE_EXPENSE`, `CASH_VARIANCE_INCOME` |
| Health | utilise les mêmes clés communes, sans dépendance SYSCOHADA |
| Pharmacy | utilise les mêmes clés communes, sans dépendance SYSCOHADA |
| Retail / Shop | utilise les mêmes clés communes, sans dépendance SYSCOHADA |

## 9. QA opposable

`scripts/qa-accounting-program-150-155.mjs` vérifie :

- présence des couches lifecycle/semantic/overlay/reporting/version/UX/guide ;
- identité et statut non officiel du bootstrap ;
- absence de rubriques réglementaires inventées ;
- couverture des clés de posting nécessaires ;
- journaux requis ;
- resolver tenant/date-aware ;
- protections lifecycle ;
- refus de production-readiness du bootstrap ;
- absence de numéros de comptes SYSCOHADA hardcodés dans les adapters sectoriels.

Le script est intégré au gate `qa:enterprise-accounting` via `qa-enterprise-accounting-checks.mjs`.

## 10. Procédure d’ajout d’un pays

1. Identifier une source réglementaire fiable et exploitable.
2. Enregistrer autorité, référence et date de vérification.
3. Créer un overlay versionné sans modifier le framework commun.
4. Définir seulement les différences réellement requises.
5. Tester les dates d’effet et la compatibilité template.
6. Ajouter/mettre à jour la configuration fiscale dans `FINANCE_TAX` lorsque la règle est fiscale.
7. Ajouter les QA et la documentation.
8. Soumettre à revue comptable/juridique selon la règle de gouvernance.

## 11. Procédure de validation d’une nouvelle version

Avant publication :

- source fiable vérifiée ;
- dataset validé ;
- codes uniques ;
- hiérarchie valide ;
- mappings sémantiques complets ;
- journaux cohérents ;
- rubriques réglementaires validées si elles sont déclarées supportées ;
- diff N→N+1 produit ;
- scénario d’impact tenant testé ;
- aucune mutation silencieuse ;
- tests posting débit=crédit, reversals et idempotence ;
- isolation multi-tenant et RBAC ;
- onboarding FR/EN ;
- guide mis à jour ;
- approbation humaine avant `ACCOUNTING_TEMPLATE_PRODUCTION_READY`.

## 12. Runbook incident

En cas de problème de posting :

1. identifier l’organisation et l’événement ;
2. vérifier le `PostingBatch` et son idempotency key ;
3. vérifier période et journal ;
4. vérifier le mapping sémantique effectif à la date comptable ;
5. vérifier le compte résolu et son statut ;
6. vérifier devise/taux de change ;
7. ne jamais modifier une écriture `POSTED` directement ;
8. utiliser une contrepassation ou un workflow comptable approprié ;
9. conserver l’audit et la cause racine.

## 13. Limites connues

- Le bootstrap SYSCOHADA 2017 est non officiel.
- Aucun overlay pays n’est publié sans source validée.
- Aucune rubrique réglementaire SYSCOHADA n’est déclarée supportée dans la v0.1.0.
- Une migration complexe d’un plan actif déjà utilisé nécessite une décision humaine et un plan de transition ; le moteur la bloque plutôt que de deviner.
- La revue humaine comptable reste obligatoire avant toute qualification réglementaire de production.
