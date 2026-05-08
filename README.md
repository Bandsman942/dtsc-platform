# DTSC Chatbot

Plateforme SaaS de chatbot client pour **DTSC — Data and Tech Solutions Consulting**, cabinet basé à Kinshasa.

Slogan: **Le numérique au service de votre performance**.

L'application fournit un assistant IA professionnel pour aider les clients à clarifier leurs besoins en transformation digitale, data & BI, IA, marketing digital, applications métier, optimisation des coûts, fraude et accompagnement technologique.

DTSC cible prioritairement les assurances, cliniques, pharmacies et PME avec une offre hybride combinant consulting, abonnements, développement, marketing, formation et produits digitaux.

## Stack Technique

- Next.js App Router
- React 19.1.2+ et TypeScript
- Tailwind CSS
- Neon PostgreSQL
- Prisma ORM
- OpenAI Responses API côté serveur
- Auth maison par cookie signé HTTP-only
- Déploiement Vercel
- GitHub Actions CI/CD

## Documentation Technique

La documentation technique complete est disponible dans [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md).

## Fonctionnalités

- Landing page publique DTSC refondue avec navigation Accueil, Services, Solutions, Secteurs, Projets, Ressources, À propos et Contact
- Pages publiques dédiées avec onglet actif, contenus DTSC issus du business plan et sources vérifiables
- Publications publiques administrables depuis `/admin` pour alimenter la page Ressources sans modifier le code
- Inscription, connexion, déconnexion
- Inscription sécurisée par OTP email configurable par l'admin
- Plans d'abonnement chatbot: Découverte, Essentiel, Professionnel, Entreprise
- Paiement MaishaPay avec callback et activation automatique de l'abonnement
- Factures envoyées par email après confirmation du paiement
- Base documentaire privée avec upload TXT/Markdown/CSV/JSON/PDF, embeddings OpenAI et recherche pgvector pour RAG chatbot
- Stockage optionnel des fichiers originaux dans Supabase Storage, tout en gardant Neon PostgreSQL comme base principale
- Module Entreprise: profil organisationnel, poste utilisateur, responsabilités, activités métier, processus, données, objectifs et KPI injectés dans le contexte privé du chatbot
- Ancienne page `/documents` redirigée vers `/company`; les documents restent gérés dans le module Entreprise selon les limites d'abonnement
- Sessions sécurisées par cookie signé
- Rôles: `ADMIN`, `MANAGER`, `CLIENT`, `SUPPORT`
- Middleware de protection des routes privées
- Dashboard client enrichi avec KPI entreprise, activités métier, documents prêts et usage IA journalier
- Interface chatbot avec sidebar de conversations
- Historique des conversations et messages en base
- Renommage et suppression de conversation
- Support markdown pour les réponses IA
- Copier une réponse assistant
- Tickets support
- Dashboard admin
- Suivi utilisateurs, conversations, messages, usage IA et tickets
- Gestion RBAC côté admin: modification des rôles `ADMIN`, `MANAGER`, `CLIENT`, `SUPPORT` et accès aux blocs Administration par rôle non-client
- Création de comptes utilisateurs par l'admin avec rôle et limites d'usage
- Limites journalières configurables par utilisateur: messages et tokens
- Indicateurs de limites visibles dans le chatbot
- Gestion support pour `ADMIN` et `SUPPORT`: traitement, résolution et clôture de tickets
- Pages publiques d'information: Data en Afrique, BI & KPI, IA en entreprise, secteurs accompagnés
- Pages publiques corporate: Services, Solutions, Secteurs, Projets, Ressources, À propos et Contact
- Analytics simples des visites publiques avec filtre par période dans `/admin`
- Filtre calendrier des visites publiques et graphique borné avec chiffres par jour
- Paramètres globaux admin: limites par défaut, activation chatbot, maintenance, règles annonces et support
- Paramètres OTP: activation et durée d'expiration des codes d'inscription
- Diffusion globale: notifications internes + email groupé protégé avec destinataires en CCI
- Adresse professionnelle DTSC: `contact@dtsc-platform.com`
- Formulaire public de contact transmis côté serveur vers Zoho Mail via webhook
- Inscription newsletter publique avec stockage en base et notification Zoho
- Diffusion email admin vers les utilisateurs actifs et les abonnés newsletter, avec personnalisation `{user}`, CCI confidentielle et éditeur riche pour conserver le format collé
- Fondations audit log et historisation des webhooks entrants
- Logs API, audit des paiements et exports CSV/HTML imprimable PDF
- Expiration automatique des sessions après 5 minutes sans activité avec avertissement premium
- SEO technique: métadonnées, sitemap, robots.txt, Open Graph et données structurées
- Module `/notifications` pour alertes tickets, annonces, réponses support et messages admin
- Module `/announcements` pour fil d'actualités interne avec publications selon rôle, commentaires et réactions
- Support repensé en discussion par ticket avec échanges jusqu'à résolution/clôture
- Paramètres complets: profil, mot de passe, mode clair/sombre/système et préférences de notifications
- Logo officiel DTSC et copyright 2026 sur les footers essentiels
- Rate limiting sur chat, connexion, inscription, contact et newsletter, avec Upstash Redis optionnel et fallback local
- Headers de sécurité globaux, blocage des requêtes cross-origin mutantes et protection contre l'en-tête `x-middleware-subrequest`
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
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_MODEL_IDS=gpt-5-nano,gpt-5-mini,gpt-4.1-mini
NEXT_PUBLIC_DEFAULT_MODEL=gpt-5-nano
ADMIN_EMAIL=
DEFAULT_ADMIN_EMAIL=admin@dtsc-platform.com
DEFAULT_ADMIN_PASSWORD=DtscAdmin2026!
DEFAULT_ADMIN_BOOTSTRAP_ENABLED=false
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
MAISHAPAY_API_URL=https://marchand.maishapay.online/api/payment/rest/vers1.0/merchant
MAISHAPAY_GATEWAY_MODE=0
MAISHAPAY_PUBLIC_API_KEY=
MAISHAPAY_SECRET_API_KEY=
MAISHAPAY_DEFAULT_PROVIDER=MPESA
MAISHAPAY_CALLBACK_SECRET=
SUPABASE_STORAGE_URL=
SUPABASE_STORAGE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=dtsc-documents
```

Notes:

- `OPENAI_API_KEY` ne doit jamais être exposé côté client.
- `AUTH_SECRET` doit être une chaîne aléatoire longue, au minimum 32 caractères.
- `ADMIN_EMAIL` donne automatiquement le rôle `ADMIN` au premier compte créé avec cet email.
- `DEFAULT_ADMIN_EMAIL` et `DEFAULT_ADMIN_PASSWORD` permettent le bootstrap du compte admin uniquement si `DEFAULT_ADMIN_BOOTSTRAP_ENABLED=true`.
- En production, garder `DEFAULT_ADMIN_BOOTSTRAP_ENABLED=false` après la création initiale de l'admin, puis changer le mot de passe depuis `/settings`.
- Sur Vercel, configurer ces variables dans Project Settings → Environment Variables.
- `ZOHO_MAIL_WEBHOOK_URL` doit contenir l'URL complète du webhook entrant Zoho Mail. Ne jamais la commiter dans le dépôt.
- `ZOHO_OUTBOUND_MAIL_WEBHOOK_URL` doit pointer vers le webhook Zoho/Zoho Flow chargé d'envoyer les emails directs. En diffusion, l'application place `DTSC_CONTACT_EMAIL` en destinataire principal et les membres en CCI.
- `ZOHO_OUTGOING_WEBHOOK_SECRET` protège l'URL applicative à configurer côté Zoho: `APP_URL/api/webhooks/zoho/outgoing-mail?secret=VOTRE_SECRET`.
- `DTSC_CONTACT_EMAIL` est l'adresse professionnelle affichée sur le site et utilisée dans les messages serveur.
- Si `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_CLIENT_SECRET` et `ZOHO_MAIL_REFRESH_TOKEN` sont configurés, l'application envoie les diffusions directement par l'API Zoho Mail avant de tenter les fallbacks webhook. Les listes d'adresses ne sont jamais ajoutées dans le contenu du mail.
- Dans les diffusions admin et newsletter, le placeholder `{user}` est remplacé par le nom de l'utilisateur ou de l'abonné. Lorsqu'il est présent, l'application envoie des mails personnalisés individuellement en CCI pour préserver la confidentialité.
- `ZOHO_MAIL_CLIENT_SECRET` et `ZOHO_MAIL_REFRESH_TOKEN` sont des secrets: ne jamais les commiter et les régénérer s'ils ont été partagés.
- `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` activent un rate limiting distribué en production. Si ces variables sont absentes, l'application utilise un fallback mémoire uniquement adapté au développement ou à faible charge.
- `MAISHAPAY_PUBLIC_API_KEY`, `MAISHAPAY_SECRET_API_KEY` et `MAISHAPAY_CALLBACK_SECRET` doivent être configurés dans Vercel pour activer les paiements payants. Le callback à fournir côté MaishaPay est `APP_URL/api/billing/maishapay/callback?secret=VOTRE_SECRET`.
- Tant que le prestataire de paiement n'a pas fourni les clés, ne créez pas ces variables dans Vercel ou laissez-les vides. L'application affichera les plans payants en maintenance et gardera le plan gratuit opérationnel.
- `OPENAI_EMBEDDING_MODEL` doit rester compatible avec la dimension pgvector configurée. Par défaut: `text-embedding-3-small` avec `vector(1536)`.
- `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` et `SUPABASE_STORAGE_BUCKET` activent uniquement le stockage des fichiers originaux dans Supabase Storage.

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

Le bootstrap automatique ne fonctionne que si `DEFAULT_ADMIN_BOOTSTRAP_ENABLED=true`. Utiliser cette option uniquement pour créer le premier admin, puis repasser la variable à `false` en production. Après connexion, changer le mot de passe dans `/settings`, puis remplacer `DEFAULT_ADMIN_PASSWORD` dans Vercel.

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

## Paiements MaishaPay

Les plans payants utilisent MaishaPay côté serveur. Tant que les clés MaishaPay ne sont pas configurées, le module `/billing` affiche une maintenance professionnelle pour les paiements payants. Le plan gratuit Découverte reste activable sans numéro M-Pesa.

Variables à ajouter seulement quand MaishaPay fournit les valeurs:

```bash
MAISHAPAY_PUBLIC_API_KEY
MAISHAPAY_SECRET_API_KEY
MAISHAPAY_CALLBACK_SECRET
```

Sur Vercel, il n'est pas nécessaire d'ajouter ces variables vides avant le push. Laissez-les absentes pour éviter toute confusion opérationnelle.

## Documents et Supabase Storage

La base documentaire accepte TXT, Markdown, CSV, JSON et PDF jusqu'à 2 Mo. Le plan Découverte autorise déjà 1 document afin de tester le flux complet. Le texte est extrait côté serveur, vectorisé avec OpenAI Embeddings et stocké dans Neon PostgreSQL via pgvector.

Supabase Storage est utilisé uniquement pour conserver les fichiers originaux si les variables Supabase sont configurées. Créer un bucket privé `dtsc-documents`, puis ajouter dans Vercel:

```bash
SUPABASE_STORAGE_URL
SUPABASE_STORAGE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=dtsc-documents
```

## Rôles Utilisateurs

- `ADMIN`: accès à `/admin`, supervision utilisateurs, conversations, tickets et usage IA.
- `MANAGER`: supervision métier et suivi opérationnel futur.
- `CLIENT`: rôle standard pour les clients DTSC.
- `SUPPORT`: traitement des tickets et accompagnement client.

## Routes Principales

- `/` landing page publique
- `/services` services DTSC
- `/solutions` solutions et offres concrètes
- `/secteurs` secteurs accompagnés
- `/projets` projets et démonstrations
- `/ressources` ressources publiques et publications admin
- `/a-propos` présentation DTSC et organisation
- `/contact` contact et newsletter
- `/auth/sign-in` connexion
- `/auth/sign-up` inscription
- `/dashboard` dashboard client
- `/chat` chatbot
- `/billing` abonnements et factures
- `/documents` base documentaire RAG
- `/profile` profil utilisateur
- `/settings` paramètres
- `/support` tickets support
- `/notifications` centre de notifications
- `/announcements` fil d'annonces
- `/admin` administration
- `/data-afrique` ressource publique historique
- `/bi-kpi` ressource publique historique
- `/ia-entreprise` ressource publique historique

## Administration Des Contenus Publics

Le module `/admin` contient une zone de publications publiques. L'admin peut créer, publier, modifier ou supprimer des contenus destinés à `/ressources`.

Champs principaux:

- titre;
- slug public unique;
- catégorie: `RESSOURCE`, `ARTICLE`, `GUIDE`, `CAS_PRATIQUE`, `ANNONCE`, `PROJET`;
- résumé;
- contenu long;
- libellé visuel;
- statut publié/brouillon.

Seules les publications marquées comme publiées sont visibles publiquement. Les contenus institutionnels fixes sont centralisés dans `lib/public-site.ts`.

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
  services/
  solutions/
  secteurs/
  projets/
  ressources/
  a-propos/
  contact/
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
  public-site.ts
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
DEFAULT_ADMIN_BOOTSTRAP_ENABLED
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
MAISHAPAY_API_URL
MAISHAPAY_GATEWAY_MODE
MAISHAPAY_PUBLIC_API_KEY
MAISHAPAY_SECRET_API_KEY
MAISHAPAY_DEFAULT_PROVIDER
MAISHAPAY_CALLBACK_SECRET
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
- Rate limiting distribué si Upstash Redis est configuré, sinon fallback mémoire sur `/api/chat`, `/api/auth/sign-in`, `/api/auth/sign-up`, `/api/public/contact` et `/api/public/newsletter`
- Limites applicatives par utilisateur sur messages/tokens journaliers
- Erreurs publiques génériques côté client
- Headers sécurité globaux via `next.config.ts`
- Protection middleware contre les requêtes cross-origin mutantes et l'en-tête `x-middleware-subrequest`

À renforcer avant forte charge:

- Remplacement complet du fallback mémoire par Redis/Upstash obligatoire sur forte charge
- Rotation de sessions
- MFA
- Journalisation d'audit
- Détection d'abus
- Politiques CSP strictes
- Remplacer le mot de passe admin par défaut dès la mise en production

## Roadmap

- Politique de rétention documentaire Supabase Storage
- Rate limiting distribué Upstash Redis
- Tickets support avancés
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
