# DTSC Chatbot

Plateforme SaaS de chatbot client pour **DTSC — Data and Tech Solutions Consulting**.

Slogan: **Le numérique au service de votre performance**.

L'application fournit un assistant IA professionnel pour aider les clients à clarifier leurs besoins en transformation numérique, data, automatisation, reporting, IA, applications métier et accompagnement technologique.

## Stack Technique

- Next.js App Router
- TypeScript
- Tailwind CSS
- Neon PostgreSQL
- Prisma ORM
- OpenAI Responses API côté serveur
- Auth maison par cookie signé HTTP-only
- Déploiement Vercel
- GitHub Actions CI/CD

## Fonctionnalités

- Landing page publique DTSC
- Inscription, connexion, déconnexion
- Sessions sécurisées par cookie signé
- Rôles: `ADMIN`, `MANAGER`, `CLIENT`, `SUPPORT`
- Middleware de protection des routes privées
- Dashboard client
- Interface chatbot avec sidebar de conversations
- Historique des conversations et messages en base
- Renommage et suppression de conversation
- Support markdown pour les réponses IA
- Copier une réponse assistant
- Tickets support
- Dashboard admin
- Suivi utilisateurs, conversations, messages, usage IA et tickets
- Rate limiting basique sur l'API chat
- Validation des inputs avec Zod

## Variables D'environnement

Copier `env.example` vers `.env.local` en local:

```bash
DATABASE_URL=
OPENAI_API_KEY=
AUTH_SECRET=
APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
OPENAI_MODEL=gpt-5-nano
OPENAI_MODEL_IDS=gpt-5-nano,gpt-5-mini,gpt-4.1-mini
NEXT_PUBLIC_DEFAULT_MODEL=gpt-5-nano
ADMIN_EMAIL=
```

Notes:

- `OPENAI_API_KEY` ne doit jamais être exposé côté client.
- `AUTH_SECRET` doit être une chaîne aléatoire longue, au minimum 32 caractères.
- `ADMIN_EMAIL` donne automatiquement le rôle `ADMIN` au premier compte créé avec cet email.
- Sur Vercel, configurer ces variables dans Project Settings → Environment Variables.

Générer un `AUTH_SECRET` localement avec PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Installation Locale

```bash
pnpm install
pnpm prisma generate
pnpm dev
```

Puis ouvrir:

```bash
http://localhost:3000
```

## Configuration Neon PostgreSQL

1. Créer une base Neon.
2. Copier l'URL de connexion PostgreSQL.
3. Mettre l'URL dans `DATABASE_URL`.
4. Appliquer les migrations:

```bash
pnpm prisma migrate deploy
```

En développement, pour créer une nouvelle migration après modification du schema:

```bash
pnpm prisma migrate dev
```

Ouvrir Prisma Studio:

```bash
pnpm prisma studio
```

## OpenAI

Le chatbot utilise l'endpoint OpenAI **Responses API** côté serveur dans `app/api/chat/route.ts`.

Le prompt système DTSC est centralisé dans:

```txt
lib/openai.ts
```

Le modèle par défaut est configuré avec:

```bash
OPENAI_MODEL=gpt-5-nano
```

## Rôles Utilisateurs

- `ADMIN`: accès à `/admin`, supervision utilisateurs, conversations, tickets et usage IA.
- `MANAGER`: rôle prévu pour supervision métier future.
- `CLIENT`: rôle standard pour les clients DTSC.
- `SUPPORT`: rôle prévu pour traitement des tickets.

## Routes Principales

- `/` landing page publique
- `/auth/sign-in` connexion
- `/auth/sign-up` inscription
- `/dashboard` dashboard client
- `/chat` chatbot
- `/profile` profil utilisateur
- `/settings` paramètres
- `/support` tickets support
- `/admin` administration

## Structure

```txt
app/
  api/
    auth/
    chat/
    conversations/
    support/
    admin/
  admin/
  auth/
  chat/
  dashboard/
  profile/
  settings/
  support/
components/
  admin/
  auth/
  chat/
  dashboard/
  layout/
  support/
  ui/
lib/
  auth.ts
  env.ts
  format.ts
  openai.ts
  prisma.ts
  rate-limit.ts
  security.ts
  session.ts
  validators.ts
prisma/
  schema.prisma
  migrations/
```

## CI/CD Vercel

Le workflow `.github/workflows/vercel-production.yml` se lance à chaque push sur `main`.

Secrets GitHub requis:

```bash
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Variables Vercel Production requises:

```bash
DATABASE_URL
OPENAI_API_KEY
AUTH_SECRET
APP_URL
OPENAI_MODEL
OPENAI_MODEL_IDS
NEXT_PUBLIC_DEFAULT_MODEL
ADMIN_EMAIL
```

Le pipeline exécute:

```bash
pnpm install --no-frozen-lockfile
pnpm type-check
pnpm prisma migrate deploy
vercel build --prod
vercel deploy --prebuilt --prod
```

## Sécurité

Mesures présentes:

- Routes privées protégées par `middleware.ts`
- Cookie de session HTTP-only, `sameSite=lax`, `secure` en production
- Signature HMAC du token de session
- Hash de mot de passe PBKDF2 avec salt
- Validation Zod sur auth, chat, conversations, tickets et admin
- API OpenAI uniquement côté serveur
- Rate limiting mémoire sur `/api/chat`
- Erreurs publiques génériques côté client

À renforcer avant forte charge:

- Rate limiting persistant Redis/Upstash
- Rotation de sessions
- MFA
- Journalisation d'audit
- Détection d'abus
- Politiques CSP strictes

## Roadmap

- Intégration RAG avec documents DTSC
- Upload de fichiers par client
- Base de connaissances DTSC
- Tickets support avancés
- Facturation et abonnements
- Analytics avancés
- Export PDF des conversations
- Multilingue français / anglais
- Intégration WhatsApp Business
- Intégration CRM
- Agents IA spécialisés par domaine
- Préférences de modèles par utilisateur
- Recherche globale dans conversations et documents

## Commandes Utiles

```bash
pnpm dev
pnpm build
pnpm type-check
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma migrate deploy
pnpm prisma studio
```
