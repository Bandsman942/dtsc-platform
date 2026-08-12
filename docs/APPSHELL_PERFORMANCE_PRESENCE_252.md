# Issue #252 — AppShell performance et présence adaptative

## Objectif

Réduire le coût payé par chaque entrée privée dans DTSC Platform sans créer une nouvelle source de vérité ni affaiblir l'isolation tenant, la session, les notifications, la présence ou le changement de contexte.

## Mesure structurelle avant / après

Le diagnostic de base de #252 a identifié **11 agrégats globaux** attendus dans le `Promise.all` d'`AppShell`, dont un `notification.findMany` destiné uniquement au fallback de notification navigateur au premier plan.

Après refactor :

- budget global `AppShell` : **10 agrégats mesurés maximum** ;
- le payload de notification foreground n'est plus attendu avant le rendu du shell ;
- le fallback foreground vérifie d'abord si une vraie souscription Push existe ; lorsqu'elle existe, aucune lecture DB foreground supplémentaire n'est effectuée ;
- si le fallback est nécessaire, son endpoint reste authentifié, borné à 5 notifications et réutilise le scope canonique `getVisibleNotificationWhereForSession`.

Le script `scripts/qa-app-shell-performance-presence.mjs` transforme ces valeurs en budget anti-régression.

## Instrumentation de latence

`lib/app-shell-performance.ts` mesure la durée de chacun des 10 agrégats et la durée globale de préparation du shell. Les métriques ne contiennent ni `userId` ni `organizationId`.

L'émission des traces est volontairement opt-in avec la variable non secrète :

```text
DTSC_APP_SHELL_PERF_LOG=true
```

Quand elle n'est pas activée, les durées sont calculées uniquement pendant le rendu courant puis abandonnées. Ce mécanisme ne crée ni stockage, ni source de vérité, ni agrégat cross-tenant.

## Présence : budget avant / après

### Avant

Le header mobile envoyait un heartbeat toutes les **15 secondes**, en plus de `focus`, `visibilitychange` et `pagehide` :

- maximum théorique visible : **240 heartbeats/heure/client** ;
- un timer restait actif même lorsque les événements navigateur fournissaient déjà l'information ;
- aucun `clientSessionId` n'était transmis par le shell, ce qui faisait retomber le serveur sur l'identifiant legacy dérivé de l'utilisateur.

### Après

`useCollaborationPresenceLease` applique une lease adaptative :

- heartbeat visible : **45 secondes**, soit au maximum **80 heartbeats/heure/client** ;
- stale serveur conservé à **60 secondes**, donc le heartbeat reste à l'intérieur de la fenêtre de validité ;
- aucun heartbeat planifié lorsque l'onglet est caché ou le navigateur hors ligne ;
- reprise immédiate à `focus`, `visibilitychange → visible` et `online` ;
- sortie explicite à `hidden`, `offline` et `pagehide` ;
- `setTimeout` replanifié après succès/échec au lieu d'un `setInterval` permanent ;
- un identifiant de session client stable par onglet est conservé dans `sessionStorage` et envoyé à l'API ;
- le type client distingue PWA, mobile, tablette et desktop.

Le gain structurel maximal sur le heartbeat visible est donc de **66,7 %** par client, et le coût périodique tombe à **0 heartbeat planifié** lorsque l'application est cachée/hors ligne.

## Multi-appareils et isolation

Le serveur possédait déjà `CollaborationPresenceSession.clientSessionId`. #252 commence à utiliser ce contrat côté shell au lieu du fallback `legacy-<userId>`. Une mise hors ligne d'un onglet ne ferme donc plus implicitement la session de présence d'un autre appareil partageant le même utilisateur.

Aucun identifiant tenant n'est fourni par le client. L'identité reste résolue par `getSession()` côté serveur, l'API présence conserve le contrôle same-origin et la présence reste enregistrée avec le `userId` authentifié.

## Notifications foreground

`PwaNotificationBridge` ne reçoit plus la liste des notifications depuis `AppShell`.

Le flux devient :

1. vérifier que les notifications navigateur sont activées et autorisées ;
2. attendre le Service Worker si disponible ;
3. vérifier l'existence d'une souscription Push active ;
4. uniquement sans souscription Push, appeler `/api/notifications/foreground` ;
5. afficher au maximum les nouvelles notifications foreground non encore vues.

Le flux Push normal garde la priorité et le fallback ne ralentit plus le shell privé.

## QA et budget

La gate `scripts/qa-app-shell-performance-presence.mjs` vérifie notamment :

- `AppShell <= 10` agrégats mesurés ;
- absence de `notification.findMany` bloquant dans `AppShell` ;
- endpoint foreground authentifié, scoped et borné ;
- vérification Push avant fetch foreground ;
- disparition du `setInterval(..., 15000)` ;
- heartbeat client 45 s < stale serveur 60 s ;
- suspension background/offline ;
- présence des événements focus/visibility/online/offline/pagehide ;
- usage d'un `clientSessionId` par onglet ;
- instrumentation sans identifiant utilisateur/tenant.

Cette gate est injectée dans `scripts/run-regression-qa-ci.mjs`, donc elle est exécutée par le job `Regression QA` des Quality Gates.

## Validation rendue attendue

Avant fusion, #252 exige une recette mobile et desktop portant au minimum sur :

- présence online après ouverture ;
- passage background puis retour foreground ;
- perte puis récupération réseau ;
- deux onglets/appareils du même utilisateur ;
- changement de contexte d'organisation ;
- notifications et badges ;
- PWA standalone ;
- absence de mélange entre tenants/contextes.

La QA source ne remplace pas cette preuve E2E.

## Rollback

Le rollback est le revert de la PR #252. Aucun changement de schéma, migration ou backfill n'est introduit par cette itération.
