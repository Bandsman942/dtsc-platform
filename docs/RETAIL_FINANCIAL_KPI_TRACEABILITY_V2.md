# RETAIL — Traçabilité financière v2 (issue #1117)

**Statut : lots 1 et 2 partiellement codés, non livrable / E2E non validé.**  
**Branche de livraison conforme :** `feat/1117-retail-financial-kpi-traceability-v2` (synthèse de la branche de travail initiale, conservée à titre d'archive).  
**Base :** `main@c85b8f845a148bc3c9df64cdb5fc9d07b8e446c9` (PR #1111 fusionnée).  
**Dépendances parallèles :** PR #1114 et #1115. Pas de fusion, preview, migration ou déploiement de cette branche.

## 1. Ce qui est réellement réalisé

- Registre interprétatif exhaustif des 22 KPI existants dans `lib/enterprise/retail/financial-metric-definitions.ts`.
- Chaque KPI précise sa source opérationnelle/comptable, sa base temporelle et ses limites de lecture en FR et EN.
- Étiquettes visibles sur chaque carte : **Flux de période**, **Solde actuel**, **Émission sur période · allocation à date**.
- Nouveau test de contrat `pnpm qa:retail-financial-kpi-v2` ; aucun test existant désactivé.
- Première correction P0 : les comptes sans `availableBalance` n'utilisent plus `operationalBalance` comme substitut. Le serveur transmet la couverture manquante jusqu'aux consolidations, cartes et exports sous la mention « Non déterminé » ; aucun montant disponible global n'est revendiqué pour ce périmètre incomplet.
- Le drill-down COGS validé en #1111 est conservé, sans changement de calcul ni de permission.
- **Lot 2, tranche A (implémentée, non certifiée) :** API GET `/api/enterprise/[organizationId]/retail/financial-drilldown`, lecture seule et pagination bornée des douze autres cartes (invoices, allocations, créances, recettes Finance, écritures postées, trésorerie, dépenses, commissions, marge Télécom et POS historique).
- **Lot 2, tranche B (implémentée, non certifiée) :** composant `RetailFinancialDrilldown` accessible depuis les cartes autorisées, filtres dates/boutique/devise/recherche, sous-totaux indépendants des pages, colonnes de preuves, liens vers les modules concernés via `buildEnterpriseObjectDeepLink`.
- **Contrôle serveur indépendant par métrique :** rôle OWNER/ADMIN entreprise et droit RETAIL_POS, puis modules souscrits : FINANCE_ACCOUNTING / FINANCE_RECEIVABLES / FINANCE_PAYMENTS / FINANCE_BUDGETS / FINANCE_TREASURY / MOBILE_MONEY_AGENCY / TELCO_TOPUPS.
- **Boutiques historiques :** l'API de détail accepte les boutiques archivées de l'organisation et leur conserve leur nom ; ne supprime pas les archives. Aucun droit de consultation inter-tenant n'est déduit d'un identifiant fourni par le navigateur.

**Important :** ce détail reproduit les sources et filtres existants, mais n'est pas encore un rapprochement certifié ni un E2E. L'écran affiche des montants distincts en devise native et une somme non déterminée pour la trésorerie incomplète. Les exports exhaustifs restent hors de ce lot et relèvent de #1110.

Ces éléments ne créent aucune donnée comptable et ne modifient aucune écriture ni aucun solde source. Seule la présentation des disponibilités incomplètes est corrigée. Ils ne constituent pas une validation des autres montants existants.

## 2. Écarts toujours ouverts (ne pas déclarer corrigés)

1. **Trésorerie disponible** : première correction de non-substitution et de visibilité des montants manquants effectuée. Restent à construire : lecture détaillée des comptes, rapprochements, réservations, historiques à date, taux de couverture et audit serveur indépendant.
2. **Périmètre historique** : `site-overview/route.ts` initialise les boutiques avec `status: ACTIVE` et `archivedAt: null`. Les agrégats anciens des boutiques archivées doivent figurer séparément dans la consolidation, sans exposer de faux « sites actifs ».
3. **Soldes à date** : créances ouvertes/échues et comptes financiers sont des soldes présents ; ne jamais les présenter comme une reconstitution historique à partir des dates `from/to`.
4. **Avoirs sur factures de période** : `invoices` est une cohorte d'émission valorisée nette des avoirs présents ; il faut produire une vue « avoirs émis pendant la période » distincte.
5. **Comptes non attribués** : pas d'attribution boutique inventée, et rapprochement ledger/boutiques par devise.
6. **Exports** : le périmètre de la page détaillée, le nombre de lignes et les filtres doivent être explicités ; l'export exhaustif durable fait l'objet de #1110.

## 3. Lot 1 — Contrat financier canonique

Définir, avec les sources ERP réelles, `PERIOD_FLOW`, `CURRENT_BALANCE` et les cohortes mixtes ; devise source et taux historisé, date métier et fuseau, statut de comptabilisation, rattachement boutique actuel/historique/non attribué, qualité de la preuve. Calculs monétaires en `Prisma.Decimal`, écritures `POSTED` uniquement pour les métriques comptables, aucune source de vérité concurrente.

**Critères de passage :** tests unitaires des formules, cas nuls, différences de devise, avoirs, rétroactivité, fermetures boutique et vérification des propriétés de réconciliation.

## 4. Lot 2 — Détails des 12 cartes restantes (première implémentation en cours)

- `financeCollections` → paiement, allocation, facture, compte, rapprochement ;
- `invoices` → facture, lignes, TVA/HT/TTC, remise, avoirs et journal ;
- `outstanding` / `overdue` → créances par client, ancienneté et événements à date ;
- `postedRevenue`, `postedGrossMargin`, `postedOperatingResult` → lignes postées signées, comptes, contrepassations, charges ;
- `treasuryAvailable` → comptes, positions, réservations et rapprochements ; ne pas fabriquer un disponible absent ;
- `expenses` → demande, budget, approbation, paiement et écriture ;
- `mobileMoneyCommission`, `telcoMargin` → opérations et rapprochements prestataire/comptabilité ;
- `posSales` → tickets hérités, régularisations, justificatifs et statut de convergence.

Chaque vue : API GET tenant-scopée, RBAC module + boutique, recherche, tri et pagination serveur, lien vers pièce autorisée ; jamais de mutation de livres ni d'écritures.

## 5. Lot 3 — Design 2.0 et gouvernance admin

Dashboard consolidé + boutique + canal : badges de fiabilité, visualisations d'évolution uniquement pour les flux datés, comparaison de boutiques avec devises sur axes distincts, graphique/tableau accessible, alertes cliquables, vues FR/EN et modes clair/sombre. Préférences persistées côté serveur (ordre des cartes, favoris, période et seuils) sans modifier les chiffres, les permissions ou les états comptables.

## 6. Lot 4 — Rapports premium et compléments métier

Lier le registre des rapports aux détails paginés et à une empreinte de requête (organisation, acteur autorisé, boutique, période, devise, sources, date d'arrêté, nombre de lignes). Exports CSV/XLSX/PDF avec statut de certification, auteur et audit. Utiliser des jobs privés asynchrones pour les exports exhaustifs (#1110), sans couper silencieusement les lignes.

Indicateurs complémentaires conditionnels aux sources souscrites : CA HT, taux de marge, charges d'exploitation, décaissements, flux net de trésorerie, dettes fournisseurs, écarts de rapprochement, valorisation/rotation/pertes stock, retours/avoirs, budget, fiscalité, rentabilité par canal, couverture comptable. **Ne pas afficher un KPI dont le calcul fiable ou les autorisations ne sont pas disponibles.**

## 7. Qualité / sécurité / livraison

- Vérification de `AGENTS.md` et des règles ERP.
- Contrôles RBAC (anonyme, facturier, caissier, Finance, administrateur), multi-tenant, multi-boutiques, module non souscrit.
- Tests 320/360/375/390/414 px, 768/1024, clavier, FR/EN, thèmes, dates exactes/fuseaux.
- `git diff --check`, `pnpm prisma:generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, QA métier, `pnpm build`, CI GitHub et E2E propriétaire.
- Réexaminer le dernier `origin/main` après la fusion de l'autre chantier, résoudre explicitement les conflits, relancer toute la CI.
- **Ne jamais fusionner ni déployer cette branche avant E2E final propriétaire « BON ».**
