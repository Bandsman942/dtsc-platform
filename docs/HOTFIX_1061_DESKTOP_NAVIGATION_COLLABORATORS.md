# Hotfix #1061 — Menu desktop rétractable et Collaboration immersive

**Date :** 8 novembre 2026. **Version candidate :** v1.5.2. **Statut :** PR / E2E propriétaire requis.

## Références et résultat attendu
La barre latérale rétractable Neon sert de référence d'interaction ; la disposition WhatsApp Desktop sert de référence pour « Mes collaborateurs » : **rail global DTSC étroit + colonne Discussions + conversation ouverte**. L'identité visuelle DTSC reste conservée (aucun copier-coller de marque tierce).

## Shell privé desktop (>= 1024 px)
- `DesktopSidebarFrame` gère l'état visuel `expanded` / `collapsed`, isolé par **utilisateur** et **produit** dans `localStorage` sous `dtsc:desktop-sidebar:v1:<userId>:<productKey>`. Aucun cookie, API, base ou droit supplémentaire.
- État initial standard : ouvert ; à la première entrée du workspace conversationnel, réduit par défaut lorsqu'il n'existe **aucune préférence enregistrée**. Le bouton persiste explicitement le choix, qui est réutilisé sur toutes les pages du même produit.
- La barre mesure **18 rem (288 px)** déployée, **4,75 rem (76 px)** réduite ; le contenu principal adopte exactement le même décalage CSS. Transition douce de 180 ms, neutralisée si `prefers-reduced-motion`.
- Le mode réduit conserve le logo DTSC (accueil), le raccourci `Nouveau chat`, les **groupes de navigation déjà autorisés côté serveur** et le bouton `Développer le menu`. Les icônes portent un `aria-label`, un `title`, un focus visible, `aria-current` et leurs compteurs existants.
- Le sélecteur de produit, l'identité de l'organisation et les libellés de groupes restent visibles en mode déployé. Le changement d'organisation reste accessible dans la barre supérieure desktop même en mode réduit ; déplier rend le sélecteur de produit à nouveau disponible.
- Aucun fetch/polling/timer global : lecture locale au montage et écoute de l'événement `storage` uniquement, écriture sur commande explicite.
- Les permissions, groupes et deep links restent fournis par `NavLinks` et `getModuleNavigationGroupHref` ; aucun menu dupliqué ni nouvelle surface d'autorisation.

## Mes collaborateurs : trois zones et scrolls indépendants
- `AppShell desktopWorkspaceMode="conversation"` est **réservé** à la page des conversations ; les autres pages, y compris les formulaires de nouveaux contacts, conservent le layout normal.
- Le main occupe `100dvh - 4rem` sous l'en-tête desktop. Aucun padding horizontal/vertical n'empiète sur le split view. La liste de discussions conserve sa largeur de 340 px et ses scrolls internes ; le fil de conversation occupe la largeur restante avec composer toujours visible.
- Le mode compact forme trois colonnes perceptibles (rail global 76 px + discussions 340 px + fil flexible). La sélection de discussion ne fait pas disparaître le panneau gauche sur desktop, tandis que la navigation liste → détail conserve son comportement mobile.
- Messages, pièces jointes, réponses, présence, appels LiveKit et RBAC restent intacts : **aucune mutation métier**.

## Mobile/PWA
- Toute la nouvelle géométrie est bornée au breakpoint **min-width 1024px** dans `app/desktop-sidebar.css`. La navigation basse, le shell haut mobile, les gestes et le contrôleur VisualViewport iOS conservent leurs contrats.
- Tester 320/360/375/390/414/768/1024/1280/1440 px, mode clair/sombre, FR/EN, libellés longs, zoom, clavier, changement de compte/produit, stockage indisponible et multi-onglets.

## QA, E2E et preuves attendues
```bash
node scripts/qa-hotfix-1061-desktop-sidebar.mjs
pnpm prisma generate
pnpm type-check
pnpm qa:responsive-ui
pnpm qa:standard-experience
pnpm qa:regression
pnpm lint
pnpm build
npx playwright test tests/e2e/issue-1061-desktop-sidebar.spec.mjs
```
Les tests E2E utilisent un utilisateur synthétique isolé et `E2E_USER_PASSWORD` ; les tests interactifs Playwright ne sont pas exécutés si les prérequis de test manquent, ce qui **ne vaut pas validation E2E**.

**Validation humaine demandée :** depuis DTSC Platform desktop, réduire/développer le rail à l'aide du bouton et traverser plusieurs modules ; relancer le navigateur pour vérifier la persistance ; ouvrir « Mes collaborateurs », sélectionner une discussion, défiler dans les deux colonnes, rédiger un message, changer de thème puis vérifier le viewport mobile. La fusion nécessite une confirmation explicite `E2E #1061 BON`.

## Sécurité et opérations
- Aucune modification de Prisma/migrations, de schéma, d'autorisation ni de paramètres Vercel.
- Conservation de la politique Production **uniquement depuis main** et Preview désactivées.
- Rollback : revert de la PR #1061 ; l'ancienne préférence locale est inoffensive une fois le composant retiré.
