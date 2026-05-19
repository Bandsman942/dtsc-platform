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
- PWA privée installable côté espace client
- Déploiement Vercel
- GitHub Actions CI/CD

## Documentation Technique

La documentation technique complete est disponible dans [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md).

## Fonctionnalités

- Landing page publique DTSC refondue avec navigation Accueil, Services, Solutions, Secteurs, Projets, Ressources, À propos et Contact
- FAQ premium sur l'accueil avec composant Accordion accessible, catégories métier et données structurées SEO `FAQPage`
- FAQ publique enrichie avec les questions sur l'assistant IA, le chatbot privé, les tickets, la sécurité, les ressources et les brouillons de publications
- Sections publiques harmonisées avec bandes visuelles alternées et cartes contrastées pour éviter la confusion entre blocs et arrière-plan
- Pages publiques dédiées avec onglet actif, contenus DTSC issus du business plan et sources vérifiables
- Publications publiques administrables depuis `/admin` pour alimenter la page Ressources sans modifier le code, avec lien visuel depuis l'accueil
- Contribution brouillon aux publications publiques pour rôles non-client autorisés, avec publication et suppression réservées aux administrateurs
- Recherche et pagination instantanées dans le catalogue admin des brouillons et articles publiés
- Éditeur riche pour les publications publiques et annonces: gras, italique, soulignement, palette de couleurs contrôlée, listes avancées, liens, emojis, collage d'images et upload d'images optimisées en WebP via Supabase Storage
- Publications publiques interactives: partage, likes, dislikes, commentaires, réponses aux commentaires et CRUD des commentaires aligné sur la logique RBAC des annonces
- Page Ressources organisée avec accordions par catégorie et mise en avant des 3 dernières publications
- Recherche intelligente sur les pages publiques via une barre large dédiée sous la navigation
- Agent IA public sur la landing page pour répondre aux questions DTSC, qualifier les prospects, enregistrer les demandes dans les inscrits newsletter et notifier l'équipe par email après confirmation
- Réponses progressives en streaming pour l'agent IA public, réglage admin permettant de l'activer/désactiver avec fallback informatif et garde-fous serveur contre les questions hors DTSC ou les ressources inventées
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
- Interface chatbot avec panneau mobile de conversations inspiré des applications de chat professionnelles
- Chatbot privé capable, après confirmation explicite, d'envoyer un message à DTSC ou de créer un ticket support à partir des informations collectées
- Historique des conversations et messages en base, avec dates/heures selon les préférences utilisateur, classement par dossier/projet et CRUD des dossiers
- Préférences chatbot persistantes: modèle préféré, style de réponse et longueur de réponse par utilisateur
- Renommage, classement et suppression de conversation
- Partage fonctionnel des conversations via API native du navigateur, copie du lien ou snapshot consultable dans un groupe Mes collaborateurs sans exposer la conversation privée originale
- Support markdown pour les réponses IA
- Copier une réponse assistant
- Tickets support
- Dashboard admin organisé en sous-modules: vue générale, RBAC, paramètres, publications, utilisateurs, HR & CFO, SCO, COO, CEO, MPO, CTO, LA, visites, activité et audits
- Sous-modules admin HR & CFO, SCO, MPO, CTO et LA avec RBAC et permissions métier par poste officiel: collaborateurs liés aux membres internes, départements, postes DTSC, comptes financiers, budgets contrôlés, transactions, paie, factures automatiques, fournisseurs, achats, stocks, actifs, logistique, projets numériques, pilotage technique, dossiers juridiques, contrats, conformité, litiges et archivage confidentiel
- Règles financières HR & CFO centralisées côté serveur: chiffre d'affaires hors capital de départ, soldes de comptes recalculés, budgets liés aux comptes, sorties bloquées si budget ou compte insuffisant, paie reliée au budget et abonnements payés enregistrés sur le compte Banque
- Sous-module COO avec opérations, tâches, réunions, blocages, rapports, workflows partagés et commentaires opérationnels sécurisés
- Sous-module CEO avec tableau de bord exécutif finance/RH/COO/SCO filtrable par période, objectifs stratégiques, alertes critiques et journal de supervision
- Module Activités DTSC pour collaborateurs: tâches, opérations, coordination, demandes collaboratives directes, blocages, rapports, workflows partagés, objectifs/supervisions CEO assignés, suivis SCO/MPO/CTO/LA, suivi de paie, mentions `@collaborateur` dans les commentaires et téléchargement des bulletins personnels
- Module privé Mes collaborateurs: groupes avec en-tête sobre et détails consultables au clic, invitations individuelles ou groupées acceptées/refusées, badges de mentions non lues, réponses à messages, membres, rôles de groupe, messagerie paginée avec menus `...`, couleurs stables par intervenant, mentions interactives, notifications, snapshots de conversations chatbot et contact contrôlé de l'équipe DTSC
- Filtres de dates immédiats dans HR & CFO, SCO, COO et Activités DTSC pour analyser les blocs visibles sur une période précise
- Page PWA `/offline` avec informations publiques DTSC, services, FAQ et contact essentiel consultables hors connexion sans cache de données privées, avec vérification automatique des mises à jour au retour en ligne pour les applications installées
- Vue générale admin enrichie avec filtres période/date, graphiques visites/messages/tokens, utilisateurs actifs, nouveaux comptes, tickets, paiements, revenus, prospects, documents, publications et erreurs API
- Gestion RBAC côté admin: modification des rôles `ADMIN`, `MANAGER`, `CLIENT`, `SUPPORT` et accès aux blocs Administration par rôle non-client
- Création de comptes utilisateurs par l'admin avec rôle et limites d'usage
- Limites journalières configurables par utilisateur: messages et tokens
- Indicateurs de limites visibles dans le chatbot
- Gestion support pour `ADMIN` et `SUPPORT`: traitement, résolution et clôture de tickets
- Pages publiques d'information: Data en Afrique, BI & KPI, IA en entreprise, secteurs accompagnés
- Pages publiques corporate: Services, Solutions, Secteurs, Projets, Ressources, À propos, Contact et politique des cookies
- Analytics simples des visites publiques avec filtre par période dans `/admin`, agrégation journalière et total calculé en temps réel
- Filtre calendrier des visites publiques et graphique borné avec chiffres par jour
- Paramètres globaux admin: limites par défaut, activation chatbot, assistant public, contribution brouillon publications, maintenance, règles annonces et support
- Paramètres OTP: activation et durée d'expiration des codes d'inscription
- Diffusion globale: notifications internes + email groupé protégé avec destinataires en CCI
- Adresse professionnelle DTSC: `contact@dtsc-platform.com`
- Formulaire public de contact transmis côté serveur vers Zoho Mail via webhook
- Inscription newsletter publique avec stockage en base et notification Zoho au format professionnel DTSC
- Prospects qualifiés par l'agent IA public: service demandé, description du besoin, urgence, budget facultatif, canal de contact préféré et résumé IA conservés dans les inscrits newsletter
- Diffusion email admin vers les utilisateurs actifs et les abonnés newsletter, avec personnalisation `{user}`, CCI confidentielle et éditeur riche pour conserver le format collé
- Fondations audit log et historisation des webhooks entrants
- Logs API, audit des paiements et exports CSV/HTML imprimable PDF
- Expiration automatique des sessions après 5 minutes sans activité avec avertissement premium
- SEO technique: métadonnées, sitemap, robots.txt, Open Graph et données structurées
- Module `/notifications` pour alertes tickets, annonces, réponses support et messages admin, avec extraits, état lu/non lu, préférences et alertes navigateur/PWA
- Module `/announcements` pour fil d'actualités interne avec publications selon rôle, commentaires scrollables, réponses, réactions et menu `...` permettant infos, modification, soft delete, copie, transfert intelligent multi-destinataires, indicateurs, signalement, archivage et épinglage
- Support repensé en discussion par ticket avec échanges jusqu'à résolution/clôture
- Paramètres complets: profil, mot de passe, mode clair/sombre/système, page de démarrage, densité d'interface, langue, fuseau horaire, format de date, synthèse email, modèle LLM préféré, style IA et préférences de notifications persistantes
- Logo officiel DTSC et copyright 2026 sur les footers essentiels
- Rate limiting sur chat, connexion, inscription, contact et newsletter, avec Upstash Redis optionnel et fallback local
- Headers de sécurité globaux, blocage des requêtes cross-origin mutantes et protection contre l'en-tête `x-middleware-subrequest`
- Validation des inputs avec Zod
- PWA avec manifest, icônes, page hors ligne, invitation publique d'installation sur l'accueil, notifications visibles pendant session connectée et service worker qui cache uniquement les assets statiques, jamais les API ni les pages privées

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
CONTACT_EMAIL=contact@dtsc-platform.com
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
- `CONTACT_EMAIL` peut pointer vers la même adresse et sert de destinataire explicite pour les notifications de prospects qualifiés par l'agent IA public.
- Si `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_CLIENT_SECRET` et `ZOHO_MAIL_REFRESH_TOKEN` sont configurés, l'application envoie les diffusions directement par l'API Zoho Mail avant de tenter les fallbacks webhook. Les listes d'adresses ne sont jamais ajoutées dans le contenu du mail.
- Dans les diffusions admin et newsletter, le placeholder `{user}` est remplacé par le nom de l'utilisateur ou de l'abonné. Lorsqu'il est présent, l'application envoie des mails personnalisés individuellement en CCI pour préserver la confidentialité.
- `ZOHO_MAIL_CLIENT_SECRET` et `ZOHO_MAIL_REFRESH_TOKEN` sont des secrets: ne jamais les commiter et les régénérer s'ils ont été partagés.
- `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` activent un rate limiting distribué en production. Si ces variables sont absentes, l'application utilise un fallback mémoire uniquement adapté au développement ou à faible charge.
- `MAISHAPAY_PUBLIC_API_KEY`, `MAISHAPAY_SECRET_API_KEY` et `MAISHAPAY_CALLBACK_SECRET` doivent être configurés dans Vercel pour activer les paiements payants. Le callback à fournir côté MaishaPay est `APP_URL/api/billing/maishapay/callback?secret=VOTRE_SECRET`.
- Tant que le prestataire de paiement n'a pas fourni les clés, ne créez pas ces variables dans Vercel ou laissez-les vides. L'application affichera les plans payants en maintenance et gardera le plan gratuit opérationnel.
- `OPENAI_EMBEDDING_MODEL` doit rester compatible avec la dimension pgvector configurée. Par défaut: `text-embedding-3-small` avec `vector(1536)`.
- `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` et `SUPABASE_STORAGE_BUCKET` activent le stockage des fichiers originaux, des avatars et des images optimisées des publications publiques dans Supabase Storage.

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

Supabase Storage est utilisé pour conserver les fichiers originaux, les avatars et les images optimisées des publications publiques si les variables Supabase sont configurées. Créer un bucket privé `dtsc-documents`, puis ajouter dans Vercel:

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

Le module `/admin` contient une zone de publications publiques. L'admin peut créer, publier, modifier ou supprimer des contenus destinés à `/ressources`, insérer des images optimisées en format web, les prévisualiser avant publication, les repositionner dans le corps de la publication via l'éditeur riche et retirer une image en cliquant dessus puis sur l'icône de suppression.

Le catalogue des articles et brouillons utilise une recherche intelligente instantanée et une pagination côté interface pour éviter une page Administration trop longue. Chaque élément affiche son auteur, son statut, ainsi que la date et l'heure de publication ou de mise en brouillon. Les modifications sont synchronisées immédiatement côté interface, puis les données serveur sont rafraîchies.

Champs principaux:

- titre;
- slug public unique;
- catégorie: `RESSOURCE`, `ARTICLE`, `GUIDE`, `CAS_PRATIQUE`, `ANNONCE`, `PROJET`;
- résumé;
- contenu long;
- libellé visuel;
- statut publié/brouillon.

Seules les publications marquées comme publiées sont visibles publiquement. Dans `/ressources`, elles sont regroupées par catégorie dans des accordions, tandis que les cartes visibles présentent seulement les 3 derniers contenus publiés. Les contenus institutionnels fixes sont centralisés dans `lib/public-site.ts` et l'index de recherche publique dans `lib/public-search.ts`.

Les utilisateurs connectés peuvent liker/disliker, commenter et répondre aux commentaires sur une publication publique. Un utilisateur peut modifier son propre commentaire dans la fenêtre configurée par l'admin; seul `ADMIN` peut supprimer un commentaire.

## Administration HR & CFO / SCO / CEO / MPO / CTO / LA

Les sous-modules internes complètent l'administration:

- `HR & CFO`: départements, postes officiels DTSC, comptes financiers, collaborateurs liés aux utilisateurs non-clients, budgets, transactions et paie. Les budgets exigent un compte suffisamment provisionné; les sorties exigent un budget disponible; les transactions validées mettent à jour les soldes et peuvent générer une facture exportable.
- `SCO`: référentiel des biens matériels DTSC, fournisseurs, demandes d'achat, stocks, inventaire, actifs, équipements et logistique des missions ou événements. Le fournisseur retenu d'une demande d'achat se choisit dans la liste des fournisseurs déjà enregistrés, et les champs Responsable/Demandeur/Assigné à s'appuient sur les collaborateurs déjà créés. Un collaborateur dont le dossier RH porte le poste officiel `SCO` peut accéder aux opérations SCO autorisées.
- `CEO`: tableau de bord exécutif consolidant finance, RH, COO et SCO avec filtre de période dédié, suivi des objectifs stratégiques et journal de supervision. Les objectifs et suivis assignés apparaissent dans `Activités DTSC` chez les collaborateurs concernés avec commentaires et notifications ciblées.
- `MPO`: portefeuille des projets numériques, cadrage des besoins, cahiers de charges, livrables, risques, rapports, documentation et demandes budgétaires ou matérielles liées aux projets.
- `CTO`: projets techniques, architecture, tâches de développement, APIs, bases de données, déploiements, sécurité, bugs/incidents, qualité et besoins techniques liés à SCO ou HR & CFO.
- `LA`: dossiers juridiques, contrats et conventions, modèles juridiques, risques de conformité, documents officiels, litiges, demandes juridiques internes et rapports. Les documents très confidentiels sont réservés à LA, CEO ou administrateur autorisé.

Ces sections utilisent le RBAC Administration existant et les postes officiels du dossier RH: `ADMIN` conserve l'accès complet, tandis que `MANAGER` et `SUPPORT` peuvent recevoir ou perdre l'accès depuis le bloc `Accès RBAC`; les postes `CEO`, `COO`, `HR_CFO`, `SCO`, `CTO`, `MPO` et `LA` complètent les droits métier côté serveur. Chaque sous-module dispose de formulaires de création, listes paginées, recherche intelligente, modification de statut, notes de suivi, suppression contrôlée, journalisation API et audit log. Les KPI génériques ont été remplacés par des indicateurs actionnables: éléments actifs, priorités à traiter, transactions impactantes, tâches bloquées/en retard ou décisions à suivre selon la section.

## PWA

DTSC Platform est installable comme application depuis l'espace privé authentifié.

- Manifest: `app/manifest.ts`
- Start URL: `/dashboard`
- Service worker: `public/sw.js`
- Page hors ligne: `/offline`
- Icônes: `public/icons/icon-192x192.png`, `public/icons/icon-512x512.png`, `public/icons/maskable-icon-512x512.png`, `public/icons/apple-touch-icon.png`

Le prompt discret reste disponible dans le shell privé. La page d'accueil affiche aussi une carte publique "Installer l'application" pour aider les visiteurs à ajouter DTSC Platform sur mobile avant d'ouvrir leur espace client. Le service worker ne met pas en cache les réponses `/api/*`, les routes d'authentification ni les pages privées contenant des données utilisateur; il cache seulement les assets statiques, icônes, images publiques, polices, JS et CSS.

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
- Visibilité des sections Administration sensibles basée sur le poste officiel RH (`DtscPosition`) en plus du RBAC: HR_CFO, SCO, COO, CEO, MPO, CTO et LA
- Administration COO avec RBAC configurable, suivi des opérations internes, tâches, blocages, réunions, workflows et rapports
- Activités DTSC permet aux collaborateurs RH actifs de créer des réunions COO et de soumettre des dossiers, contrats, risques, litiges ou demandes juridiques vers LA sans accès direct aux sections Administration
- Vue CEO consolidée enrichie pour MPO, CTO et LA avec filtres de période conservés dans l'URL
- Bloc Administration > Utilisateurs > Inscrits newsletter pour qualifier, archiver, désabonner ou lier explicitement un prospect newsletter à un utilisateur existant
- Pièces justificatives HR & CFO / SCO / COO importées depuis l'appareil et stockées côté serveur dans Supabase Storage
- Boutons de téléchargement visibles pour les factures et les bulletins de paie imprimables/exportables en PDF
- Module privé `Activités DTSC` pour les utilisateurs reliés à un dossier collaborateur HR & CFO

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
