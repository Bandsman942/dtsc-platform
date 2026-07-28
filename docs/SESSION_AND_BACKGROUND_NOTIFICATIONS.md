# DTSC Platform — Sessions configurables et notifications Web Push

## Objectif

Cette architecture distingue strictement trois sujets :

1. la session authentifiée et son expiration ;
2. l'état visible ou suspendu de la page/PWA ;
3. la notification système Web Push lorsque le navigateur le permet.

Aucun timer de page, Service Worker ou push ne doit être utilisé comme processus permanent pour maintenir artificiellement une session ou une room LiveKit.

## Politique de session

La politique est contrôlée côté serveur dans `lib/session-config.ts` et `lib/session-policy.ts`.

Durées d'inactivité autorisées :

- 15 minutes ;
- 30 minutes ;
- 1 heure ;
- 4 heures ;
- 8 heures ;
- 24 heures ;
- 7 jours ;
- 30 jours.

La valeur par défaut est 30 minutes. Le client ne peut pas proposer une valeur arbitraire : l'API utilise une union Zod fermée et la migration SQL applique la même liste blanche.

La durée absolue maximale d'une authentification est 30 jours. Une activité ou un heartbeat peut déplacer `exp`, mais jamais au-delà de `absoluteExp` calculé à partir du `authTime` initial.

Le token signé transporte :

- identité utilisateur ;
- rôle ;
- contexte DTSC/organisation ;
- `authTime` ;
- `issuedAt` ;
- `idleTimeoutMinutes` ;
- `absoluteExp` ;
- `exp`.

Les anciens tokens ne possédant que `exp` restent vérifiables jusqu'à leur expiration. Le premier heartbeat valide recrée un token moderne sans casser brutalement les sessions existantes au déploiement.

## Préférence utilisateur

`UserSessionPreference` est un modèle Prisma dédié en schéma multi-fichiers (`prisma/session-policy.prisma`). Il possède une ligne au maximum par utilisateur et retombe sur 30 minutes lorsqu'aucune préférence n'existe.

La migration `20260728113000_session_idle_timeout_policy` crée :

- une clé primaire `userId`, toujours résolue depuis l'utilisateur authentifié côté serveur ;
- le timeout par défaut 30 minutes ;
- une contrainte SQL de valeurs autorisées ;
- un index sur `updatedAt`.

Le modèle est volontairement autonome afin d'éviter de modifier le grand modèle `User` historique durant ce sprint. L'API n'accepte jamais un `userId` client pour écrire cette préférence : l'ownership est dérivé exclusivement de la session authentifiée.

`package.json` pointe Prisma vers le dossier `./prisma`, support multi-fichiers disponible dans Prisma 6.16.

## Heartbeat

`POST /api/auth/heartbeat` :

1. refuse l'origine incorrecte ;
2. rate-limit les appels ;
3. vérifie le token signé ;
4. recharge l'utilisateur ;
5. refuse un utilisateur non `ACTIVE` ;
6. lit la préférence en base ;
7. conserve le contexte actif actuel ;
8. conserve `authTime` et `absoluteExp` ;
9. renouvelle cookie + token lorsque permis ;
10. renvoie les timestamps d'expiration et le seuil de warning.

Le heartbeat ne tourne pas lorsque l'application est suspendue. La page visible l'utilise de façon throttlée, et le retour `visibilitychange`, `focus` ou `pageshow` déclenche une vérification immédiate.

## Multi-onglets

`SessionTimeoutGuard` utilise :

- `BroadcastChannel` lorsque disponible ;
- `localStorage` / `storage` comme fallback.

Les onglets partagent :

- dernière activité ;
- nouvelle expiration serveur ;
- logout.

Un onglet inactif qui se réveille après un timer suspendu ne supprime jamais aveuglément la session partagée : il vérifie d'abord `/api/auth/heartbeat`.

## Changement de contexte multi-tenant

Un switch entre `DTSC_INTERNAL`, `ORGANIZATION`, `GLOBAL_CLIENT` et `COMMUNITY` recrée le token avec le nouveau contexte tout en préservant l'authentification initiale et son `absoluteExp`.

Ainsi un changement organisation A → B n'offre pas une nouvelle durée absolue de 30 jours.

## Logout

Le logout manuel est distinct d'une expiration :

- le cookie partagé est supprimé ;
- les autres onglets sont informés ;
- l'abonnement Web Push du navigateur courant est supprimé côté serveur et désabonné côté navigateur ;
- les autres appareils de l'utilisateur restent abonnés.

Une expiration automatique ne révoque pas les abonnements Push : le Push et la session sont des mécanismes indépendants.

## Web Push

DTSC utilise le standard Web Push avec VAPID, sans dépendance npm supplémentaire.

Variables :

- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` — clé publique uniquement ;
- `WEB_PUSH_VAPID_PRIVATE_KEY` — secret serveur ;
- `WEB_PUSH_SUBJECT` — `mailto:` ou URL HTTPS de contact.

Si ces variables ne sont pas configurées, l'application compile et fonctionne normalement, mais l'UI indique que le Web Push serveur n'est pas configuré.

Le transport serveur dans `lib/push/web-push.ts` utilise :

- ECDH P-256 ;
- HKDF SHA-256 ;
- AES-128-GCM / `aes128gcm` ;
- VAPID ES256.

Aucun code Node n'est importé par `middleware.ts`, le client React ou `public/sw.js`.

## PushSubscription

Le modèle `PushSubscription` existait déjà avant ce sprint et reste la source des abonnements navigateur :

- plusieurs endpoints par utilisateur ;
- endpoint globalement unique ;
- clés `p256dh` et `auth` ;
- user agent technique.

Les endpoints `POST/GET/DELETE /api/push/subscriptions` :

- exigent la session active ;
- associent toujours l'abonnement au `userId` de la session ;
- valident le payload ;
- appliquent same-origin sur les mutations ;
- appliquent rate limiting ;
- refusent la réattribution silencieuse d'un endpoint détenu par un autre compte ;
- ne renvoient jamais les clés privées ou les endpoints enregistrés.

Un endpoint retournant 404/410 au dispatcher est supprimé.

## Permission navigateur

`Notification.requestPermission()` n'est jamais appelé au chargement.

Le flux est :

`Paramètres → Activer → feature detection → permission → serviceWorker.ready → PushManager.subscribe → API DTSC`.

Les états UX distinguent support, permission, abonnement réel et configuration serveur.

Sur l'environnement Apple où `navigator.standalone` indique la capacité PWA mais que le contexte n'est pas standalone, l'UI explique l'ajout à l'écran d'accueil. Aucun user-agent sniffing iOS n'est utilisé.

## Service Worker

`public/sw.js` gère :

- cache statique versionné ;
- aucune mise en cache durable des API/pages privées ;
- événement `push` ;
- payload malformé avec fallback ;
- icône et badge DTSC ;
- `tag` ;
- URL interne normalisée ;
- `notificationclick` avec focus/navigation d'une fenêtre existante ou `openWindow` ;
- Badging API en progressive enhancement.

Une URL externe ou `//host` reçue dans un payload est remplacée par `/notifications`.

## Confidentialité

Le contenu complet d'une `Notification` en base n'est pas recopié dans le lock screen.

Le push est une alerte neutre :

- nouveau message reçu ;
- appel DTSC ;
- mise à jour support ;
- invitation ;
- activité ;
- validation ;
- notification générique.

Le corps par défaut demande d'ouvrir DTSC Platform. Diagnostics, résultats cliniques, prescriptions, informations financières, juridiques ou RH détaillées ne sont pas inclus automatiquement.

Après clic, la cible reste une route authentifiée : l'authentification normale s'applique et une session expirée ne donne aucun accès aux données.

## Dispatcher métier

`notifyUser` / `notifyUsers` suivent désormais :

`événement métier → Notification DB → préférences → dispatcher Push → abonnements actifs`.

Le push est best effort. Une erreur réseau, VAPID ou fournisseur Push ne rollback jamais le message, le ticket, l'invitation ou l'activité métier déjà enregistrée.

Les messages collaborateurs, appels de groupe, support, invitations et autres modules qui utilisent déjà `notifyUser(s)` bénéficient automatiquement du dispatcher. Les principales routes Activités qui créaient directement les notifications sont migrées progressivement vers le helper central.

## Foreground et reprise

`PwaNotificationBridge` reste un fallback de page lorsque la permission existe mais qu'aucun abonnement Push réel n'est enregistré. Il ne duplique pas une notification lorsqu'un `PushSubscription` navigateur existe.

`AppResumeSync` réagit à :

- visibilité retrouvée ;
- focus ;
- `pageshow` ;
- retour online ;
- message du Service Worker après push.

Le `SessionTimeoutGuard` reste responsable de la revalidation de session au retour. `AppResumeSync` réconcilie l'abonnement courant, récupère le compteur non lu via une route authentifiée, traite un `401` comme une expiration, actualise le badge si l'API existe et fait un refresh RSC ciblé.

## LiveKit / appels

Aucune room LiveKit n'est maintenue artificiellement lorsque l'OS suspend la PWA. Un événement d'appel persistant peut générer une Notification DB + Web Push. Après tap, DTSC vérifie l'authentification et l'état réel de l'appel avant la connexion LiveKit.

## QA

`pnpm qa:session-push` contrôle les invariants source-level du sprint.

`pnpm qa:regression` enchaîne maintenant :

1. QA historique ;
2. workspace Sprint 2 ;
3. généralisation workspace ;
4. sessions/Web Push ;
5. mobile/iOS/PWA.

La validation sur navigateur/PWA fermé, Android réel et iPhone réel doit être distinguée d'un build ou d'une revue source : elle ne peut être déclarée réussie sans appareil et abonnement Push réels.
