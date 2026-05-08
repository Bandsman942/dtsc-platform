# Documentation technique DTSC Platform

Derniere mise a jour: 08 mai 2026

Cette documentation decrit ce qui est deja code dans l'application DTSC Platform: architecture, base de donnees, authentification, modules fonctionnels, API internes, API externes connectees et methode recommandee pour connecter l'application a d'autres systemes.

## 1. Vue d'ensemble

DTSC Platform est une application SaaS Next.js App Router pour DTSC - Data and Tech Solutions Consulting.

Objectifs couverts par le code actuel:

- landing page publique DTSC refondue avec navigation corporate vers des pages dediees: Services, Solutions, Secteurs, Projets, Ressources, A propos et Contact;
- FAQ premium sur la page d'accueil publique, organisee par categories et exposee en donnees structurees `FAQPage` pour le SEO;
- pages publiques avec hero visuel en carrousel automatique, images thematiques multiples par page, indicateurs manuels et animations legeres;
- bandes visuelles publiques alternees (`dtsc-public-band-light`, `dtsc-public-band-soft`, `dtsc-public-band-cyan`) et cartes contrastees pour eviter que les blocs aient la meme couleur que l'arriere-plan;
- publications publiques administrables depuis l'administration pour alimenter regulierement la page Ressources, avec images optimisees, reactions, commentaires et reponses aux commentaires;
- authentification maison avec sessions securisees par cookie HTTP-only, comparaison de signature en temps constant et OTP email optionnel a l'inscription;
- plans d'abonnement chatbot avec MaishaPay, callback, factures et activation automatique;
- base documentaire privee avec upload texte, extraction, embeddings OpenAI et recherche pgvector pour le RAG chatbot;
- module Entreprise permettant a chaque utilisateur de renseigner son organisation, son poste, ses activites, ses processus, ses donnees, ses objectifs et ses KPI pour enrichir le contexte prive du chatbot;
- roles `ADMIN`, `MANAGER`, `SUPPORT`, `CLIENT`;
- tableau de bord client enrichi avec KPI d'entreprise, activites, documents et usage IA;
- chatbot OpenAI avec historique des conversations, streaming et limites d'usage;
- notifications internes;
- annonces internes avec commentaires et reactions;
- editeur de texte riche reutilisable avec barre d'outils fixe, zone d'ecriture scrollable, polices modernes, tailles, alignements, puces, numerotations, gras, italique, souligne, couleurs et collage de contenus riches;
- support sous forme de tickets conversationnels;
- administration utilisateurs, limites d'usage, parametres globaux, visites publiques, diffusions et acces par blocs pour les roles non-client;
- fondations techniques pour audit log et historisation de webhooks;
- protections production: headers securite, blocage cross-origin des requetes API mutantes, blocage `x-middleware-subrequest`, rate limiting Upstash Redis optionnel avec fallback local;
- logs API, audit des paiements et exports CSV/HTML imprimable PDF;
- integrations OpenAI, Neon PostgreSQL, Prisma, Zoho Mail API, Zoho webhooks et Vercel.

## 2. Stack technique

- Framework: Next.js 15 App Router
- Langage: TypeScript
- UI: React 19.1.2+, Tailwind CSS, lucide-react, composants locaux
- Base de donnees: Neon PostgreSQL
- ORM: Prisma
- IA: OpenAI Responses API cote serveur
- Email: Zoho Mail API directe + fallbacks webhook Zoho
- Validation: Zod
- Deploiement: Vercel
- CI: GitHub Actions avec `pnpm type-check`

Scripts importants:

```bash
pnpm dev
pnpm build
pnpm type-check
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:deploy
pnpm prisma:studio
```

## 3. Structure du projet

```txt
app/
  api/                         Routes API Next.js
  admin/                       Dashboard admin
  announcements/               Fil d'annonces interne
  auth/sign-in/                Connexion
  auth/sign-up/                Inscription
  chat/                        Interface chatbot
  company/                     Contexte entreprise + documents
  dashboard/                   Dashboard client
  documents/                   Redirection historique vers /company
  notifications/               Centre de notifications
  profile/                     Profil utilisateur, CRUD profil, avatar et consentement public
  settings/                    Parametres compte/theme
  support/                     Tickets support
  page.tsx                     Landing page
  services/                    Page publique services
  solutions/                   Page publique solutions
  projets/                     Page publique projets et demonstrations
  ressources/                  Page publique ressources + publications admin
  a-propos/                    Page publique entreprise et organisation
  contact/                     Page publique contact/newsletter
  sitemap.ts                   Sitemap SEO
  robots.ts                    Robots SEO

components/
  admin/                       UI administration
  announcements/               UI annonces
  auth/                        Formulaires auth
  chat/                        UI chatbot
  company/                     UI profil entreprise et activites metier
  dashboard/                   UI dashboard
  layout/                      Shell prive, navigation
  notifications/               UI notifications
  profile/                     Edition profil utilisateur et avatar
  public/                      Sections landing page
  public/hero-image-carousel   Carrousel client pour les images hero publiques
  settings/                    Parametres utilisateur
  support/                     UI tickets support
  ui/                          Boutons, inputs, dialogues, accordion, etc.

lib/
  auth.ts                      Session serveur et helpers RBAC
  session.ts                   Signature/verif token session HMAC
  security.ts                  Hashage PBKDF2 des mots de passe
  env.ts                       Validation des variables d'environnement
  openai.ts                    Integration OpenAI Responses API
  company-context.ts           Contexte entreprise prive injecte dans le chatbot
  admin-access.ts              Acces aux blocs Administration par role
  rag.ts                       Extraction texte, embeddings et recherche pgvector
  zoho-mail.ts                 Integration Zoho Mail/webhooks
  prisma.ts                    Client Prisma
  validators.ts                Schemas Zod
  rate-limit.ts                Rate limit Upstash Redis optionnel avec fallback memoire
  settings.ts                  Parametres globaux
  notifications.ts             Creation notifications
  public-site.ts               Contenus publics corporate, sources et pages dediees

prisma/
  schema.prisma                Modele de donnees
  migrations/                  Migrations SQL
```

## 4. Variables d'environnement

Les variables sont documentees dans `env.example`.

Variables critiques:

```txt
DATABASE_URL=
OPENAI_API_KEY=
AUTH_SECRET=
APP_URL=
OPENAI_MODEL=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_MODEL_IDS=
NEXT_PUBLIC_DEFAULT_MODEL=
ADMIN_EMAIL=
DEFAULT_ADMIN_EMAIL=
DEFAULT_ADMIN_PASSWORD=
DEFAULT_ADMIN_BOOTSTRAP_ENABLED=false
DTSC_CONTACT_EMAIL=
```

Zoho:

```txt
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
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
CRM_API_URL=
CRM_API_KEY=
```

Notes securite:

- `DEFAULT_ADMIN_BOOTSTRAP_ENABLED` doit rester `false` en production apres la creation initiale du compte admin.
- `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` activent le rate limiting distribue. Sans ces variables, le code utilise un fallback memoire non garanti en multi-instance serverless.
- Les secrets MaishaPay, Supabase Storage, Zoho Mail et OpenAI restent strictement cote serveur.
- Les avatars utilisent aussi Supabase Storage, mais l'affichage passe par la route interne `/api/users/[id]/avatar`. Le bucket peut donc rester prive; la service role key reste cote serveur.

Regles:

- `OPENAI_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `ZOHO_MAIL_CLIENT_SECRET`, `ZOHO_MAIL_REFRESH_TOKEN` ne doivent jamais etre exposes cote client.
- `AUTH_SECRET` doit faire au moins 32 caracteres.
- Les webhooks contenant un secret doivent rester dans Vercel Environment Variables.

## 5. Base de donnees Prisma / Neon PostgreSQL

Le datasource Prisma utilise `DATABASE_URL`.

Modeles actifs:

| Modele | Role |
| --- | --- |
| `User` | Compte utilisateur, role, statut, limites journalieres, profil professionnel, avatar et consentement public |
| `PendingRegistration` | Pre-inscriptions en attente de verification OTP |
| `BillingPlan` | Plans d'abonnement chatbot |
| `Subscription` | Abonnement actif ou en attente de paiement |
| `Payment` | Paiement MaishaPay et audit paiement |
| `Invoice` | Facture utilisateur envoyee par email |
| `KnowledgeDocument` | Document prive indexe pour le RAG avec chemin Supabase Storage optionnel |
| `KnowledgeChunk` | Segment documentaire et embedding pgvector |
| `CompanyProfile` | Profil entreprise prive d'un utilisateur: organisation, secteur, processus, donnees, objectifs, KPI et poste |
| `CompanyActivity` | Activites professionnelles declarees par l'utilisateur pour contextualiser le chatbot |
| `Conversation` | Conversation chatbot rattachee a un utilisateur |
| `Message` | Message utilisateur/assistant/systeme |
| `UsageLog` | Suivi tokens, modele et cout estime |
| `Organization` | Base organisationnelle prevue |
| `NewsletterSubscriber` | Abonnes newsletter publics |
| `ContactMessage` | Messages publics de contact |
| `PublicPublication` | Publication publique administrable pour Ressources, guides, annonces et cas pratiques |
| `PublicPublicationComment` | Commentaire ou reponse de commentaire sur une publication publique, rattache a un utilisateur connecte |
| `PublicPublicationReaction` | Like/dislike d'un utilisateur sur une publication publique |
| `SupportTicket` | Ticket support |
| `TicketMessage` | Discussion dans un ticket |
| `SiteVisit` | Visites publiques du site |
| `Notification` | Notifications internes |
| `Announcement` | Publication interne |
| `AnnouncementComment` | Commentaire d'annonce |
| `AnnouncementReaction` | Like/dislike d'annonce |
| `AppSetting` | Parametres globaux admin, dont les acces aux blocs Administration par role |
| `AuditLog` | Journalisation des actions sensibles |
| `WebhookEvent` | Historisation des webhooks entrants |
| `ApiLog` | Journalisation des appels API critiques |

Champs profil utilisateur ajoutes:

- `jobTitle`, `bio`, `location`, `website`: informations professionnelles facultatives;
- `avatarUrl`: URL d'affichage de la photo de profil, renseignee manuellement ou pointee vers `/api/users/[id]/avatar`;
- `avatarStoragePath`: chemin prive Supabase Storage pour lire l'avatar via la route serveur;
- `publicProfileConsent`: consentement explicite pour afficher le nom, la fonction et l'avatar sur les publications publiques dont l'utilisateur est auteur.

Enums:

- `UserRole`: `ADMIN`, `MANAGER`, `CLIENT`, `SUPPORT`
- `UserStatus`: `ACTIVE`, `SUSPENDED`, `PENDING`
- `MessageRole`: `user`, `assistant`, `system`
- `TicketStatus`: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`
- `TicketPriority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `DocumentStatus`: `PROCESSING`, `READY`, `FAILED`

Les migrations Vercel sont appliquees par:

```bash
pnpm prisma migrate deploy
```

## 6. Authentification et sessions

L'application utilise une authentification maison.

Fichiers principaux:

- `lib/security.ts`: hashage PBKDF2 SHA-256 avec salt aleatoire.
- `lib/session.ts`: creation et verification d'un token signe HMAC SHA-256, avec comparaison de signature en temps constant pour eviter les fuites par timing.
- `lib/auth.ts`: lecture/ecriture du cookie de session.
- `middleware.ts`: protection des routes privees et admin, blocage de l'en-tete `x-middleware-subrequest`, blocage des requetes API mutantes provenant d'une autre origine sauf routes webhook autorisees.
- `lib/otp.ts`: generation, stockage temporaire et verification des OTP d'inscription.

Cookie:

- nom: `dtsc_session`;
- HTTP-only;
- `sameSite: lax`;
- `secure` en production;
- expiration configuree via `SESSION_MAX_AGE_SECONDS`.

Routes publiques d'auth:

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/sign-out`
- `POST /api/auth/heartbeat`

Workflow OTP d'inscription:

1. Le visiteur remplit le formulaire d'inscription.
2. `POST /api/auth/sign-up` verifie si `signUpOtpEnabled` est active.
3. Si aucun `otp` n'est fourni, l'application cree ou remplace une entree `PendingRegistration`, genere un code a 6 chiffres, stocke son hash et envoie le code par email.
4. La reponse contient `otpRequired: true` et `expiresAt`.
5. Le visiteur saisit le code; le frontend renvoie les donnees avec `otp`.
6. La route verifie le hash, l'expiration et le nombre de tentatives.
7. Si le code est valide, le compte `User` est cree, l'entree temporaire est supprimee et une session est ouverte.

Parametres admin:

- `signUpOtpEnabled`: active/desactive l'OTP a l'inscription.
- `signUpOtpExpirationMinutes`: duree de validite du code, entre 2 et 60 minutes.

Securite OTP:

- le code brut n'est pas stocke;
- le hash PBKDF2 est stocke dans `PendingRegistration.otpHash`;
- apres 5 tentatives invalides, la pre-inscription est supprimee;
- un code expire supprime aussi la pre-inscription.

Routes protegees par middleware:

- `/dashboard`
- `/chat`
- `/billing`
- `/company`
- `/documents`
- `/profile`
- `/settings`
- `/support`
- `/notifications`
- `/announcements`
- `/admin`

`/documents` reste disponible comme ancienne route et redirige vers `/company`. `/admin` est visible pour `ADMIN`, `MANAGER` et `SUPPORT`; les blocs internes sont controles par `AppSetting.adminRoleAccess`. Le role `CLIENT` est redirige vers `/dashboard`.

## 7. RBAC

Regles codees:

- `ADMIN`: acces admin complet, gestion utilisateurs, parametres globaux, diffusions, moderation globale annonces/commentaires, resolution support et configuration des blocs Administration visibles par role.
- `SUPPORT`: acces aux tickets, resolution support et aux blocs Administration autorises.
- `MANAGER`: peut publier des annonces internes et acceder aux blocs Administration autorises.
- `CLIENT`: acces dashboard, chatbot, support, notifications, annonces en lecture/commentaire/reaction.

Blocs Administration configurables par `ADMIN`:

- `overview`: statistiques generales;
- `settings`: parametres globaux et diffusions;
- `publications`: contenus publics administrables;
- `users`: utilisateurs, roles et limites;
- `visits`: visites du site;
- `activity`: conversations, utilisateurs et tickets;
- `audits`: paiements, logs API et webhooks.

Les blocs `Audit des paiements` et `Logs API et webhooks` utilisent `ListControls` et `useSmartList` pour une recherche accent-insensible et une pagination cote UI.

Regles annonces:

- `ADMIN`, `MANAGER`, `SUPPORT` peuvent publier.
- `CLIENT` peut publier uniquement si `allowClientAnnouncements` est active dans `AppSetting`.
- `ADMIN` peut modifier/supprimer toutes les annonces et commentaires.
- Un utilisateur peut modifier son propre commentaire dans la fenetre configuree.

## 8. Chatbot OpenAI

Fichiers:

- `app/api/chat/route.ts`
- `lib/openai.ts`
- `lib/openai-config.ts`

Flux:

1. Le client appelle `POST /api/chat`.
2. La route verifie la session.
3. Rate limit: 30 requetes par heure et par utilisateur via Upstash Redis si configure, sinon fallback memoire.
4. Verification du statut utilisateur.
5. Verification des parametres globaux: chatbot actif, maintenance inactive.
6. Verification des limites journalieres:
   - nombre de messages utilisateur;
   - total tokens depuis `UsageLog`.
7. Creation ou recuperation de la conversation.
8. Sauvegarde du message utilisateur.
9. Recuperation du contexte Entreprise prive via `lib/company-context.ts`, si renseigne.
10. Envoi des 24 derniers messages a OpenAI Responses API, avec contexte Entreprise et contexte documentaire lorsque pertinent.
11. Streaming du texte vers le client.
12. Sauvegarde de la reponse assistant et du `UsageLog`.

Le contexte Entreprise est strictement rattache au `userId` connecte. Il contient uniquement les informations saisies par l'utilisateur dans `/company`: organisation, poste, responsabilites, activites, processus, outils, donnees, contraintes, objectifs et KPI.

Si des documents utilisateur sont indexes:

1. la question est vectorisee avec `OPENAI_EMBEDDING_MODEL`;
2. `pgvector` recupere les chunks les plus proches du meme `userId`;
3. le contexte documentaire est injecte uniquement dans la requete OpenAI en cours;
4. les chunks d'un autre utilisateur ne sont jamais consultes.

Endpoint OpenAI utilise:

```txt
POST https://api.openai.com/v1/responses
```

Payload principal:

```json
{
  "model": "gpt-5-nano",
  "instructions": "DTSC_SYSTEM_PROMPT",
  "input": [
    { "role": "user", "content": "..." }
  ],
  "stream": true,
  "store": false
}
```

Variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_MODEL_IDS`
- `NEXT_PUBLIC_DEFAULT_MODEL`

Endpoint modeles:

- `GET /api/models`: renvoie le modele par defaut et la liste des modeles configurables.

## 9. API internes

Toutes les routes API retournent du JSON sauf `POST /api/chat`, qui retourne un flux texte.

### Authentification

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/sign-up` | public | Inscription client ou admin si email = `ADMIN_EMAIL` |
| `POST` | `/api/auth/sign-in` | public | Connexion, creation cookie session |
| `POST` | `/api/auth/sign-out` | session | Suppression cookie session |
| `POST` | `/api/auth/heartbeat` | session | Maintien/verif session cote client |

### Compte

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `PATCH` | `/api/account/profile` | session | Mise a jour nom, entreprise, telephone, poste, bio, localisation, site, avatar URL et consentement public |
| `POST` | `/api/account/avatar` | session | Upload photo de profil PNG/JPG/WebP optimisee en WebP 512x512 cote client, maximum 850 Ko cote serveur |
| `GET` | `/api/users/[id]/avatar` | proprietaire ou profil public consenti | Lecture serveur de l'avatar stocke dans Supabase Storage prive |
| `PATCH` | `/api/account/password` | session | Changement mot de passe |

### Chatbot et conversations

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/chat` | session | Generation OpenAI en streaming |
| `PATCH` | `/api/company/profile` | session | Creation ou mise a jour du profil entreprise prive |
| `DELETE` | `/api/company/profile` | session | Suppression du profil entreprise prive |
| `POST` | `/api/company/activities` | session | Creation d'une activite professionnelle |
| `PATCH` | `/api/company/activities/[id]` | proprietaire | Mise a jour d'une activite professionnelle |
| `DELETE` | `/api/company/activities/[id]` | proprietaire | Suppression d'une activite professionnelle |
| `GET` | `/api/documents` | session | Liste des documents indexes |
| `POST` | `/api/documents` | session | Upload, extraction, embeddings et indexation |
| `DELETE` | `/api/documents/[id]` | proprietaire | Suppression d'un document et de ses chunks |
| `GET` | `/api/models` | public | Modeles OpenAI configures |
| `GET` | `/api/conversations` | session | Liste conversations utilisateur |
| `POST` | `/api/conversations` | session | Nouvelle conversation |
| `GET` | `/api/conversations/[id]` | session proprietaire | Detail conversation/messages |
| `PATCH` | `/api/conversations/[id]` | session proprietaire | Renommer conversation |
| `DELETE` | `/api/conversations/[id]` | session proprietaire | Supprimer conversation |

### Support

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/support/tickets` | session | Creation ticket |
| `PATCH` | `/api/support/tickets/[id]` | `ADMIN` ou `SUPPORT` | Statut, priorite, resolution |
| `POST` | `/api/support/tickets/[id]/messages` | participant ou equipe | Ajouter un message au ticket |

### Notifications

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `DELETE` | `/api/notifications` | session | Vider ses notifications |
| `PATCH` | `/api/notifications/[id]/read` | session proprietaire | Marquer comme lu |
| `DELETE` | `/api/notifications/[id]` | session proprietaire | Supprimer une notification |

### Annonces

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/announcements` | roles autorises | Creer annonce |
| `PATCH` | `/api/announcements/[id]` | `ADMIN` | Modifier annonce |
| `DELETE` | `/api/announcements/[id]` | `ADMIN` | Supprimer annonce |
| `POST` | `/api/announcements/[id]/comments` | session | Commenter |
| `PATCH` | `/api/announcements/comments/[id]` | auteur dans delai ou `ADMIN` | Modifier commentaire |
| `DELETE` | `/api/announcements/comments/[id]` | `ADMIN` | Supprimer commentaire |
| `POST` | `/api/announcements/[id]/reactions` | session | Like/dislike |

Les annonces acceptent `contentHtml` en plus de `content`. Le HTML riche est nettoye cote serveur avec `sanitizeRichHtml` avant stockage. L'interface de creation et d'edition utilise l'editeur riche commun, avec barre d'outils fixe et zone de saisie scrollable.

### Administration

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/admin/users` | `ADMIN` | Creation utilisateur avec role |
| `PATCH` | `/api/admin/users/[id]/role` | `ADMIN` | Modification role |
| `PATCH` | `/api/admin/users/[id]/status` | `ADMIN` | Activation/suspension/statut |
| `PATCH` | `/api/admin/users/[id]/limits` | `ADMIN` | Limites messages/tokens |
| `PATCH` | `/api/admin/settings` | `ADMIN` | Parametres globaux |
| `POST` | `/api/admin/publications` | `ADMIN` | Creation d'une publication publique |
| `PATCH` | `/api/admin/publications/[id]` | `ADMIN` | Modification d'une publication publique |
| `DELETE` | `/api/admin/publications/[id]` | `ADMIN` | Suppression d'une publication publique |
| `PATCH` | `/api/admin/access` | `ADMIN` | Mise a jour des blocs Administration visibles par role non-client |
| `POST` | `/api/admin/broadcast` | `ADMIN` | Notification interne + email utilisateurs, avec logs API et cause d'erreur explicite |
| `POST` | `/api/admin/newsletter-broadcast` | `ADMIN` | Email abonnes newsletter, avec logs API et cause d'erreur explicite |
| `GET` | `/api/admin/exports/payments` | `ADMIN` | Export CSV compatible Excel des paiements |

### Billing et paiements

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `GET` | `/api/billing/plans` | public | Liste des plans actifs |
| `POST` | `/api/billing/checkout` | session | Cree une souscription et initie MaishaPay |
| `POST` | `/api/billing/maishapay/callback` | secret MaishaPay | Callback paiement et activation automatique |
| `GET` | `/api/invoices/[id]/pdf` | proprietaire ou `ADMIN` | Facture HTML imprimable/exportable PDF |

### Public

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/public/contact` | public | Formulaire contact, sauvegarde DB, webhook Zoho |
| `POST` | `/api/public/newsletter` | public | Inscription newsletter, sauvegarde DB, webhook Zoho |
| `POST` | `/api/analytics/visit` | public | Enregistrement visite publique |

### Webhooks

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `GET` | `/api/webhooks/zoho/outgoing-mail?secret=...` | secret | Test webhook sortant Zoho |
| `POST` | `/api/webhooks/zoho/outgoing-mail?secret=...` | secret | Reception payload Zoho sortant |

## 10. Formats de payload principaux

### Inscription

```json
{
  "name": "Nom utilisateur",
  "email": "client@example.com",
  "password": "motdepassefort",
  "companyName": "Entreprise",
  "phone": "+243...",
  "otp": "123456"
}
```

Premier appel sans `otp`, si l'OTP est active:

```json
{
  "ok": true,
  "otpRequired": true,
  "email": "client@example.com",
  "expiresAt": "2026-05-06T10:20:00.000Z"
}
```

Second appel avec `otp`: creation du compte et ouverture de session.

### Connexion

```json
{
  "email": "client@example.com",
  "password": "motdepasse"
}
```

### Chat

```json
{
  "conversationId": "optionnel",
  "content": "Votre question",
  "model": "gpt-5-nano"
}
```

Reponse:

- `text/plain` stream;
- header `X-Conversation-Id`.

### Ticket support

```json
{
  "subject": "Probleme de connexion",
  "description": "Description detaillee du besoin",
  "priority": "MEDIUM"
}
```

### Annonce

```json
{
  "title": "Titre annonce",
  "content": "Contenu annonce"
}
```

### Diffusion utilisateurs

```json
{
  "title": "Objet",
  "body": "Bonjour {user}, message personnalise.",
  "type": "BROADCAST"
}
```

`{user}` est remplace par le nom du destinataire. Si `{user}` est present, l'application envoie des messages personnalises individuellement.
La notification interne creee pour chaque utilisateur applique aussi ce remplacement, afin que le centre de notifications n'affiche jamais la variable brute `{user}`.
Le payload peut aussi contenir `bodyHtml`; l'editeur riche conserve la mise en forme utile avant nettoyage serveur et envoi email.

Reponse reussie:

```json
{
  "ok": true,
  "recipientCount": 12,
  "zoho": {
    "sent": true,
    "provider": "zoho-mail-api"
  }
}
```

En cas d'echec serveur, la route retourne un champ `message` lisible par l'administrateur et journalise la cause dans `ApiLog`. Les listes completes d'emails ne sont pas renvoyees au client.

### Diffusion newsletter

```json
{
  "subject": "Objet newsletter",
  "content": "Bonjour {user}, contenu newsletter."
}
```

Reponse reussie:

```json
{
  "ok": true,
  "recipientCount": 120,
  "zoho": {
    "sent": true,
    "provider": "zoho-mail-api"
  }
}
```

En cas de payload invalide, la route retourne un message explicite sur la longueur minimale de l'objet ou du contenu. En cas d'erreur serveur, la cause est journalisee dans `ApiLog`.

### Publication publique admin

Routes:

```txt
POST /api/admin/publications
PATCH /api/admin/publications/[id]
DELETE /api/admin/publications/[id]
```

Payload `POST` et `PATCH`:

```json
{
  "title": "Guide pratique data pour PME",
  "slug": "guide-data-pme",
  "category": "GUIDE",
    "excerpt": "Résumé visible dans la page Ressources.",
    "content": "Contenu long destiné aux visiteurs publics.",
    "contentHtml": "<p>Version HTML riche optionnelle nettoyée côté serveur.</p>",
    "coverLabel": "Data & PME",
    "published": true
  }
```

Categories autorisees:

- `RESSOURCE`
- `ARTICLE`
- `GUIDE`
- `CAS_PRATIQUE`
- `ANNONCE`
- `PROJET`

Regles:

- seul `ADMIN` peut creer, modifier ou supprimer;
- le `slug` doit etre unique, en minuscules, avec tirets;
- le bloc Administration utilise un editeur riche pour conserver le gras, l'italique, les couleurs, les liens, les images externes et les emojis;
- `contentHtml` est nettoye avec `sanitizeRichHtml` avant stockage pour supprimer scripts, iframes, handlers `on*` et URLs `javascript:`;
- seules les publications `published=true` apparaissent sur `/ressources` et `/ressources/[slug]`;
- chaque mutation est journalisee dans `AuditLog`;
- les publications servent aux contenus publics mis a jour regulierement sans redeploiement applicatif.

### Acces Administration par role

Route:

```txt
PATCH /api/admin/access
```

Acces: `ADMIN` uniquement.

Payload:

```json
{
  "MANAGER": ["overview", "publications", "visits", "activity"],
  "SUPPORT": ["overview", "activity", "audits"]
}
```

Le role `ADMIN` n'est pas parametrable: il garde toujours tous les blocs. Les roles `MANAGER` et `SUPPORT` peuvent ouvrir `/admin`, mais chaque bloc visible est filtre par `canAccessAdminBlock(role, blockId, adminRoleAccess)`. Le role `CLIENT` n'accede pas a `/admin`.

### Checkout MaishaPay

```json
{
  "planId": "starter",
  "walletId": "2438XXXXXXXX",
  "provider": "MPESA"
}
```

Le plan gratuit `freemium` active directement l'abonnement. Les plans payants creent une souscription en attente et lancent MaishaPay.

### Module Entreprise

Route privee:

```txt
/company
```

La route `/documents` redirige vers `/company` pour conserver les anciens liens. Le module Entreprise contient deux niveaux de contexte:

1. Profil entreprise, disponible dans tous les abonnements.
2. Documents, limites par le plan actif via `BillingPlan.maxDocuments`.

Donnees du profil entreprise:

- identite de l'organisation: nom, forme juridique, secteur, taille, localisation, site web;
- activite: description, mission, produits/services, clients, marches et concurrents;
- fonctionnement: processus cles, outils, systemes de donnees, exigences de conformite;
- pilotage: defis, objectifs et KPI;
- contexte utilisateur: poste, departement, responsabilites et role decisionnel;
- activites metier: titre, frequence, priorite, outils, donnees d'entree/sortie et irritants.

Ces champs s'inspirent de pratiques documentees par des sources officielles:

- ISO 9001:2015, qui structure la qualite autour du contexte, des processus, de la satisfaction client et de l'amelioration continue: https://www.iso.org/standard/62085.html
- G20/OECD Principles of Corporate Governance 2023, pour le suivi des objectifs, de la gouvernance, de la transparence et de la performance: https://www.oecd.org/en/publications/g20-oecd-principles-of-corporate-governance-2023_ed750b30-en.html
- NIST SP 800-53 Rev. 5, pour rappeler que les controles de securite et de confidentialite doivent etre adaptes aux besoins metier, risques et environnements d'une organisation: https://csrc.nist.gov/Pubs/sp/800/53/r5/upd1/Final

Routes API:

```txt
PATCH  /api/company/profile
DELETE /api/company/profile
POST   /api/company/activities
PATCH  /api/company/activities/[id]
DELETE /api/company/activities/[id]
```

Toutes ces routes exigent une session. Les activites sont limitees au proprietaire via `userId`. Les mutations sont journalisees dans `AuditLog` et `ApiLog`.

Le chatbot utilise `getCompanyContextForUser(userId)` pour injecter ce contexte prive uniquement dans la requete OpenAI du proprietaire connecte.

### Upload documentaire RAG

Route:

```txt
POST /api/documents
Content-Type: multipart/form-data
```

Champs:

```txt
file: fichier TXT, Markdown, CSV, JSON ou PDF
title: titre optionnel
```

Regles:

- session obligatoire;
- limite du plan actif verifiee via `BillingPlan.maxDocuments`;
- taille maximale actuelle: 2 Mo;
- embeddings stockes dans `KnowledgeChunk.embedding` avec `pgvector vector(1536)`;
- extraction PDF realisee cote serveur avec un parseur JavaScript gratuit;
- les originaux sont stockes dans Supabase Storage si les variables Supabase sont configurees.

### Callback MaishaPay

URL a configurer cote MaishaPay:

```txt
https://votre-domaine.com/api/billing/maishapay/callback?secret=VOTRE_MAISHAPAY_CALLBACK_SECRET
```

Payload accepte, tolerant aux champs supplementaires:

```json
{
  "transactionReference": "DTSC-STARTER-ABC123-1770000000000",
  "transactionId": "REFERENCE_PROVIDER",
  "status": "PAID",
  "statusCode": "200",
  "amount": "2",
  "currency": "USD"
}
```

## 11. Integration Zoho Mail

Fichier principal: `lib/zoho-mail.ts`.

### 11.1 Formulaires publics vers DTSC

Routes:

- `POST /api/public/contact`
- `POST /api/public/newsletter`

Ces routes:

1. valident les donnees avec Zod;
2. sauvegardent en base;
3. appellent `sendZohoMailWebhook`;
4. envoient un payload `{ message: "..." }` vers `ZOHO_MAIL_WEBHOOK_URL`.

Usage prevu: webhook entrant Zoho qui publie ou transmet le message a `contact@dtsc-platform.com`.

### 11.2 Diffusions admin par API Zoho Mail

Routes:

- `POST /api/admin/broadcast`
- `POST /api/admin/newsletter-broadcast`

Priorite d'envoi:

1. API Zoho Mail directe si `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_CLIENT_SECRET`, `ZOHO_MAIL_REFRESH_TOKEN` sont configures.
2. Fallback `ZOHO_OUTBOUND_MAIL_WEBHOOK_URL`.
3. Fallback `ZOHO_MAIL_WEBHOOK_URL`.

Regle de confidentialite codee:

- `toAddress = contact@dtsc-platform.com`;
- destinataires reels en `bccAddress`;
- aucune liste d'emails n'est rendue dans le corps du message.
- les champs riches `bodyHtml` et `contentHtml` permettent de conserver une partie du format colle par l'admin: gras, italique, soulignement, couleurs, liens, images externes et emojis;
- le HTML est nettoye cote serveur par `sanitizeRichHtml` avant l'envoi afin de retirer scripts, iframes, handlers `on*` et URLs `javascript:`.

Si le message contient `{user}`:

- l'application envoie un mail personnalise par destinataire;
- chaque destinataire est seul en CCI;
- le contenu recoit le nom de l'utilisateur ou de l'abonne newsletter.

### 11.3 OTP transactionnel

L'OTP d'inscription utilise le meme moteur de mail premium, mais en mode transactionnel:

- destinataire direct: email saisi a l'inscription;
- sujet: `Code de vérification DTSC Platform`;
- contenu HTML professionnel genere par `buildProfessionalMailHtml`;
- expiration affichee dans le message;
- aucune cle API n'est exposee cote client.

Le mode transactionnel est active via `deliveryMode: "direct"` dans `sendZohoOutboundMail`.

### 11.4 Configuration API Zoho Mail

Variables necessaires:

```txt
ZOHO_MAIL_API_BASE_URL=https://mail.zoho.com
ZOHO_ACCOUNTS_API_BASE_URL=https://accounts.zoho.com
ZOHO_MAIL_ACCOUNT_ID=
ZOHO_MAIL_FROM_ADDRESS=contact@dtsc-platform.com
ZOHO_MAIL_CLIENT_ID=
ZOHO_MAIL_CLIENT_SECRET=
ZOHO_MAIL_REFRESH_TOKEN=
```

Flux OAuth:

1. L'application echange `refresh_token` contre un `access_token` via:

```txt
POST {ZOHO_ACCOUNTS_API_BASE_URL}/oauth/v2/token
```

2. Elle envoie l'email via:

```txt
POST {ZOHO_MAIL_API_BASE_URL}/api/accounts/{ZOHO_MAIL_ACCOUNT_ID}/messages
```

Payload envoye a Zoho Mail API:

```json
{
  "fromAddress": "contact@dtsc-platform.com",
  "toAddress": "contact@dtsc-platform.com",
  "ccAddress": "",
  "bccAddress": "destinataire1@example.com,destinataire2@example.com",
  "subject": "Objet",
  "content": "<html>...</html>",
  "mailFormat": "html",
  "askReceipt": "no"
}
```

### 11.5 Fallback Zoho Flow

Si `ZOHO_OUTBOUND_MAIL_WEBHOOK_URL` est utilise, l'application envoie:

```json
{
  "to": ["contact@dtsc-platform.com"],
  "toText": "contact@dtsc-platform.com",
  "cc": [],
  "ccText": "",
  "bcc": ["client@example.com"],
  "bccText": "client@example.com",
  "subject": "Objet",
  "content": "Version texte",
  "body": "Version texte",
  "html": "<html>...</html>",
  "bodyHtml": "<html>...</html>",
  "fromEmail": "contact@dtsc-platform.com",
  "fromAddress": "contact@dtsc-platform.com",
  "replyTo": "contact@dtsc-platform.com",
  "source": "admin-broadcast"
}
```

Mapping conseille dans Zoho Flow Send Mail:

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

## 12. Integration MaishaPay

Fichiers principaux:

- `lib/maishapay.ts`
- `lib/billing.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/billing/maishapay/callback/route.ts`

Endpoint utilise:

```txt
POST https://marchand.maishapay.online/api/payment/rest/vers1.0/merchant
```

Payload serveur:

```json
{
  "gatewayMode": 0,
  "publicApiKey": "MAISHAPAY_PUBLIC_API_KEY",
  "secretApiKey": "MAISHAPAY_SECRET_API_KEY",
  "transactionReference": "DTSC-...",
  "amount": 2,
  "currency": "USD",
  "customerFullName": "Nom client",
  "customerPhoneNumber": "2438XXXXXXXX",
  "customerEmailAddress": "client@example.com",
  "chanel": "MOBILEMONEY",
  "provider": "MPESA",
  "walletID": "2438XXXXXXXX"
}
```

Plans codes:

| Plan | Prix | Positionnement |
| --- | ---: | --- |
| Decouverte | 0 USD | Freemium tres limite |
| Essentiel | 2 USD/mois | Usage leger |
| Professionnel | 15 USD/mois | Usage regulier PME |
| Entreprise | 50 USD/mois | Usage intensif et documentaire |

Flux:

1. L'utilisateur selectionne un plan dans `/billing`.
2. `POST /api/billing/checkout` cree une `Subscription` et un `Payment`.
3. MaishaPay declenche la validation mobile money.
4. Le callback DTSC marque le paiement `PAID`, active l'abonnement, applique les limites du plan et cree une facture.
5. La facture est envoyee par email via Zoho Mail.

Source d'integration utilisee: documentation REST MaishaPay, endpoint marchand et payload `gatewayMode`, `publicApiKey`, `secretApiKey`, `transactionReference`, `amount`, `currency`, `chanel`, `provider`, `walletID`.

Tant que `MAISHAPAY_PUBLIC_API_KEY` et `MAISHAPAY_SECRET_API_KEY` sont absentes, les plans payants retournent `503 MAISHAPAY_MAINTENANCE` et le plan freemium reste actif. Le plan freemium autorise 1 document pour tester le flux documentaire jusqu'au stockage Supabase si celui-ci est configure.

## 12.1 Integration RAG OpenAI + pgvector

Fichiers principaux:

- `lib/rag.ts`
- `app/api/documents/route.ts`
- `app/api/documents/[id]/route.ts`
- `app/api/chat/route.ts`

Flux:

1. L'utilisateur charge un fichier dans `/documents`.
2. Le serveur extrait le texte.
3. Le texte est decoupe en chunks.
4. Chaque chunk est vectorise via `POST https://api.openai.com/v1/embeddings`.
5. Les vecteurs sont stockes en PostgreSQL avec `pgvector`.
6. A chaque question, la recherche cosine recupere les chunks pertinents du meme utilisateur.
7. Le contexte est injecte dans OpenAI Responses API.

Variables:

```txt
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Limites actuelles:

- fichiers pris en charge: TXT, Markdown, CSV, JSON, PDF;
- taille maximale: 2 Mo;
- dimension vectorielle: 1536;
- Supabase Storage conserve les fichiers originaux si `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` et `SUPABASE_STORAGE_BUCKET` sont configures.

## 12.2 Integration Supabase Storage

Supabase Storage est utilise pour les fichiers originaux de la base documentaire, pour les avatars optimises des profils et pour les images optimisees inserees dans les publications publiques. Neon PostgreSQL reste la base applicative principale.

Variables:

```txt
SUPABASE_STORAGE_URL=
SUPABASE_STORAGE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=dtsc-documents
```

Regles:

- le client Supabase est cree uniquement cote serveur;
- la service role key ne doit jamais etre exposee au navigateur;
- le chemin documentaire suit le format `userId/documentId/fileName`;
- le chemin avatar suit le format `avatars/{userId}/profile.webp` et l'affichage passe par `/api/users/[id]/avatar`;
- le chemin image de publication suit le format `publications/{userId}/{uuid}.webp` et l'affichage public passe par `/api/public/publication-images/[...path]`;
- si Supabase Storage n'est pas configure, l'indexation RAG continue sans conservation de l'original.
- lorsqu'un document est supprime, l'application tente aussi de supprimer l'original dans Supabase Storage.

## 12.3 Publications publiques interactives

Les publications publiques sont gerees depuis le bloc `Publications publiques` de `/admin`. L'editeur riche permet le collage d'images ou l'ajout par selection de fichier. Cote navigateur, l'image est redimensionnee et convertie en WebP avant envoi vers le serveur; cote serveur, la route verifie la session `ADMIN`, le type MIME et la taille avant stockage dans Supabase. En creation ou modification, un clic sur une image affiche une icone de suppression directement sur le visuel afin de retirer l'image du contenu avant enregistrement.

Routes ajoutees:

| Route | Methode | Acces | Payload | Reponse |
| --- | --- | --- | --- | --- |
| `/api/admin/publications/images` | `POST` | `ADMIN` | `multipart/form-data` avec `file` image JPEG/PNG/WebP optimisee | `{ ok, url, path }` |
| `/api/public/publication-images/[...path]` | `GET` | Public | chemin Supabase commencant par `publications/` | Blob image cacheable |
| `/api/publications/[id]/comments` | `POST` | Utilisateur connecte | `{ content, parentId? }` | commentaire cree |
| `/api/publications/comments/[id]` | `PATCH` | `ADMIN` ou auteur dans la fenetre d'edition | `{ content }` | commentaire modifie |
| `/api/publications/comments/[id]` | `DELETE` | `ADMIN` | aucun | suppression du commentaire et de ses reponses |
| `/api/publications/[id]/reactions` | `POST` | Utilisateur connecte | `{ value: 1 | -1 }` | reaction creee, remplacee ou retiree |

Regles RBAC:

- seuls les `ADMIN` creent, modifient et suppriment les publications publiques;
- les utilisateurs connectes peuvent commenter, repondre et reagir;
- un utilisateur peut modifier son propre commentaire uniquement dans la fenetre `commentEditWindowMinutes`;
- seul `ADMIN` supprime un commentaire public;
- les commentaires et reactions ne divulguent pas d'informations techniques internes.

Le module `/announcements` utilise maintenant aussi `AnnouncementComment.parentId` pour permettre les reponses aux commentaires avec la meme logique CRUD que les commentaires existants.

## 13. Integration Neon PostgreSQL

Neon est connecte via `DATABASE_URL`.

Sur Vercel:

1. ajouter `DATABASE_URL` dans Environment Variables;
2. lancer les migrations par le build command:

```bash
pnpm prisma migrate deploy && pnpm build
```

La generation Prisma est executee par `postinstall`:

```bash
prisma generate
```

## 14. Integration Vercel et CI/CD

Le depot est connecte a Vercel. Chaque push sur `main` declenche le deploiement Vercel si le projet Vercel est relie au repository.

Workflow GitHub Actions:

- fichier: `.github/workflows/vercel-production.yml`;
- declencheur: push sur `main`;
- installe pnpm;
- Node.js 22;
- `pnpm install --no-frozen-lockfile`;
- `pnpm type-check`.

Vercel execute ensuite son propre build selon la configuration du projet.

## 15. SEO et pages publiques

Fichiers:

- `app/sitemap.ts`
- `app/robots.ts`
- `app/layout.tsx`
- pages publiques principales: `/`, `/services`, `/solutions`, `/secteurs`, `/projets`, `/ressources`, `/ressources/[slug]`, `/a-propos`, `/contact`
- pages ressources historiques: `/data-afrique`, `/bi-kpi`, `/ia-entreprise`
- pages legales: `/conditions-utilisation`, `/politique-confidentialite`

Objectifs codes:

- sitemap;
- robots.txt;
- metadonnees;
- Open Graph/Twitter;
- contenus publics longs et indexes;
- FAQ d'accueil avec composant local `Accordion` base sur `details/summary` accessible et donnees structurees JSON-LD `FAQPage`;
- sections publiques avec surfaces alternees et cartes `dtsc-card` / `dtsc-card-alt` pour ameliorer la hierarchie visuelle en mode clair et sombre;
- navigation publique par routes dediees avec onglet actif selon `pathname`;
- contenus corporate centralises dans `lib/public-site.ts`;
- contexte DTSC issu du business plan: vision, mission, services, marche, organisation et approche commerciale;
- publications administrables dans `PublicPublication` pour alimenter la page Ressources;
- sources publiques verifiables integrees dans les pages de contenu;
- formulaire contact;
- formulaire newsletter.

Pages publiques dediees:

| Route | Objectif |
| --- | --- |
| `/` | Page d'accueil courte, conversion, FAQ publique et orientation vers les pages dediees |
| `/services` | Services DTSC: transformation numerique, data, IA, marketing digital, audit, formation |
| `/solutions` | Offres concretes: chatbot, dashboards, applications metier, automatisation, RAG documentaire |
| `/secteurs` | Secteurs cibles: assurances, sante, pharmacies, PME, ONG, education, finance |
| `/projets` | Demonstrations et types de projets livrables |
| `/ressources` | Ressources publiques statiques et publications admin publiees |
| `/ressources/[slug]` | Lecture detaillee d'une publication admin publiee |
| `/a-propos` | Presentation DTSC, vision, mission, business model et postes de l'organisation sans noms individuels |
| `/contact` | Contact professionnel et inscription newsletter |

Sources publiques actuellement utilisees:

- IFC, digitalisation des entreprises africaines: `https://www.ifc.org/en/pressroom/2024/ifc-report-shows-digitalization-holds-immense-promise-economic-potential-for-african-businesses-of-all-sizes`
- Banque mondiale, transformation digitale en Afrique: `https://www.worldbank.org/en/results/2024/01/18/digital-transformation-drives-development-in-afe-afw-africa.print`
- GSMA Mobile Economy Sub-Saharan Africa 2024: `https://www.gsma.com/newsroom/press-release/powering-progress-through-connectivity-gsmas-mobile-economy-sub-saharan-africa-report-calls-for-action-to-close-the-digital-dividenew-report-highlights-opportunities-in-ai-5g-and-satellite-connectivit/`
- NIST AI Risk Management Framework: `https://www.nist.gov/itl/ai-risk-management-framework`
- WHO Global Strategy on Digital Health: `https://www.who.int/publications/i/item/9789240116870`

## 16. Securite applicative

Mesures codees:

- validation Zod sur les entrees;
- hashage PBKDF2 des mots de passe;
- sessions signees HMAC avec verification en temps constant;
- cookie HTTP-only;
- middleware de protection des routes privees;
- blocage middleware de `x-middleware-subrequest`;
- blocage des requetes API mutantes provenant d'une autre origine, avec exception pour les webhooks externes declares;
- headers globaux: CSP, HSTS en production, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`;
- RBAC serveur sur routes sensibles;
- variables d'environnement validees;
- OpenAI et Zoho appeles uniquement cote serveur;
- suppression des listes d'emails visibles dans les diffusions;
- destinataires de diffusion en CCI;
- OTP email configurable pour l'inscription;
- journalisation des actions sensibles dans `AuditLog`;
- historisation des webhooks entrants dans `WebhookEvent`;
- logs API critiques dans `ApiLog`;
- audit des paiements MaishaPay;
- factures envoyees par email uniquement apres confirmation de paiement;
- isolement RAG par `userId`;
- verification des limites documentaires par plan actif;
- rate limiting Upstash Redis optionnel avec fallback memoire sur `/api/chat`, `/api/auth/sign-in`, `/api/auth/sign-up`, `/api/public/contact`, `/api/public/newsletter`;
- limites quotidiennes chat par utilisateur;
- erreurs generiques cote API pour eviter la fuite d'informations sensibles.

Limites techniques actuelles:

- Si `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` ne sont pas configures, `rate-limit.ts` retombe sur une Map memoire. Pour la production a forte charge, Upstash doit etre configure.
- La CSP autorise encore `unsafe-inline` pour compatibilite avec l'UI actuelle. Un sprint dedie peut durcir cette politique avec nonces/hashes.
- `estimateCost()` retourne actuellement `0`; le calcul de cout reel par modele reste a implementer.
- Les fondations `AuditLog` et `WebhookEvent` sont en place; il reste a etendre leur usage a toutes les actions critiques.

## 16. Connecter DTSC Platform a d'autres applications par API

Il y a trois manieres propres de connecter l'application a d'autres systemes.

### 16.1 Consommer une API externe depuis DTSC Platform

Exemple: connecter un CRM, WhatsApp Business, outil de facturation, outil BI.

Etapes recommandees:

1. Ajouter les variables d'environnement dans `env.example` et `lib/env.ts`.
2. Creer un client serveur dans `lib/nom-service.ts`.
3. Ne jamais importer ce client dans un composant `"use client"`.
4. Creer une route API dans `app/api/.../route.ts`.
5. Proteger la route avec `getSession()` et le RBAC necessaire.
6. Valider le payload avec Zod dans `lib/validators.ts`.
7. Journaliser les donnees utiles en base si necessaire.

Exemple de client serveur:

```ts
import { requireEnv } from "@/lib/env";

export async function sendToCrm(payload: { email: string; name: string }) {
  const response = await fetch("https://crm.example.com/api/leads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("CRM_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`CRM request failed with status ${response.status}`);
  }

  return response.json();
}
```

### 16.2 Exposer une API DTSC pour qu'une autre application appelle DTSC Platform

Creer une route dans `app/api/integrations/.../route.ts`.

Regles:

- authentifier par secret, signature HMAC ou OAuth selon le niveau de criticite;
- valider les donnees avec Zod;
- retourner des statuts HTTP clairs;
- ne pas exposer les donnees d'autres utilisateurs sans controle d'acces;
- ajouter des logs ou tables d'audit si l'integration est critique.

Exemple simple avec secret:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

const payloadSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export async function POST(req: Request) {
  const secret = req.headers.get("x-dtsc-webhook-secret");
  if (!env.ZOHO_OUTGOING_WEBHOOK_SECRET || secret !== env.ZOHO_OUTGOING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = payloadSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

### 16.3 Recevoir des webhooks externes

Pattern deja present:

- `app/api/webhooks/zoho/outgoing-mail/route.ts`

URL type:

```txt
https://votre-domaine.com/api/webhooks/zoho/outgoing-mail?secret=VOTRE_SECRET
```

Pour un nouveau webhook:

1. creer `app/api/webhooks/{provider}/{event}/route.ts`;
2. verifier un secret ou une signature;
3. parser le payload;
4. sauvegarder ou declencher l'action;
5. repondre rapidement `200 OK`;
6. traiter les taches longues en arriere-plan si necessaire.

## 17. Guide d'ajout d'une nouvelle integration

Checklist:

1. Identifier le sens du flux:
   - DTSC appelle l'application externe;
   - l'application externe appelle DTSC;
   - les deux.
2. Ajouter les variables dans:
   - `env.example`;
   - `lib/env.ts`;
   - Vercel Environment Variables.
3. Creer le client serveur dans `lib/`.
4. Ajouter les schemas Zod dans `lib/validators.ts`.
5. Creer la route API dans `app/api/`.
6. Appliquer `getSession()` et RBAC si route privee.
7. Ajouter une table Prisma si l'integration doit garder un historique.
8. Ajouter une migration Prisma.
9. Documenter le payload et les erreurs.
10. Tester localement puis sur Vercel.

## 18. Codes HTTP standards utilises

| Code | Sens |
| --- | --- |
| `200` | Operation reussie |
| `201` | Ressource creee |
| `400` | Payload invalide |
| `401` | Session absente ou secret invalide |
| `403` | Role/statut non autorise |
| `404` | Ressource introuvable |
| `409` | Conflit, ex. email deja utilise |
| `429` | Limite d'usage atteinte |
| `502` | Echec provider externe |
| `503` | Service temporairement indisponible |

## 19. Donnees sensibles et conformite

Donnees personnelles stockees:

- nom;
- email;
- telephone;
- entreprise;
- messages contact;
- conversations chatbot;
- tickets support;
- notifications;
- reactions/commentaires.

Bonnes pratiques a maintenir:

- ne pas commiter `.env`;
- eviter les logs contenant des secrets;
- ne jamais rendre les listes d'emails de diffusion dans les mails;
- garder les donnees administratives derriere RBAC;
- prevoir a terme export/suppression des donnees utilisateur si exigence RGPD stricte.

## 20. Roadmap technique recommandee et etat d'implementation

Etat actuel:

- audit log admin: fondation Prisma `AuditLog` et helper `writeAuditLog` ajoutes; deja utilise sur inscription OTP, creation utilisateur admin et parametres admin;
- webhooks sortants/generiques: fondation `WebhookEvent` ajoutee; le webhook Zoho est historise;
- securite inscription: OTP email configurable ajoute;
- emails transactionnels: mode direct ajoute au service Zoho.
- socle commercial: plans chatbot, MaishaPay, callback, activation automatique, factures email, logs API, exports et audit paiement ajoutes.
- intelligence documentaire: upload TXT/Markdown/CSV/JSON, extraction texte, embeddings OpenAI, stockage pgvector et injection RAG dans le chatbot ajoutes.

Fonctionnalites qui exigent des informations externes avant activation complete:

- rate limit distribue Redis/Upstash: le code est pret; fournir `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` pour eviter le fallback memoire en production multi-instance;
- cout IA reel par modele: fournir la grille tarifaire a appliquer ou valider une source officielle a maintenir;
- API keys internes partenaires: definir les partenaires, droits, quotas et duree de validite;
- RAG documentaire DTSC: socle actif pour TXT/Markdown/CSV/JSON/PDF; fournir les documents sources et la politique d'indexation avancee;
- upload de fichiers: Supabase Storage disponible si configure; definir retention et antivirus si fichiers originaux conserves;
- WhatsApp Business API: fournir `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`;
- CRM: fournir fournisseur, URL API, mode OAuth/API key, champs a synchroniser;
- facturation/abonnements: socle MaishaPay actif; completer taxes, mentions legales locales et renouvellement automatique selon contrat marchand;
- exports PDF: definir les templates et informations legalement affichables;
- tests automatises API/e2e: ajouter Playwright/Vitest ou equivalent selon le niveau de couverture souhaite.
