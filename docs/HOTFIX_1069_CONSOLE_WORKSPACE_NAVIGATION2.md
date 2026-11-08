# Hotfix C #1069 — Administration DTSC en cartes et workspaces
Date : 8 novembre 2026. Version candidate : v1.6.3 sur la base main v1.6.2 (incrément strict ; réajuster après fusion d'un hotfix précédent).

## Architecture et périmètre
Le registre CONSOLE_SECTION_IDS / CONSOLE_SECTION_GROUPS / CONSOLE_SECTION_GROUP, la fonction getConsoleSectionHref et les contrôles de capacités de DtscConsolePage sont toujours les sources canoniques.

La page /admin propose des cartes par domaine de gestion, regroupant seulement les sections autorisées par le serveur. La page /admin?group=id ouvre les cartes des sections d'un domaine; les sections ouvrent ensuite leur workspace complet /admin/section. Les sous-sections existantes utilisent des cartes avec des URLs stables ?focus=id, whitelistées dans lib/console/console-depth-registry.ts. Les breadcrumbs Administration > Domaine > Section > Sous-section et Retour remontent un niveau logique sans retour navigateur fragile.

Les workspaces utilisent l'espace disponible et préservent les actions/fonctions existantes, avec design responsive 1/2/3 colonnes, icônes et focus accessibles. Les filtres restent de véritables filtres côté serveur, pas une recherche IA imaginaire. La recherche par texte et les critères métier conservent une URL partageable et le changement pageSize. Les vues de filtres nommées sont enregistrées uniquement sur commande, dans le navigateur et par utilisateur/section, maximum huit. La pagination serveur affiche premier, précédent, pages numérotées, suivant et dernier avec conservation des filtres et du focus.

## Sécurité
Les cartes utilisent exclusivement visibleSections déjà filtré via getConsoleAccessDecision et canAccessAdminSection. Les APIs restent protégées par RBAC/tenant, aucun nouveau backend non audité. La recherche sémantique ne sera exposée que si une vraie implémentation existe. Le mode focus masque les sous-sections sœurs sans dupliquer la source de données. Optimiser plus tard les lectures SSR indépendantes doit s'appuyer sur des profils de performance; aucune promesse de gain non mesuré.

## Parcours E2E propriétaire A+B+C
Tester ADMIN vs lecteur limité (aucune carte interdite), liste des entreprises: recherche, filtres, taille 10/25/50/100, pager numéroté, vue sauvegardée, suppression de vue, breadcrumb retour. Tester navigation profonde AI > modèles/connecteurs/sécurité, URL directe, navigateur précédent/suivant, no horizontal overflow. Vérifier 320/360/375/390/414/768/1024/1440 px, FR/EN, light/dark, clavier, lecteur d'écran. Tester aussi le réseau lent et les listes vides. Playwright isolé peut être ignoré en absence de fixture, ce qui ne constitue jamais un E2E réussi.

Commandes QA:
- node scripts/qa-hotfix-1069-console-workspaces.mjs
- pnpm qa:console-saas-workspaces
- pnpm qa:console-workspace-shell
- pnpm qa:regression
- pnpm type-check
- pnpm lint
- pnpm build
- npx playwright test tests/e2e/issue-1069-console-navigation.spec.mjs

Aucune migration ni nouvelle capacité d'accès. Pas de Preview Vercel, Production uniquement depuis main après validation finale des trois hotfixes A+B+C. Rollback : revert de PR; filtres locaux deviennent inertes.
