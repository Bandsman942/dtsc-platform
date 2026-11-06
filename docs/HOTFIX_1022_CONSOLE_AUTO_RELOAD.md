# Hotfix P0 #1022 — Console Chrome : arrêt des réactualisations automatiques

**Statut :** correction sur branche `fix/1022-console-auto-reload-stability`, non fusionnée et non déployée avant CI et OWNER_E2E.

## Diagnostic

Sur `console.dtsc-platform.com`, Chrome semble recharger presque en continu pendant la saisie. Il faut distinguer un vrai rechargement de document, une requête RSC et un changement de route. L'inspection du code confirme des rafraîchissements inutiles ; **la reproduction authentifiée dans le Chrome du propriétaire reste à vérifier en E2E**.

1. **Rechargement complet confirmé dans le code :** `PWARegister` appelait `window.location.reload()` sur chaque événement `controllerchange` du Service Worker, ce qui peut interrompre le travail lorsqu'un nouveau worker prend le contrôle.
2. `AppResumeSync` appelait `router.refresh()` après chaque lecture réussie du compteur non lu, même inchangé. `focus`, `visibilitychange`, `pageshow`, retour online et Push multipliaient les déclencheurs.
3. En réponse à 401, deux composants appelaient `router.push("/session-expired")` puis `router.refresh()`, avec des navigations possiblement concurrentes entre composants et onglets.

**Précision importante :** `/session-expired` est déjà hors du matcher dans `middleware.ts` ; cette route **n'était pas redirigée** par le middleware vers `/admin`. L'exclusion reste inchangée. En revanche, une page Account pouvait renvoyer vers Console lorsqu'un cookie signé encore valide coexistait avec une session serveur révoquée ; `reason=session-expired` évite ce rebond.

## Corrections implémentées

- `PWARegister` ne recharge **plus jamais automatiquement le document** en cas de changement de contrôleur SW. L'activation et les mises à jour restent disponibles ; leurs vérifications lors des événements Chrome sont limitées à une par 60 secondes, sans vérifications concurrentes. Un nouvel onglet ou un rafraîchissement volontaire récupère la version actualisée.
- L'AppShell donne à `AppResumeSync` le compteur initial du serveur. Le rendu serveur est rafraîchi seulement quand le compteur évolue réellement.
- Événements `focus`/visible/`pageshow`/online : fenêtre commune de 15 secondes et une seule requête en vol ; signaux Push : fenêtre de 1 seconde. Erreurs réseau et payloads invalides n'entraînent aucun refresh.
- 401 : helper de navigation idempotent utilisant seulement `router.replace("/session-expired")`, sans `router.refresh()`.
- Reprise du heartbeat `focus`/visible/`pageshow` regroupée sur 3 secondes ; « Rester connecté » interroge toujours le serveur.
- Retour vers la connexion Account avec destination correcte après login : Console `/admin`, App `/dashboard`, Support `/support`. Compte à rebours : navigation unique.
- Diagnostics locaux opt-in, uniquement catégories d'événements et timestamps, maximum 40 entrées. Jamais URL, identité, cookie, jeton ou payload.
- Aucune migration Prisma, variable d'environnement, donnée métier, permission ou règle Web Push modifiée.

## Diagnostic optionnel dans Chrome

Dans DevTools → Console, activer les événements de la branche et vider la trace précédente :

```js
sessionStorage.setItem("dtsc-refresh-diagnostics-enabled", "1");
sessionStorage.removeItem("dtsc-refresh-diagnostics-events");
```

Reproduire, puis consulter :

```js
JSON.parse(sessionStorage.getItem("dtsc-refresh-diagnostics-events") || "[]");
```

Comparer avec **DevTools → Network → Preserve log** : les entrées `document` indiquent les rechargements complets, à distinguer des appels RSC et `/api/`. Ces événements opt-in ne capturent ni le navigateur entier ni les mécanismes tiers. Ne jamais exporter cookies, headers d'authentification ou données métier.

Après le test :

```js
sessionStorage.removeItem("dtsc-refresh-diagnostics-enabled");
sessionStorage.removeItem("dtsc-refresh-diagnostics-events");
```

## QA et validation propriétaire

```bash
pnpm qa:hotfix-1022-console-auto-reload
pnpm qa:session-push
pnpm qa:regression
pnpm type-check
pnpm build
```

Les 15 assertions source-level dédiées sont intégrées à la QA sessions et à la régression. Elles ne remplacent pas les contrôles sur Chrome réel.

| Parcours OWNER_E2E | Résultat attendu |
|---|---|
| Chrome desktop : Console ouverte 5 min, saisie active | Pas de rechargement `document`, pas de perte de formulaire ni refresh si compteur inchangé. |
| Mise à jour du Service Worker / `controllerchange` pendant une saisie | La page reste ouverte, le texte saisi reste intact ; la nouvelle version est disponible au prochain chargement volontaire. |
| Répéter focus/visible/pageshow 10 fois en moins de 15 s | Pas de rafale ni de requêtes de compteur concurrentes. |
| Retour online, réseau lent/intermittent, Chrome Android | UI stable, saisie préservée, aucune boucle. |
| Réception Push avec compteur différent | Badge synchronisé et au plus un refresh RSC utile. |
| Push avec compteur identique | Aucun refresh RSC inutile. |
| 401 heartbeat ou compteur | Une navigation `/session-expired` et reconnexion Account, sans refresh concurrent. |
| Cookie signé encore valide mais session serveur révoquée | Page Account accessible avec `reason=session-expired`, sans renvoi automatique en Console. |
| Expiration Console, puis nouvelle connexion | Retour à Console `/admin`, pas à `/dashboard`. |
| Deux onglets Console, expiration ou logout | Une navigation par onglet, sans aller-retour de redirection. |
| Espace App et Support | Reconnexion et destination initiales conservées, aucune régression. |

**OWNER_E2E #1022 : NOT_EXECUTED**. Le propriétaire doit confirmer « E2E #1022 BON ». Aucun merge `main`, aucune Preview Vercel, aucun `vercel --prod` avant les gates. Si un vrai `document` recharge encore sans événements diagnostics, relever dans Network ses initiateurs/redirections HTTP et vérifier Service Worker ou erreurs Chrome avant tout autre changement.

## Retour arrière

Revert du commit spécifique depuis une PR validée si régression, sans rollback de base de données. Le correctif concerne seulement client session/notifications, écran d'expiration et redirection Account.
