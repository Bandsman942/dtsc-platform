# Hotfix UI/UX — Navigation groupée et workspaces DTSC

**Issue :** #241  
**Date :** 2026-08-11  
**Scope :** navigation privée, changement de contexte, identité d’entrée des modules et sections de workspace.

## Objectif

Le hotfix réduit la densité de navigation sans déplacer les règles d’autorisation vers le client. Les barres de navigation affichent désormais de grands groupes fonctionnels ; le détail des modules est présenté dans un hub dédié et les modules ERP d’entreprise restent alimentés par le résolveur serveur canonique.

## Groupes de navigation

Les groupes sont définis dans `lib/navigation/module-navigation-groups.ts` :

- **Pilotage & organisation** : dashboard, calendrier, notifications ;
- **IA & collaboration** : chatbot DTSC, collaborateurs, annonces ;
- **Entreprise & ERP** : entreprise, relations, invitations, activités, abonnement, administration et modules ERP autorisés ;
- **Compte & assistance** : profil, paramètres, support ;
- **DTSC interne** : activités internes et console, uniquement quand le contexte serveur le permet.

Les navigations desktop et mobile pointent vers `/modules?group=<CODE>`. Elles ne déroulent plus la liste complète des modules ERP dans la barre de navigation.

## Hub `/modules`

`app/modules/page.tsx` est une Server Component protégée par session. Elle :

1. résout le contexte actif ;
2. vérifie l’éligibilité aux espaces DTSC internes ;
3. vérifie les invitations et les activités entreprise disponibles ;
4. appelle `getEnterpriseNavigationModules()` pour les modules ERP ;
5. conserve `resolveEnterpriseModuleAccess()` pour l’entrée d’administration entreprise ;
6. regroupe ensuite les destinations autorisées dans des sous-groupes pliables.

Le hub ne devient pas une nouvelle autorité d’accès. Une destination ERP n’est présentée que si le résolveur serveur la retourne, et la route cible conserve ses propres contrôles.

## Actualisation

`ModuleRefreshButton` fournit une action **Actualiser / Refresh** réutilisable.

- `ModuleHeader` l’injecte automatiquement dans les modules standardisés ;
- `ProductNavigation` l’expose également dans le shell pour les surfaces legacy ;
- le header mobile l’expose dans la navigation privée.

L’action utilise `router.refresh()` afin de redemander les Server Components sans changer d’URL.

## Changement de contexte

`OrganizationContextSwitcher` continue d’utiliser `POST /api/account/context`. Le navigateur ne recharge la page qu’après une réponse serveur réussie.

Après succès, `window.location.reload()` conserve l’URL courante tout en reconstruisant l’intégralité de la page depuis la nouvelle session signée. Une erreur serveur ou réseau reste visible et n’entraîne pas de faux changement de contexte.

Les protections de `/api/account/context` restent inchangées : same-origin, session, rate limit, membership, audit et cookie de session signé.

## Identité d’entrée DTSC

`ModuleHeader` devient le contrat d’entrée visuel partagé :

- signature `DTSC · Workspace` ;
- hiérarchie commune titre / contexte / description ;
- fond visuel DTSC compatible mode sombre ;
- actions regroupées et responsive ;
- action Actualiser systématique.

Les spécificités métiers restent ensuite rendues par les composants de chaque module.

## Sections focalisées

`ModuleSection` est pliée par défaut. Son en-tête présente le titre, la description et le nombre d’éléments sans monter le contenu lourd.

À l’ouverture :

- la section devient un workspace plein écran ;
- un en-tête sticky fournit **Retour au module / Back to module** ;
- `Escape` ferme le workspace ;
- le scroll de la page arrière est bloqué ;
- le contenu conserve ses formulaires, listes et actions d’origine ;
- les liens profonds `#section-id` ouvrent automatiquement la section concernée.

La propriété `defaultOpen` reste disponible uniquement lorsqu’un écran a une raison métier explicite de préouvrir une section.

## DTSC AI

Le groupe **IA & collaboration** met l’IA DTSC au même niveau de navigation conceptuelle que les outils de collaboration, sans créer de nouveau provider, permission ou action agentique.

Le hub propose **Nouveau chat IA** uniquement vers la route `/chat` déjà fonctionnelle. Les permissions, politiques modèles, RAG/CAG, MCP et outils agentiques restent sous leurs contrôles serveur existants.

## Responsive et accessibilité

Le hotfix respecte les contrats `app/AGENTS.md` et `components/AGENTS.md` :

- `min-w-0` / `max-w-full` ;
- rails horizontaux locaux uniquement ;
- cibles tactiles d’au moins 44 px pour les nouvelles actions ;
- labels FR/EN ;
- `aria-current`, `aria-expanded`, `aria-labelledby` et `role=alert` lorsque concernés ;
- fermeture clavier du workspace focalisé ;
- pas de scroll horizontal global ajouté.

## Données et Prisma

Aucune modification de schéma Prisma et aucune migration ne sont nécessaires. Le hotfix réutilise les sources de vérité existantes.

## QA ciblée

Exécuter :

```bash
node scripts/qa-module-navigation-workspace-hotfix.mjs
pnpm qa:responsive-ui
pnpm qa:standard-experience
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

La CI GitHub reste la preuve opposable lorsque l’environnement local n’est pas disponible.

## Rollback

Le rollback consiste à revert la PR #241. Aucun backfill, aucune migration et aucune suppression de donnée ne sont nécessaires.
