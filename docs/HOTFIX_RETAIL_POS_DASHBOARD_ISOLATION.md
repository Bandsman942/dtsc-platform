# Hotfix P0 — cloisonnement du tableau de bord POS multi-boutiques

**Statut :** candidat PR, **OWNER_E2E non encore validé**. Ne pas déployer de branche : déploiement depuis `main` uniquement après E2E.

## Incidence et invariant

L'endpoint `GET /api/enterprise/:organizationId/retail/dashboard?moduleCode=RETAIL_POS` vérifie `RETAIL_POS.read`, mais les projections cacheables de `commercial-dashboard-projections.ts` sont communes à tous les membres d'une organisation : comptes et dépôts de toutes les boutiques, dernières ventes multi-sites avec lignes et paiements, agrégats de vente inter-boutiques. Une affectation RETAIL stricte ne suffit pas à cloisonner une réponse mise en cache par organisation.

**Invariant :** lorsque `siteStaffIsolationEnabled=true`, un collaborateur ne reçoit dans ce tableau de bord que des données de boutiques dont il dispose des capacités requises. `VIEW_SALES` autorise les ventes et leurs indicateurs ; `COLLECT_PAYMENT` les comptes d'encaissement et ses sessions ; les dépôts affichés sont ceux de ses affectations actives disposant d'au moins un droit opérationnel pertinent. Un utilisateur révoqué ne doit récupérer aucune ancienne session ou opération d'une boutique. Les acteurs `OWNER`, `ADMIN_ENTREPRISE`, `ADMIN_ENTERPRISE` et les tenants sans isolation gardent leurs parcours historiques.

## Stratégie et compatibilité

- `retailPosDashboardSiteScope` résout le membership actif, le flag et les capacités à chaque requête, hors du cache transversal.
- Le service `getCommercialRetailDashboardRead` filtre les projections après récupération et avant sérialisation ; le cache ne contient jamais de vue utilisateur réutilisable par un autre utilisateur.
- Les indicateurs par devise utilisent l'agrégat SQL existant `getRetailMetricsByCurrency` avec `siteIds` explicites. Une liste vide donne zéro vente, jamais le total de la société.
- Les sessions de caisse restent rattachées à leur propriétaire et sont en outre filtrées par `financialAccount.siteId` lorsque l'isolation est active.
- Aucune migration ni modification des ventes, paiements ou historiques. La fonctionnalité reste désactivée sur les entreprises ne l'ayant pas activée volontairement.

## Contrôles

`node scripts/qa-retail-pos-dashboard-site-isolation.mjs` : affectations multi-boutiques, ventes/caches inter-boutiques, compte partagé non dévoilé, session révoquée, agrégats recalculés, vue propriétaire et contrôle legacy.

**Recette propriétaire avant fusion :** deux comptes membres distincts (Gombe et Limete), une vente et un compte par site ; activer la seule isolation sur un tenant de test préparé ; vérifier dans l'onglet réseau et à l'écran que chaque caissier ne reçoit que son site, même après navigation, actualisation, changement de compte et suppression de l'affectation. Le propriétaire doit confirmer explicitement `E2E final BON` avant merge.
