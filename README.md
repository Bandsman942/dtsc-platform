# DTSC Chatbot

Plateforme SaaS de chatbot client pour **DTSC — Data and Tech Solutions Consulting**, cabinet basé à Kinshasa.

Slogan: **Le numérique au service de votre performance**.

L'application fournit un assistant IA professionnel pour aider les clients à clarifier leurs besoins en transformation digitale, data & BI, IA, marketing digital, applications métier, optimisation des coûts, fraude et accompagnement technologique.

DTSC cible prioritairement les assurances, cliniques, pharmacies et PME avec une offre hybride combinant consulting, abonnements, développement, marketing, formation et produits digitaux.

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
- Gestion RBAC côté admin: modification des rôles `ADMIN`, `MANAGER`, `CLIENT`, `SUPPORT`
- Création de comptes utilisateurs par l'admin avec rôle et limites d'usage
- Limites journalières configurables par utilisateur: messages et tokens
- Indicateurs de limites visibles dans le chatbot
- Gestion support pour `ADMIN` et `SUPPORT`: traitement, résolution et clôture de tickets
- Pages publiques d'information: Data en Afrique, BI & KPI, IA en entreprise, secteurs accompagnés
- Analytics simples des visites publiques avec filtre par période dans `/admin`
- Filtre calendrier des visites publiques et graphique borné avec chiffres par jour
- Paramètres globaux admin: limites par défaut, activation chatbot, maintenance, règles annonces et support
- Diffusion globale: notifications internes + email groupé via adresses utilisateurs
- Adresse professionnelle DTSC: `contact@dtsc-platform.com`
- Formulaire public de contact transmis côté serveur vers Zoho Mail via webhook
- Inscription newsletter publique avec stockage en base et notification Zoho
- Diffusion email admin vers les utilisateurs actifs et les abonnés newsletter
- Expiration automatique des sessions après 5 minutes sans activité avec avertissement premium
- SEO technique: métadonnées, sitemap, robots.txt, Open Graph et données structurées
- Module `/notifications` pour alertes tickets, annonces, réponses support et messages admin
- Module `/announcements` pour fil d'actualités interne avec publications selon rôle, commentaires et réactions
- Support repensé en discussion par ticket avec échanges jusqu'à résolution/clôture
- Paramètres complets: profil, mot de passe, mode clair/sombre/système et préférences de notifications
- Logo officiel DTSC et copyright 2026 sur les footers essentiels
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
DEFAULT_ADMIN_EMAIL=admin@dtsc-platform.com
DEFAULT_ADMIN_PASSWORD=DtscAdmin2026!
DTSC_CONTACT_EMAIL=contact@dtsc-platform.com
ZOHO_MAIL_WEBHOOK_URL=
ZOHO_OUTBOUND_MAIL_WEBHOOK_URL=
ZOHO_OUTGOING_WEBHOOK_SECRET=
ZOHO_MAIL_API_BASE_URL=https://mail.zoho.com
ZOHO_ACCOUNTS_API_BASE_URL=https://accounts.zoho.com
ZOHO_MAIL_ACCOUNT_ID=
ZOHO_MAIL_FROM_ADDRESS=contact@dtsc-platform.com
ZOHO_MAIL_CLIENT_ID=
ZOHO_MAIL_CLIENT_SECRET=
ZOHO_MAIL_REFRESH_TOKEN=
```

Notes:

- `OPENAI_API_KEY` ne doit jamais être exposé côté client.
- `AUTH_SECRET` doit être une chaîne aléatoire longue, au minimum 32 caractères.
- `ADMIN_EMAIL` donne automatiquement le rôle `ADMIN` au premier compte créé avec cet email.
- `DEFAULT_ADMIN_EMAIL` et `DEFAULT_ADMIN_PASSWORD` permettent le bootstrap du compte admin par défaut lors de la première connexion avec ces identifiants.
- Changer immédiatement `DEFAULT_ADMIN_PASSWORD` en production, puis modifier le mot de passe depuis `/settings`.
- Sur Vercel, configurer ces variables dans Project Settings → Environment Variables.
- `ZOHO_MAIL_WEBHOOK_URL` doit contenir l'URL complète du webhook entrant Zoho Mail. Ne jamais la commiter dans le dépôt.
- `ZOHO_OUTBOUND_MAIL_WEBHOOK_URL` doit pointer vers le webhook Zoho/Zoho Flow chargé d'envoyer les emails directs aux destinataires.
- `ZOHO_OUTGOING_WEBHOOK_SECRET` protège l'URL applicative à configurer côté Zoho: `APP_URL/api/webhooks/zoho/outgoing-mail?secret=VOTRE_SECRET`.
- `DTSC_CONTACT_EMAIL` est l'adresse professionnelle affichée sur le site et utilisée dans les messages serveur.
- Si `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_CLIENT_SECRET` et `ZOHO_MAIL_REFRESH_TOKEN` sont configurés, l'application envoie les diffusions directement par l'API Zoho Mail avant de tenter les fallbacks webhook.
- `ZOHO_MAIL_CLIENT_SECRET` et `ZOHO_MAIL_REFRESH_TOKEN` sont des secrets: ne jamais les commiter et les régénérer s'ils ont été partagés.

Mapping conseillé dans Zoho Flow, action Send Mail:

```txt
From address -> fromAddress
Reply to      -> replyTo
To            -> toText
CC            -> ccText
BCC           -> bccText
Subject       -> subject
Body          -> bodyHtml
Nicknames     -> laisser vide
```

## Compte Admin Par Défaut

Identifiants temporaires prévus pour la première connexion:

```txt
Email: admin@dtsc-platform.com
Mot de passe: DtscAdmin2026!
```

Au premier login avec ces valeurs, l'application crée automatiquement un utilisateur `ADMIN` actif si aucun compte avec cet email n'existe encore. Après connexion, changer le mot de passe dans `/settings`, puis remplacer `DEFAULT_ADMIN_PASSWORD` dans Vercel.

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
- `MANAGER`: supervision métier et suivi opérationnel futur.
- `CLIENT`: rôle standard pour les clients DTSC.
- `SUPPORT`: traitement des tickets et accompagnement client.

## Routes Principales

- `/` landing page publique
- `/auth/sign-in` connexion
- `/auth/sign-up` inscription
- `/dashboard` dashboard client
- `/chat` chatbot
- `/profile` profil utilisateur
- `/settings` paramètres
- `/support` tickets support
- `/notifications` centre de notifications
- `/announcements` fil d'annonces
- `/admin` administration
- `/data-afrique` ressource publique
- `/bi-kpi` ressource publique
- `/ia-entreprise` ressource publique
- `/secteurs` ressource publique

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
  settings/
  brand/
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
  dtsc.ts
  default-admin.ts
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
DEFAULT_ADMIN_EMAIL
DEFAULT_ADMIN_PASSWORD
DTSC_CONTACT_EMAIL
ZOHO_MAIL_WEBHOOK_URL
ZOHO_OUTBOUND_MAIL_WEBHOOK_URL
ZOHO_OUTGOING_WEBHOOK_SECRET
ZOHO_MAIL_API_BASE_URL
ZOHO_ACCOUNTS_API_BASE_URL
ZOHO_MAIL_ACCOUNT_ID
ZOHO_MAIL_FROM_ADDRESS
ZOHO_MAIL_CLIENT_ID
ZOHO_MAIL_CLIENT_SECRET
ZOHO_MAIL_REFRESH_TOKEN
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
- Expiration d'inactivité à 5 minutes avec renouvellement par heartbeat sur les pages privées
- Signature HMAC du token de session
- Hash de mot de passe PBKDF2 avec salt
- Validation Zod sur auth, chat, conversations, tickets et admin
- API OpenAI uniquement côté serveur
- Rate limiting mémoire sur `/api/chat`
- Limites applicatives par utilisateur sur messages/tokens journaliers
- Erreurs publiques génériques côté client

À renforcer avant forte charge:

- Rate limiting persistant Redis/Upstash
- Rotation de sessions
- MFA
- Journalisation d'audit
- Détection d'abus
- Politiques CSP strictes
- Remplacer le mot de passe admin par défaut dès la mise en production

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
