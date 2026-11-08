# Hotfix #1055 — Navigation DTSC en cartes interactives

**Date :** 8 novembre 2026. **Statut :** candidat PR, sous réserve des contrôles CI et de la validation E2E du propriétaire.

## Problème résolu

Le répertoire Point de vente (`RetailPosSectionDirectory`) disposait déjà d'une navigation de cartes compactes avec pictogrammes, tandis que les répertoires `/modules` et `/enterprise-modules` affichaient des listes denses et de simples flèches. Le chargement d'un workspace pouvait n'offrir aucun retour perceptible à la navigation.

## Contrat UX partagé

- `components/workspace/module-navigation-grid.tsx` : navigation réutilisable par cartes 1/2/3 colonnes, reprenant les dimensions, le traitement de l'icône, les bordures, les interactions et le focus du Point de vente. Icône prioritairement issue du `iconKey` du registre canonique, avec fallback déterministe par domaine. Les libellés et descriptions viennent des registres existants FR/EN.
- Le hub `app/modules/page.tsx` convertit les éléments standards déjà filtrés en cartes dans chaque sous-groupe de navigation. Les sous-groupes et leur accordéon restent accessibles : aucun changement des routes ni de la logique de filtrage.
- Le hub `app/enterprise-modules/page.tsx` convertit **tous** les groupes ERP (dont `OPERATIONS`, `FINANCE`, secteurs Santé/Pharmacie/etc.) en cartes sans introduire de deuxième catalogue. Les sections Finance et l'Accès rapide demeurent inchangés. Le marquage `data-enterprise-module-code` est conservé par la primitive partagée pour l'historique des modules récents.
- Les cartes sont des liens réels ; les fonctionnalités non autorisées restent absentes : `listStandardNavigationItems`, `standardCodeAllowed`, `getEnterpriseNavigationModules` et la route cible demeurent autorités. Le statut BETA est visible sans afficher des modules HIDDEN/PLANNED/RETIRED.

## Chargement et connexions lentes

- `components/layout/navigation-progress.tsx` fournit un retour global lors d'un clic sur un lien interne dans `AppShell`, sans fetch, polling ou abonnement. **Coût global :** un gestionnaire de clic, aucun timer au repos ; deux timers uniques après une navigation (message lent à 6 s, expiration à 30 s) et un court fallback de 1,6 s pour une navigation qui ne change que la query string. L'overlay ne bloque ni la navigation ni les actions existantes.
- Chaque carte signale son ouverture avec `aria-busy`, un état visuel et une indication après latence. Les clics modifiés (ouvrir dans un nouvel onglet) gardent le comportement natif.
- Les fallbacks App Router `app/modules/loading.tsx`, `app/enterprise-modules/loading.tsx` et `app/enterprise-modules/[moduleCode]/loading.tsx` montrent des skeletons responsive, sans lecture de données privées. Pas de spinner indéfini volontaire dans le shell.
- Aucun changement backend, authentification, cookie, middleware, migration ou système financier.

## QA exigée avant fusion

```bash
node scripts/qa-module-navigation-cards-1055.mjs
node scripts/qa-hotfix-927-erp-quick-access.mjs
node scripts/qa-module-navigation-workspace-hotfix.mjs
pnpm qa:responsive-ui
pnpm qa:standard-experience
pnpm qa:regression
pnpm prisma generate
pnpm type-check
pnpm lint
pnpm build
git diff --check
```

**E2E propriétaire :** pour une entreprise disposant de modules actifs, ouvrir les cinq entrées du groupe Opérations et les principales catégories ERP, revenir au catalogue, puis répéter en 320, 390, 768 et 1440 px, FR/EN et clair/sombre. Tester un utilisateur limité (modules administratifs absents), un sous-groupe DTSC interne non autorisé, les favoris/récents, une connexion lente simulée et le retour arrière. Vérifier que l'affichage des cartes ne rend jamais une route métier non autorisée accessible.

La PR n'est pas fusionnée avant les checks et la confirmation explicite E2E. La Production provient seulement de `main` ; aucun déploiement Preview.

## Retour arrière

Revert de la PR du hotfix #1055. Aucun changement de données à annuler.
