# Hotfix Finance / RETAIL — synchronisation et Design 2.0 (2026-11-08)

## Périmètre unique

Cette livraison rassemble **15 modules Finance de quatre groupes**, sans nouvelle source de vérité ni duplication des opérations financières :

| Groupe | Modules couverts |
|---|---|
| Pilotage financier | Vue d'ensemble Finance ; Budgets et dépenses |
| Opérations clients & fournisseurs | Créances / factures clients ; Dettes / factures fournisseurs ; Paiements |
| Trésorerie & encaissements | Trésorerie ; Caisse ; Banque ; Rapprochements |
| Comptabilité & conformité | Comptabilité ; Fiscalité ; Clôture ; États financiers ; Immobilisations ; Valorisation des stocks |

## Synchronisation de l'activation RETAIL

La fonction « Facturation et encaissement RETAIL » exige la préparation **effective** à la comptabilisation (`resolveEnterpriseFinanceReadiness` avec `mode: POSTING`). Elle ne consulte plus `configuration.readinessStatus`, projection persistée pouvant rester à `DRAFT` après configuration des journaux, comptes, périodes et mappings.

- Les contrôles Finance sont évalués en direct, pour la même entreprise, à la lecture **et au moment de la mutation**, avec conservation des permissions RETAIL et des verrous de révision.
- Si Finance n'est pas prêt, l'interface présente chaque blocage (nom, raison, action et lien du module concerné) en français ou en anglais. Un simple statut « Comptabilité activée » n'est pas synonyme de « Prête pour la comptabilisation ».
- Après correction des éléments, utilisez « Actualiser », puis activez « Facturation et encaissement RETAIL ». Aucun forçage du contrôle n'est permis.

## Convention UI Design 2.0

- En-têtes et actions DTSC existants conservés ; recherches, listes compactes, statuts colorés, pagination et guidance du module.
- Filtres de **dates métier** : toutes dates / aujourd'hui / semaine / mois / **date précise par calendrier** / intervalle personnalisé. Les bornes sont inclusives, strictement validées dans les APIs des opérations concernées ; filtre de date et recherche sont appliqués *avant* pagination.
- Dans la vue d'ensemble de pilotage, les métriques sont un **instantané actuel**, non une série historique : le sélecteur historique est désactivé avec une explication pour éviter un résultat trompeur.
- La valorisation d'inventaire est une valorisation calculée actuelle : les dates historiques sont également désactivées tant qu'il n'existe pas de projection certifiée « à date ».
- Exports des données filtrées en **Excel (.xlsx), CSV et PDF** : identité de l'entreprise, titre et date d'édition, critères, indicateurs et registre paginé pour les PDF. L'extraction utilise les API tenant/RBAC, non un simple export de la page affichée ; garde-fou explicite à 1 000 lignes par document (affiner les filtres au-delà).
- Les montants multidevises ne sont **jamais additionnés** artificiellement dans les exports. Les colonnes conservent montant brut et code de devise ; les agrégations métier existantes restent séparées par devise.

## Templates et imports respectant la logique métier

| Module | Téléchargement | Import | Règles |
|---|---|---|---|
| Fiscalité | Modèle CSV ou XLSX « codes de taxes » | CSV/XLSX, jusqu'à 100 lignes/2 Mo | Prévisualisation ; validations du schéma métier ; unicité ; transaction atomique ; journal d'audit ; permission de création. |
| Comptabilité / Comptes | Modèle CSV ou XLSX « sous-comptes personnalisés » | CSV/XLSX, jusqu'à 100 lignes/2 Mo | Plan/version et compte parent existants, sous-compte descendant ; aucune modification des comptes système OHADA ; validation avant enregistrement. |
| Banque | Modèle CSV de lignes de relevé | Import CSV dans le formulaire bancaire existant | Mêmes champs que le parseur existant ; validation par le circuit d'import bancaire et de rapprochement. |

Les pièces financières soumises/validées, mouvements de caisse, écritures postées, paiements, rapprochements et clôtures **ne sont pas importés directement par modèle générique** : leurs contrôles de validation, rapprochement, idempotence et piste d'audit l'interdisent. Leur création et leurs éventuels circuits d'import dédiés restent les seuls canaux autorisés.

### Sous-comptes SYSCOHADA : exemple

Le modèle contient les colonnes `chartCode,parentCode,code,nameFr,nameEn,currencyCode`. Pour créer un sous-compte, récupérez le **code du plan versionné de l'entreprise** et le **code d'un compte parent actif**, puis choisissez un code descendant libre (exemple fictif : parent `571`, enfant `571001`). La présence du seul modèle SYSCOHADA dans l'entreprise ne suffit pas : le plan choisi doit déjà être installé et la permission de création est requise.

## Contrôles et E2E à effectuer avant fusion

1. Compte RETAIL multi-boutiques : activer la comptabilité, forcer un ancien `readinessStatus` non synchronisé, constater que le contrôle POSTING réel décide ; vérifier un blocage Finance authentique puis sa résolution et l'activation RETAIL.
2. Dans chacune des **15 pages Finance**, vérifier mobile/desktop, statut, recherche, pagination, date précise et intervalle ; les exports doivent couvrir plusieurs pages et porter les filtres du serveur.
3. Télécharger les modèles fiscal et comptable, les remplir, prévisualiser un CSV/XLSX valide et invalide (code dupliqué, compte parent absent, formule suspecte) ; l'import invalide ne doit créer aucune ligne.
4. Vérifier les permissions : collaborateur sans droit de création, autre entreprise, document supérieur à 2 Mo, formulaire malveillant, collision d'unicité et révision concurrente.
5. Comparer XLSX/CSV/PDF pour 0, 1, 50 et plus de 50 enregistrements ; vérifier les pages PDF, la mise en forme, les devises et les chiffres. Exécuter le test `node scripts/qa-finance-design2-four-groups.mjs` et les QA ERP Finance existantes.
6. Exécuter typecheck, lint, build et CI de PR ; attendre le **E2E final du propriétaire**. **Ne pas déployer la branche sur Vercel Preview ; production uniquement via `main` après fusion validée.**

## Retour arrière

Ce hotfix ne contient pas de migration de schéma. En cas de régression, revenir au code précédent via une nouvelle PR de revert sans effacer les référentiels créés par les utilisateurs. Les imports sont transactionnels et audités ; tout retour arrière de données nécessiterait une décision métier distincte.
