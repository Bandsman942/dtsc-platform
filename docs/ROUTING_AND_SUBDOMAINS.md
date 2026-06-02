# Routage et sous-domaines DTSC Platform

Derniere mise a jour: 2 juin 2026

DTSC Platform reste une seule application Next.js App Router deployee sur Vercel. Cette couche prepare la separation produit par sous-domaines sans extraction monorepo, sans suppression des routes existantes et sans migration destructive.

## Sous-domaines cibles

| Host | Routes autorisees | Redirections principales | Acces requis |
| --- | --- | --- | --- |
| `dtsc-platform.com` / `www.dtsc-platform.com` | Pages publiques existantes, ressources publiques, pages legales, PWA publique | Routes privees vers `app`, `/admin` vers `console`, `/support` vers `support`, `/auth/sign-in` vers `account` | Public, sans session obligatoire |
| `app.dtsc-platform.com` | `/dashboard`, `/chat`, `/billing`, `/company`, `/calendar`, `/documents`, `/enterprise-admin`, `/enterprise-activities`, `/collaborators`, `/profile`, `/settings`, `/notifications`, `/announcements` | `/` vers `/dashboard` si connecte, sinon vers `account`; `/admin` vers `console`; `/support` vers `support` | Session valide; les modules entreprise gardent `activeContext`, `activeOrganizationId`, membership et RBAC existants |
| `console.dtsc-platform.com` | `/admin` comme console protegee; chemins SaaS et support rediriges vers leurs hosts | `/` vers `/admin`; non connecte vers `account` avec `next` absolu; connecte non DTSC interne vers `app/dashboard`; `/dashboard`, `/chat`, `/company`, `/calendar`, `/enterprise-admin`, `/enterprise-activities`, `/collaborators`, `/notifications`, `/announcements` vers `app`; `/support` vers `support` | Session `DTSC_INTERNAL` avec `activeOrganizationId = dtsc-internal` pour `/admin` uniquement |
| `account.dtsc-platform.com` | `/auth/sign-in`, `/auth/sign-up` | `/` vers `/auth/sign-in`; routes privees vers leur host produit; session deja active vers `next` fiable ou destination par defaut selon contexte | Public pour auth; redirection apres connexion selon `next`, `DTSC_INTERNAL`, `ORGANIZATION` ou `GLOBAL_CLIENT` |
| `support.dtsc-platform.com` | `/support` | `/` vers `/support`; non connecte vers `account`; `/admin` vers `console`; routes SaaS vers `app` | Session valide; les tickets restent filtres par utilisateur, contexte et `organizationId` |
| Local dev (`localhost`, `127.0.0.1`, `::1`) | Anciennes routes directes | Pas de routage force par sous-domaine | Comportement historique pour developpement |

Les routes statiques et techniques ne sont pas rewritees par host:

- `/_next/*`
- `/api/*`
- `/favicon.ico`
- `/manifest.webmanifest`
- `/icons/*`
- `/offline`
- `/offline.html`
- fichiers publics statiques et service worker

## Variables d'environnement

```bash
NEXT_PUBLIC_PUBLIC_URL=https://dtsc-platform.com
NEXT_PUBLIC_APP_URL=https://app.dtsc-platform.com
NEXT_PUBLIC_CONSOLE_URL=https://console.dtsc-platform.com
NEXT_PUBLIC_ACCOUNT_URL=https://account.dtsc-platform.com
NEXT_PUBLIC_SUPPORT_URL=https://support.dtsc-platform.com
AUTH_COOKIE_DOMAIN=.dtsc-platform.com
```

En local, `AUTH_COOKIE_DOMAIN` doit rester absent afin que le cookie fonctionne sur `localhost`. En production, quand `AUTH_COOKIE_DOMAIN` est defini, le cookie `dtsc_session` est emis avec ce domaine pour partager la session entre `account`, `app`, `console` et `support`.

## Cookie cross-subdomain

Le cookie de session conserve le format existant:

- nom: `dtsc_session`;
- `httpOnly: true`;
- `sameSite: "lax"`;
- `secure: true` en production;
- `path: "/"`;
- `domain: process.env.AUTH_COOKIE_DOMAIN` uniquement si configure.

La deconnexion expire a la fois le cookie host-only historique et le cookie de domaine partage afin d'eviter les sessions residuelles pendant la transition.

## Helpers centralises

`lib/domains.ts` centralise les URLs produit:

- `getPublicBaseUrl()`;
- `getAppBaseUrl()`;
- `getConsoleBaseUrl()`;
- `getAccountBaseUrl()`;
- `getSupportBaseUrl()`;
- `getCurrentHostType(host)`;
- `buildUrlForHostType(type, path)`;
- `getSignInUrl(next)`;
- `getDashboardUrl()`;
- `getConsoleUrl(path)`;
- `getSupportUrl(path)`;
- `getPublicUrl(path)`.

Les liens critiques d'authentification, de deconnexion et de navigation publique utilisent ces helpers pour eviter les URLs hardcodees.

`lib/post-login-redirect.ts` centralise la redirection apres connexion. Il accepte uniquement les cibles internes DTSC fiables, refuse les domaines externes et applique les destinations par defaut suivantes:

- `DTSC_INTERNAL`: `console.dtsc-platform.com/admin`;
- `ORGANIZATION`: `app.dtsc-platform.com/dashboard`;
- `GLOBAL_CLIENT` ou contexte absent: `app.dtsc-platform.com/dashboard`.

Les chemins comme `/admin`, `/support` et `/dashboard` sont transformes en URL produit absolue quand les variables `NEXT_PUBLIC_*_URL` sont configurees. Les URLs `next` externes ou protocol-relative sont ignorees.

## Navigation inter-produits

`components/layout/product-navigation.tsx` fournit la navigation globale entre produits DTSC. Elle est rendue dans `AppShell` et peut aussi apparaitre sur Account quand une session existe. Les destinations utilisent exclusivement les helpers de `lib/domains.ts`:

- Site public;
- SaaS;
- Console DTSC, visible uniquement pour une session `DTSC_INTERNAL`;
- Support;
- Compte.

La navigation n'accorde aucun droit: les routes et APIs continuent d'appliquer la session, le contexte actif, le membership et les RBAC serveur.

## API

Les routes `/api/*` ne sont pas deplacees et ne subissent pas de rewrite par sous-domaine. Elles continuent de s'executer dans le meme projet Vercel:

- `/api/auth/sign-in`;
- `/api/account/context`;
- `/api/admin/*`;
- `/api/enterprise/*`;
- `/api/support/*`;
- `/api/chat`;
- `/api/collaborators/*`;
- `/api/billing/*`;
- `/api/webhooks/*`.

Les protections existantes restent obligatoires: session, `activeContext`, `activeOrganizationId`, membership actif, RBAC, permissions metier et appartenance a l'objet.

## Configuration Vercel

Les domaines suivants doivent etre ajoutes au meme projet Vercel tant que DTSC Platform reste une seule application Next.js:

- `dtsc-platform.com`;
- `www.dtsc-platform.com`;
- `app.dtsc-platform.com`;
- `console.dtsc-platform.com`;
- `account.dtsc-platform.com`;
- `support.dtsc-platform.com`.

Variables a verifier dans l'environnement Production:

```bash
NEXT_PUBLIC_PUBLIC_URL=https://dtsc-platform.com
NEXT_PUBLIC_APP_URL=https://app.dtsc-platform.com
NEXT_PUBLIC_CONSOLE_URL=https://console.dtsc-platform.com
NEXT_PUBLIC_ACCOUNT_URL=https://account.dtsc-platform.com
NEXT_PUBLIC_SUPPORT_URL=https://support.dtsc-platform.com
AUTH_COOKIE_DOMAIN=.dtsc-platform.com
```

`AUTH_COOKIE_DOMAIN=.dtsc-platform.com` doit etre reserve a la production. En local et sur un preview non mappe aux sous-domaines officiels, laisser cette variable absente afin d'eviter un cookie inutilisable.

Ne pas activer plusieurs projets Vercel a cette etape. La separation actuelle est une couche de routage et de navigation dans le meme build, ce qui preserve les routes existantes, le SSO `dtsc_session`, Prisma, Neon et les APIs.

Ordre conseille avant mise en production:

1. Verifier les variables `NEXT_PUBLIC_*_URL` et `AUTH_COOKIE_DOMAIN`.
2. Deployer sur Vercel avec les domaines attaches au meme projet.
3. Executer `docs/SUBDOMAIN_QA_CHECKLIST.md` avec un compte client global, un compte membre entreprise et un compte `DTSC_INTERNAL`.
4. Verifier les logs `/api/auth/sign-in`, `/api/account/context`, `/api/admin/*`, `/api/support/*` et `/api/enterprise/*`.
5. Tester la deconnexion depuis App, Console et Support.

Rollback possible: retirer temporairement les sous-domaines du projet Vercel, supprimer `AUTH_COOKIE_DOMAIN` de l'environnement concerne et conserver les anciennes routes relatives sur le domaine principal. Aucune migration Prisma n'est necessaire pour revenir au routage historique.

## Limites connues

- La separation est logique et basee sur le host; le code reste dans une seule application Next.js.
- Les anciennes routes relatives restent valides pour compatibilite et developpement local.
- La console DTSC n'est pas extraite dans une app separee; elle est seulement isolee par host et contexte `DTSC_INTERNAL`.
- Les sous-domaines `docs`, `academy`, `ai`, `data` et `marketplace` restent hors scope.

## Prochaine etape vers monorepo

Quand les frontieres produit seront stabilisees, une migration progressive pourra extraire des apps dediees:

- `apps/public`;
- `apps/app`;
- `apps/console`;
- `apps/account`;
- `apps/support`;
- packages partages pour UI, auth, domaines, Prisma et RBAC.

Cette extraction devra venir apres stabilisation des contrats API, des helpers de navigation et des tests de non-regression multi-tenant.
