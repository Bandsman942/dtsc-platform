# Cahier des charges — DTSC Data Intelligence & Consistency 2.0 (#1228)
Statut : cadrage de hotfix, implémentation et validation non certifiées. Référence normative : [Design 2.0](DTSC_FRONTEND_DESIGN_SYSTEM.md). Baseline main : 6aa0e7b4ead0f6dac1212fc6a78caa38a5effc32. Issue : #1228. Livraison : High, milestone Stabilisation des modules ERP ; branche fix/1228-data-intelligence-consistency. Aucun déploiement de branche.
## Objectif et symptômes
Stock, Valorisation et rapport journalier de stock de Clôture magasin afficheraient trois décimales même pour des unités entières ; les tableaux n'offrent pas uniformément de sous-totaux filtrés ; ST-MWW9CKWQ-A56124 du 25 novembre 2026 (capture utilisateur) affiche « Sortie de stock — article [ID interne] », débit 601 et crédit 311 pour 125,20. Le nom réel, devise, quantité et méthode de valorisation de cette écriture ne sont pas déduits de la capture. Causes racines à confirmer dans le dépôt. Ne pas traiter une anomalie d'imputation comme un simple problème de texte.
## Lot 1 — Audit et architecture
Inventorier routes, services, schémas, sources de vérité, composants, rapports, exports, tests, filtres, pagination, accès, entitlements et i18n de chaque surface ; identifier .toFixed(3), formats forcés, échelles Decimal/SQL, références article au lieu de noms, agrégations page-only et erreurs de double comptage. Pour chaque anomalie : fichier/ligne, cause vérifiée, risque, correction, QA. Vérifier conflits avec travaux en cours, PR #1227 et baseline main. Lire les contrats spécialisés, notamment ERP_INVENTORY_ACCOUNTING et posting. Vérifier les imputations SYSCOHADA (dont 601/311 et variation de stocks) sur sources comptables autorisées et méthode effective ; documenter conclusion par événement (réception, vente, retour, ajustement, transfert, perte). Aucune règle de compte imposée sans preuve.
## Lot 2 — Quantités et précision
Réutiliser l'unité catalogue canonique (nom, symbole, précision, conversions), unités achat/vente/stock. Centraliser validation/formatage et conversion exacte ; éviter source parallèle et hardcodes. Saisie entière ou fraction autorisée, contrôles front et back, messages FR/EN explicites. Cas 0, 1, 2, 3 décimales et autres configurations permises, zéro, valeurs limites, retours signés, lots, transferts, unités différentes, conversions exactes/incompatibles. Préserver précision Decimal des coûts unitaires, taux, montants et calculs. Gérer unités historiques/archivées, quantités incompatibles et configurations changées par signalement et trace, jamais arrondi ou réécriture silencieux. Déployer d'abord Stock, Valorisation, Clôture magasin puis surfaces catalogue et autres ERP.
## Lot 3 — Agrégations serveur
Service ou contrats communs à réutiliser : filtres normalisés, portée RBAC/tenant/boutique, pagination/tri indépendants du sous-total, liste et KPI cohérents. Somme, moyenne pertinente, moyenne pondérée, min/max, comptage/distinct, regroupement, ratios calculés sur agrégats ; ne pas sommer taux/prix ou snapshots de stocks/soldes. Total filtré toutes pages, total général du périmètre autorisé, total page lorsque utile. Quantités par unité/produit compatibles, monnaies séparées ou conversion historique traçable. Stocks et soldes à date, flux sur période, ouverture/clôture. Éviter doublons sectoriels, références invalides, valeurs nulles assimilées à zéro et fuites d'agrégats. Index/EXPLAIN si nécessaire, bornage, tests volumineux et simultanéité.
## Lot 4 — Design 2.0
Réutiliser workspace/list/table, filtres calendrier date exacte/plage, rail statuts, recherche métier, tri stable, pagination et réinitialisation. KPI réactifs à périmètre clairement défini, pieds de tableau sous-total filtré, page et général distincts, nombre de résultats, regroupements unité/devise. Menus colonne (tri, filtre, somme/moyenne/min/max/compte, regroupement, masquer si pertinent), préférences utilisateur, accès clavier et retour au contexte. États chargement/vide/erreur, toasts, aide, unités/symboles/codes devise. Mobile 320–1440 px, clair/sombre FR/EN, focus, scroll local, pas de données tronquées ou actions placeholders.
## Lot 5 — Libellés et intégrité comptable
Génération commune des libellés de posting : opération, noms produits/services, références commerciales, tiers, factures, paiements, boutique/entrepôt, compte, collaborateur lorsque autorisé. Snapshot au posting ; identifiants techniques protégés dans métadonnées audit. Pour écritures POSTED existantes, enrichissement de lecture fiable, ne pas réécrire le journal, ne pas inventer de nom si référence manquante ; distinguer nom actuel du snapshot. Cohérence journal, grand livre, détail, recherche, exports, navigation vers source autorisée. Contrôler toutes sources (achats, ventes, paiements, stock, ajustements, transferts, dépenses, paie et autres). Vérifier imputation selon lot 1 ; correction de nouvelles règles versionnée, correction de POSTED uniquement par contrepassation liée et nouveau posting via workflow autorisé, sans écriture automatique rétroactive. Équilibre, idempotence, période et audit intacts.
## Lot 6 — Rapports et exports
Même filtre, précision, libellé, agrégat et devise dans UI/PDF/XLSX/CSV. Métadonnées : entreprise, période, filtres, date génération, unités, référence devise ; branding et pagination PDF ; cellules numériques et formules pertinentes XLSX ; CSV stable et protégé contre injection, précision conservée. Imports/templates seulement là où pertinents et existants ; contrôles serveur, exports volumineux et autorisations. Tester concordance sur jeux filtrés multi-pages.
## Matrice minimale des domaines
| Domaine | Agrégats principaux |
|---|---|
| Stock / inventaires | entrée/sortie, ouverture et clôture, quantité par unité |
| Valorisation | valeur à date, coûts de sorties, ajustements, coût pondéré |
| Clôture magasin | stock à date, flux journaliers, cash/float et écarts |
| POS / ventes | quantités compatibles, ventes, remises, taxes, marge recalculée |
| Achats | quantités, coûts, taxes et frais |
| Factures clients/fournisseurs | facturé, payé, dû |
| Créances/dettes | ouverts, échus, recouvrés/réglés sans double compte |
| Trésorerie/caisse | entrées/sorties, soldes à date, écarts |
| Comptabilité | débits/crédits, solde à date, sources POSTED |
| Budgets/dépenses | prévisions, engagements, réalisations, états |
| Mobile Money / Telco | dépôts/retraits, commissions, float et recharges |
| RH/paie | salaires, primes, retenues, net ; droits RH |
| Projets / temps | budget, dépenses, durées compatibles |
| Actifs | acquisition, amortissement, VNC |
| Santé / pharmacie | facturation, stock, dispensation ; confidentialité clinique |
| Rapports consolidés / autres tableaux chiffrés | métriques typées, pas de double comptage |
Inventaire exhaustif des surfaces réelles à compléter pendant lot 1. Chaque surface marquée corrigée, déjà conforme (preuve) ou non applicable (motif). Pas de module fantôme ni nouveau droit implicite.
## Lot 7 — QA et recette OWNER_E2E
| ID | Scénario / attendu | Preuve initiale |
|---|---|---|
| Q01 | Créer unités 0/1/2/3 décimales ; les trois écrans prioritaires et exports suivent le catalogue | NOT_EXECUTED |
| Q02 | Saisie incompatible refusée front/API ; conversion exacte et historique incompatible signalé | NOT_EXECUTED |
| Q03 | Quantités, montants, coût moyen et taux conservent leurs précisions distinctes ; CDF/USD corrects | NOT_EXECUTED |
| A01 | Filtrer date exacte/plage, statut, recherche, boutique ; sous-total et KPI changent | NOT_EXECUTED |
| A02 | 51+ lignes sur plusieurs pages ; total filtré invariant au changement de page, total page distinct | NOT_EXECUTED |
| A03 | Unités incompatibles, multi-devise, taux historiques, coûts pondérés, ratios, distinct et min/max | NOT_EXECUTED |
| A04 | Plusieurs journées : stock/solde à date, pas de somme de snapshots ; retours/annulations et doublons | NOT_EXECUTED |
| A05 | Aucun résultat, zéro/null, requêtes concurrentes et grand volume, absence de N+1 | NOT_EXECUTED |
| L01 | Nouvelle sortie de stock et autres postings affichent désignation réelle et référence | NOT_EXECUTED |
| L02 | Renommer/archiver produit après posting ; snapshot stable, historique enrichi fiable ou signalé | NOT_EXECUTED |
| L03 | Vérifier comptes selon référentiel, débits=crédits, idempotence, périodes et absence de mutation POSTED | NOT_EXECUTED |
| L04 | Liens sources et audit, pas de divulgation RH/clinique/tiers sans permission | NOT_EXECUTED |
| X01 | PDF/XLSX/CSV concordent avec filtres, sous-totaux, libellés, unités, devises ; XLSX numérique | NOT_EXECUTED |
| S01 | Deux tenants, deux boutiques, plusieurs rôles ; accès direct API/exports et agrégats refusés hors périmètre | NOT_EXECUTED |
| U01 | FR/EN, clair/sombre, mobile/tablette/desktop, zoom/clavier, menus et toasts | NOT_EXECUTED |
| R01 | Régression POS, ERP commun, Health/Pharmacy et autres secteurs ; pas de double posting | NOT_EXECUTED |
| R02 | Gates : diff, Prisma, migrations si concernées, type-check, QA ciblée, régression, lint, build | NOT_EXECUTED |
| R03 | Revue finale et recette propriétaire du SHA exact ; pas de déploiement de branche | NOT_EXECUTED |
## Livraison et rollback
Réutiliser services et contrats existants, pas de dépendance ni migration sans nécessité. Migrations additives seulement ; pas de backfill POSTED. Toute intervention sur données historiques distincte, bornée, dry-run et autorisée selon AGENTS. Revert applicatif par PR, compatibilité schéma conservée. Pas de changement de secrets prévu. Tenir changelog, documentation technique/domaine, matrice preuves et runbook E2E. Issue et PR non clôturées tant que scope incomplet ; CI réelle + OWNER_E2E soumis à validation explicite avant merge main et unique production. Aucune preview ni vercel --prod manuel.

## Journal d'implémentation — tranche initiale
Inspection statique de main (aucun test exécuté) :
- `prisma/enterprise-master-data.prisma` : EnterpriseUnitOfMeasure.decimalScale est le référentiel existant, validation 0–6 dans master-data/schemas.ts.
- API inventory-valuation (ligne 172 baseline) : quantité toFixed(3) ; pas de select unité ni d'agrégats filtrés ; garde d'isolation Retail préservée.
- API retail/daily-close/stock-report (121–124 baseline) : 7 quantités forcées à 3 ; catalogue sélectionne uniquement code/nom ; Excel réutilise les strings ; groupBy borné aux articles de page en JSON.
- Workspace inventory-operations (107,405,437 baseline) : format numérique commun sans decimalScale malgré unité chargée dans API inventory. Vérifier aussi export de liste et détails des mouvements.
- Correction initiale : helper exact de présentation des Decimal, lecture unité existante dans les deux API, métadonnées de précision et valeurs non arrondies lorsque incompatibles. Adapter les consommateurs et afficher les alertes dans les interfaces et exports reste obligatoire. QA #1221 étendue sans neutraliser les assertions précédentes (attendus modifiés selon nouvelle configuration). Aucune migration ni mutation.
- Restant : UI Stock et Valorisation et rapport, formats XLSX, agrégats complets, libellés posting, audit SYSCOHADA, tous autres lots et certifications. Aucun E2E final à ce stade. Ne pas fusionner cette tranche isolée.

### Tranche suivante — 25 novembre 2026
- Valorisation : agrégat filtré par devise avant pagination, même WHERE, transaction RepeatableRead pour lignes/comptage/agrégat ; KPI par devise. Aucune somme de quantités hétérogènes.
- Stock : affichage catalogue sur liste et détail de solde, signalement de précision incompatible ; autres opérations à raccorder.
- Clôture : unité et alerte visibles ; export XLSX numérique si compatible avec la limite Excel de 15 chiffres, sinon conservation exacte en texte. CSV/print désignation et unité.
- Gouvernance PR : premier run Quality gates #45651800939 échoué sur liaison issue et labels ; métadonnées corrigées. Les tests métier de ce run étaient skipped. Aucun E2E final.
