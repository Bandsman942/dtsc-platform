# Addendum technique — Session policy et Web Push

Ce document complète `docs/TECHNICAL_DOCUMENTATION.md` pour l'architecture introduite par le sprint transversal Sessions configurables + Web Push.

## Composants serveur

### Auth/session

- `lib/session-config.ts` : valeurs autorisées et limites globales de sécurité.
- `lib/session-policy.ts` : calculs purs idle/absolute/warning/cookie.
- `lib/session.ts` : token HMAC signé avec compatibilité legacy.
- `lib/session-preference.ts` : accès Prisma à `UserSessionPreference`.
- `app/api/auth/heartbeat/route.ts` : renouvellement serveur.
- `app/api/account/session-policy/route.ts` : préférence utilisateur whitelistée et auditée.
- `middleware.ts` : renouvellement léger de tokens modernes sur navigation privée, sans DB et sans dépasser `absoluteExp`.

### Push

- `lib/push/config.ts` : VAPID et dégradation lorsque configuration absente.
- `lib/push/endpoint.ts` : validation endpoint.
- `lib/push/payload.ts` : payload minimal et URL interne.
- `lib/push/web-push.ts` : chiffrement Web Push + signature VAPID côté Node.
- `lib/push/sender.ts` : multi-device, cleanup 404/410, best effort.
- `app/api/push/subscriptions/route.ts` : cycle de vie abonnement du terminal.
- `lib/notifications.ts` : point central DB Notification → Push dispatcher.

## Composants client

- `components/auth/session-timeout-guard.tsx` : idle dynamique, warning, Rester connecté, multi-tab et reprise après suspension.
- `components/settings/session-and-push-settings.tsx` : préférence de session et activation Push explicite.
- `lib/push/client.ts` : feature detection, permission, subscribe/unsubscribe/reconcile.
- `components/pwa/app-resume-sync.tsx` : resynchronisation notifications/badge au premier plan.
- `components/pwa/pwa-notification-bridge.tsx` : fallback foreground seulement.

## Service Worker

`public/sw.js` conserve une stratégie réseau sûre pour le HTML privé et n'intercepte pas les APIs. Le cache v8 reste réservé aux assets statiques/fallback offline.

Le handler `push` traite uniquement un petit payload de notification système. `notificationclick` normalise la cible vers l'origine DTSC.

## Prisma

Prisma CLI est configuré sur `./prisma` afin de charger :

- le schéma historique `prisma/schema.prisma` ;
- `prisma/session-policy.prisma`.

Migration : `prisma/migrations/20260728113000_session_idle_timeout_policy/migration.sql`.

## Variables

```dotenv
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:contact@dtsc-platform.com
```

La clé privée ne doit jamais apparaître dans les logs, réponses API ou bundle client.

## Flux session

```text
sign-in
→ préférence session DB
→ authTime / absoluteExp
→ token HMAC
→ cookie HTTP-only partagé
→ app visible
→ activité locale
→ heartbeat throttlée
→ exp glissant <= absoluteExp
```

## Flux background notification

```text
événement métier
→ Notification DB
→ préférences user
→ subscriptions actives
→ Web Push chiffré
→ Push Service navigateur
→ Service Worker DTSC
→ notification système
→ clic
→ route DTSC
→ contrôle auth normal
```

## Multi-sous-domaines

Le cookie partagé conserve `AUTH_COOKIE_DOMAIN` existant. BroadcastChannel/storage ne synchronisent que les onglets de même origine ; entre sous-domaines, le cookie partagé et la revalidation serveur empêchent un onglet ancien de déconnecter aveuglément une session renouvelée ailleurs.

## Limites web assumées

- Un onglet/PWA peut être suspendu par l'OS.
- Un Service Worker n'est pas un démon permanent.
- Une room LiveKit n'est pas maintenue artificiellement quand l'application est suspendue.
- Un push ne constitue jamais une preuve de session active.
