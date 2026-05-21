# Documentation technique DTSC Platform

Derniere mise a jour: 20 mai 2026

Cette documentation decrit ce qui est deja code dans l'application DTSC Platform: architecture, base de donnees, authentification, modules fonctionnels, API internes, API externes connectees et methode recommandee pour connecter l'application a d'autres systemes.

## 1. Vue d'ensemble

DTSC Platform est une application SaaS Next.js App Router pour DTSC - Data and Tech Solutions Consulting.

Objectifs couverts par le code actuel:

- landing page publique DTSC refondue avec navigation corporate vers des pages dediees: Services, Solutions, Secteurs, Projets, Ressources, A propos et Contact;
- FAQ premium sur la page d'accueil publique, organisee par categories et exposee en donnees structurees `FAQPage` pour le SEO;
- pages publiques avec hero visuel en carrousel automatique, images thematiques multiples par page, indicateurs manuels et animations legeres;
- bandes visuelles publiques alternees (`dtsc-public-band-light`, `dtsc-public-band-soft`, `dtsc-public-band-cyan`) et cartes contrastees pour eviter que les blocs aient la meme couleur que l'arriere-plan;
- publications publiques administrables depuis l'administration pour alimenter regulierement la page Ressources, avec recherche instantanee, pagination, images optimisees, partage, reactions, commentaires et reponses aux commentaires;
- recherche intelligente publique via le header pour orienter les visiteurs vers les pages, services, solutions et publications utiles;
- page Ressources organisee par categories en accordion, avec seulement les trois dernieres publications mises en avant sous forme de cartes;
- authentification maison avec sessions securisees par cookie HTTP-only, comparaison de signature en temps constant et OTP email optionnel a l'inscription;
- plans d'abonnement chatbot avec MaishaPay, callback, factures et activation automatique;
- base documentaire privee avec upload texte, extraction, embeddings OpenAI et recherche pgvector pour le RAG chatbot;
- module Entreprise permettant a chaque utilisateur de renseigner son organisation, son poste, ses activites, ses processus, ses donnees, ses objectifs et ses KPI pour enrichir le contexte prive du chatbot;
- roles `ADMIN`, `MANAGER`, `SUPPORT`, `CLIENT`;
- tableau de bord client enrichi avec KPI d'entreprise, activites, documents et usage IA;
- chatbot OpenAI avec historique des conversations, classement par dossier/projet avec CRUD de dossiers, partage de conversation, snapshots consultables pour les groupes collaboratifs, dates/heures selon preferences utilisateur, streaming, choix de modele LLM prefere par utilisateur, style/longueur de reponse persistants et limites d'usage;
- notifications internes avec preferences utilisateur, extrait en liste, lecture automatique a l'ouverture et alertes navigateur/PWA pendant une session connectee;
- annonces internes avec commentaires, reactions, menu d'actions `...`, copie, transfert, signalement, archivage, epinglage et indicateurs persistants;
- module prive Mes collaborateurs avec groupes, invitations, membres, messagerie paginee, mentions, couleurs stables par intervenant, snapshots de conversations chatbot, appels audio/vidéo LiveKit sécurisés par groupe, notifications et journal d'audit par groupe;
- editeur de texte riche reutilisable avec barre d'outils fixe, zone d'ecriture scrollable, polices modernes, tailles, alignements, puces avancees, numerotations, checklist, tirets, gras, italique, souligne, palette de couleurs controlee et collage de contenus riches;
- support sous forme de tickets conversationnels;
- administration utilisateurs, limites d'usage, parametres globaux, vue generale avec filtres periode/date, visites publiques, diffusions, HR & CFO, SCO, COO, CEO, MPO, CTO, LA et acces par blocs/postes pour les roles non-client;
- fondations techniques pour audit log et historisation de webhooks;
- protections production: headers securite, blocage cross-origin des requetes API mutantes, blocage `x-middleware-subrequest`, rate limiting Upstash Redis optionnel avec fallback local;
- logs API et webhooks etendus aux zones critiques: chat, conversations, notifications, documents, paiements, diffusions, newsletter, entreprise et publications;
- experience PWA orientee espace prive avec manifest, service worker prudent, page hors ligne, prompt d'installation authentifie et carte publique d'installation sur l'accueil;
- integrations OpenAI, Neon PostgreSQL, Prisma, Zoho Mail API, Zoho webhooks et Vercel.

### Design mobile/PWA premium

La couche mobile authentifiée reprend les principes du redesign fourni dans `dtsc-platform-redesign.zip` sans importer les écrans mockés comme source de données. Le shell privé conserve `AppShell`, l'authentification, RBAC, notifications, routes API et modules existants, puis ajoute:

- `components/dtsc/mobile-shell.tsx`: header mobile compact, quick chips et bottom navigation PWA;
- `components/dtsc/ui-components.tsx`: primitives visuelles premium réutilisables (`PremiumCard`, `GlassCard`, `MobileStatCard`, `MobileBadge`, `MobileAvatar`);
- styles mobiles dans `app/globals.css`: fond mesh, cartes glass pour `dtsc-card`/`dtsc-panel`, safe-area et scrollbar masquée.

La navigation mobile principale expose Accueil, IA, Activités DTSC quand disponible, Collaborateurs et Notifications. Les autres modules restent accessibles par les actions rapides et liens secondaires, avec Administration visible uniquement selon les droits existants. Les modules continuent d'utiliser leurs données réelles: aucune donnée mockée du prototype ne doit être introduite dans les écrans connectés.

## 2. Stack technique

- Framework: Next.js 15 App Router
- Langage: TypeScript
- UI: React 19.1.2+, Tailwind CSS, lucide-react, composants locaux
- Base de donnees: Neon PostgreSQL
- ORM: Prisma
- IA: OpenAI Responses API cote serveur
- Appels audio/video: LiveKit optionnel, tokens participants generes cote serveur
- Email: Zoho Mail API directe + fallbacks webhook Zoho
- Validation: Zod
- Deploiement: Vercel
- CI: GitHub Actions avec `pnpm type-check`
- PWA: manifest App Router, service worker statique et prompt d'installation prive

### Appels de groupes et réunions COO audio/vidéo

Les appels audio/vidéo sont persistés dans `CollaborationGroupCall`, `CollaborationGroupCallParticipant` et `CollaborationGroupCallEvent`. Chaque appel appartient à un groupe `CollaborationGroup`; un appel peut aussi être lié à une réunion COO via `meetingId`.

L'UX d'appel masque le fournisseur technique aux utilisateurs finaux: l'UI affiche uniquement des états humains comme `Appel connecté`, `Connexion à l'appel`, `Micro coupé` ou `Appel terminé`. Les erreurs du fournisseur sont conservées côté logs/API, mais ne doivent pas être rendues brutes dans les composants React.

Routes principales:

- `GET /api/collaborators/groups/[id]/calls`: retourne l'appel actif et l'historique récent du groupe. Accès réservé aux membres actifs du groupe.
- `POST /api/collaborators/groups/[id]/calls`: démarre un appel `AUDIO` ou `VIDEO`, crée les participants invités, notifie le groupe, écrit un message système et journalise l'action.
- `POST /api/collaborators/calls/[id]/join`: vérifie l'appartenance au groupe, génère un token LiveKit temporaire côté serveur et marque le participant comme connecté.
- `POST /api/collaborators/calls/[id]/leave`: marque le participant comme sorti et historise l'événement.
- `POST /api/collaborators/calls/[id]/end`: réservé au lanceur de l'appel, propriétaire/admin du groupe ou admin plateforme; termine l'appel et libère la réunion liée.
- `GET /api/collaborators/calls/events`: retourne les événements récents d'appels des groupes dont l'utilisateur est membre actif. Cette route alimente l'alerte flottante globale avec un polling léger, en fallback à une infrastructure temps réel dédiée.

Variables requises pour rejoindre réellement une room:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`

Ces secrets ne doivent jamais être exposés côté client. `lib/livekit-service.ts` génère uniquement des JWT participants temporaires pour les membres autorisés. Si LiveKit n'est pas configuré, la route de jonction retourne une erreur explicite `503` sans exposer de secret.

Préférences utilisateur d'appel persistées sur `User`:

- `callSoundsEnabled`, `callNotificationsEnabled`, `floatingCallAlertsEnabled`, `participantEventAlertsEnabled`, `callAlertSoundEnabled`;
- `incomingCallBannerEnabled`, `connectionIssueSoundsEnabled`;
- `startMutedByDefault`, `startCameraOffByDefault`;
- `callSoundVolume`, `callAlertDisplayDuration`;
- préférences de périphériques `preferredAudioInputId`, `preferredVideoInputId`, `preferredAudioOutputId` lorsque le navigateur les permet.

`CollaborationGroupCall.durationSeconds` est renseigné lors de la fin globale d'un appel et sert à afficher l'historique sobre du groupe. Le bouton `Quitter` appelle uniquement la sortie participant, tandis que `Terminer` clôt l'appel pour tous et reste protégé côté API.

Les réunions COO disposent de `meetingMode`:

- `COMMENTS_ONLY`: fonctionnement historique par commentaires/messages, sans groupe automatique ni appel.
- `AUDIO` ou `VIDEO`: création automatique d'un groupe de réunion `groupType = MEETING` si aucun `collaborationGroupId` n'est fourni; synchronisation des participants COO ayant un compte utilisateur; liaison `CooMeeting.collaborationGroupId`.

Les décisions et comptes rendus sont historisés dans `CooMeetingDecision` et `CooMeetingMinutes`. Une décision peut créer une tâche COO liée avec `CooTask.sourceMeetingId` et `sourceDecisionId`.

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
  manifest.ts                  Manifest PWA start_url /dashboard
  offline/                     Page hors ligne sans donnees utilisateur
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
  pwa/                         Enregistrement service worker et prompt d'installation prive
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
  public-search.ts             Index statique de recherche publique
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
| `ConversationProject` | Dossier/projet utilisateur pour classer les conversations chatbot |
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
| `AnnouncementShare` | Transfert persistant d'une annonce vers un autre utilisateur avec notification |
| `AnnouncementReport` | Signalement persistant d'une annonce, motif, priorite et statut de traitement |
| `AppSetting` | Parametres globaux admin, dont les acces aux blocs Administration par role |
| `AuditLog` | Journalisation des actions sensibles |
| `WebhookEvent` | Historisation des webhooks entrants |
| `ApiLog` | Journalisation des appels API critiques |
| `PushSubscription` | Abonnement navigateur/PWA prevu pour les notifications visibles et futures notifications push |
| `HrcfoEmployee` | Dossier collaborateur lie a un `User` non-client, departement, manager, KPIs, contrat, poste et conformite RH |
| `Department` | Referentiel des departements DTSC actifs/inactifs |
| `FinancialAccount` | Comptes financiers, solde initial, solde courant et statut |
| `HrcfoBudget` | Enveloppes budgetaires liees a un departement et un compte, consommation, solde restant, risque et statut |
| `HrcfoExpense` | Transactions financieres HR & CFO: entree/sortie, compte, budget, source, validation et facture associee |
| `HrcfoPayroll` | Paie collaborateur, periode, brut, primes, retenues, compte, budget et transaction de sortie associee |
| `HrcfoInvoice` | Ancienne table interne conservee pour compatibilite historique, plus exposee comme bloc manuel |
| `DtscPosition` | Referentiel officiel des postes DTSC; les codes `CEO`, `COO`, `HR_CFO`, `SCO`, `CTO`, `MPO`, `LA` completent les permissions metier |
| `ScoVendor` | Fournisseurs, categorie, contact, fiabilite et delais moyens |
| `ScoPurchaseRequest` | Demandes d'achat, urgence, budget, fournisseur retenu issu du referentiel Fournisseurs et statut de commande |
| `MaterialItem` | Referentiel central des biens materiels DTSC: nom, reference, categorie, type, unite et statut |
| `ScoInventoryItem` | Stocks, quantites, seuils minimums, emplacement, responsable et lien optionnel vers un bien materiel |
| `ScoAsset` | Actifs et equipements, assignation, etat, statut, maintenance et lien optionnel vers un bien materiel |
| `ScoLogisticsEvent` | Missions, evenements, transport, checklist, risques, responsable collaborateur et statut logistique |
| `CooOperation` | Operations internes transversales, responsable, departements impliques, progression, priorite et piece jointe |
| `CooTask` | Taches journalieres COO assignees aux collaborateurs, statut, priorite, preuve/livrable et blocage |
| `CooRecurringTask` | Modeles de taches recurrentes actives/inactives |
| `CooDepartmentRequest` | Demandes et dependances inter-departements |
| `CooBlocker` | Blocages operationnels, criticite, impact, action corrective et resolution |
| `CooMeeting` | Reunions, comptes rendus, decisions et pieces jointes |
| `CooWorkflow` | Workflows operationnels repetables et etapes |
| `CooOperationalReport` | Rapports operationnels et KPI COO |
| `CollaboratorRequest` | Demandes directes entre collaborateurs depuis Activites DTSC: demandeur, destinataire, type, priorite, statut, echeance, message et reponse. La reponse est affichee separement de la demande et ne peut etre saisie que par le destinataire |
| `CooCommentMention` | Mentions persistantes dans les commentaires collaboratifs avec notification du collaborateur mentionne |
| `CollaborationGroup` | Groupe prive Mes collaborateurs: nom, type, proprietaire, statut et visibilite |
| `CollaborationGroupMember` | Appartenance au groupe, role, statut et date d'entree/sortie |
| `CollaborationGroupInvitation` | Invitation a rejoindre un groupe, par utilisateur existant ou email |
| `CollaborationGroupMessage` | Message de groupe, reponse, partage chatbot, statut, soft delete et auteur |
| `CollaborationMessageMention` | Mentions persistantes dans les messages de groupe, avec etat lu/non lu |
| `CollaborationGroupAuditLog` | Journal d'audit propre aux groupes collaboratifs |
| `CeoObjective` | Objectifs executifs suivis par le CEO: type, departement, responsable, periode, cible, progression et statut |
| `CeoSupervisionLog` | Journal de supervision CEO: observations, decisions, instructions, risques, actions attendues et responsable de suivi |
| `MpoProject` | Portefeuille projets MPO: besoin, objectifs, responsables impliques, priorite, risque, budget estime, statut, livrables et donnees sante digitale |
| `MpoProjectRecord` | Registres MPO: cadrage, cahier de charges, livrable, risque, collaboration CTO/COO, demande budgetaire, besoin SCO, rapport, workflow ou documentation |
| `CtoTechnicalProject` | Projets techniques CTO lies eventuellement a un projet MPO: solution, responsable, stack, environnement, statut, depot et livrables techniques |
| `CtoTechnicalRecord` | Registres CTO: architecture, tache technique, API, base de donnees, deploiement, securite, bug/incident, qualite, besoin budgetaire ou materiel SCO |
| `LegalCase` | Dossiers juridiques LA: type, departement demandeur, demandeur, responsable LA, risque, priorite, echeance, decision et validation CEO |
| `LegalContract` | Contrats et conventions: partie concernee, responsable interne, periode, montant, document joint, dossier lie et validations LA/CEO |
| `LegalTemplate` | Modeles juridiques: contrats, NDA, conventions, lettres, mandats, clauses, version et statut |
| `LegalRisk` | Risques juridiques et conformite: source, impact, probabilite, niveau, mesure corrective, responsable et escalade CEO |
| `LegalDocument` | Archivage juridique securise: document officiel, reference, expiration, dossier lie, fichier, statut et niveau de confidentialite |
| `LegalDispute` | Litiges et reclamations: partie concernee, type, montant potentiel, risque, responsable, prochaine action et documents |
| `LegalRequest` | Demandes juridiques internes provenant de HR & CFO, COO, CTO, MPO, SCO ou CEO |
| `LegalReport` | Rapports juridiques hebdomadaires, mensuels, contrats, risques, litiges, documents expirant et demandes par departement |

Champs profil utilisateur ajoutes:

- `jobTitle`, `bio`, `location`, `website`: informations professionnelles facultatives;
- `avatarUrl`: URL d'affichage de la photo de profil, renseignee manuellement ou pointee vers `/api/users/[id]/avatar`;
- `avatarStoragePath`: chemin prive Supabase Storage pour lire l'avatar via la route serveur;
- `publicProfileConsent`: consentement explicite pour afficher le nom, la fonction et l'avatar sur les publications publiques dont l'utilisateur est auteur.
- `preferredModel`: modele LLM prefere par l'utilisateur pour le chatbot, parmi les modeles configures;
- `notifySupportEnabled`, `notifyUsageEnabled`, `notifyBroadcastEnabled`: preferences de notifications applicatives;
- `pushNotificationsEnabled`: autorise l'affichage de notifications navigateur/PWA pendant une session connectee.
- `interfaceDensity`, `startPage`, `locale`, `timezone`, `dateFormat`, `emailDigestFrequency`: preferences privees persistantes pour l'affichage, la page de demarrage, la langue, le fuseau horaire, le format de date et la synthese email;
- `chatResponseStyle`, `chatResponseLength`: preferences qui orientent le ton et la longueur des reponses du chatbot sans exposer de details techniques internes.

Champs conversation ajoutes:

- `projectName`: dossier ou projet libre permettant de classer l'historique des conversations par sujet.
- `projectId`: lien vers `ConversationProject` pour les dossiers geres par CRUD.

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

## 6.1. Administration COO, fichiers operationnels et espace collaborateur

La section Administration `COO` est controlee par `AppSetting.adminRoleAccess` via `requireAdminBlockAccess("coo")`. Elle couvre les operations internes, taches journalieres, taches recurrentes, coordination inter-departements, blocages, reunions, workflows et rapports operationnels.

Routes API:

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/admin/coo/[entity]` | bloc admin `coo` | Cree une operation COO validee par `cooSchemas` |
| `PATCH` | `/api/admin/coo/[entity]/[id]` | bloc admin `coo` | Met a jour une operation COO avec enrichissement departement/collaborateur |
| `DELETE` | `/api/admin/coo/[entity]/[id]` | bloc admin `coo` | Supprime avec controles de relations sensibles |
| `POST` | `/api/admin/operation-files` | blocs `coo`, `hrCfo`, `sco`, `mpo`, `cto`, `la` ou `ceo` | Importe une piece justificative dans Supabase Storage |
| `GET` | `/api/admin/operation-files/[...path]` | blocs `coo`, `hrCfo`, `sco`, `mpo`, `cto`, `la` ou `ceo` | Sert un fichier operationnel via route serveur privee |
| `GET` | `/api/admin/payrolls/[id]/pdf` | bloc admin `hrCfo` ou collaborateur proprietaire | Affiche un bulletin de paie imprimable/exportable en PDF |
| `GET` | `/api/collaborators/groups` | utilisateur connecte | Liste les groupes dont l'utilisateur est membre, ses invitations et les utilisateurs invitables |
| `POST` | `/api/collaborators/groups` | utilisateur connecte | Cree un groupe et ajoute le createur comme proprietaire |
| `PATCH` | `/api/collaborators/groups/[id]` | proprietaire, admin de groupe ou `ADMIN` | Met a jour nom, description, type, visibilite ou statut |
| `DELETE` | `/api/collaborators/groups/[id]` | membre actif | Archive le groupe si gestionnaire, sinon fait quitter le membre |
| `POST` | `/api/collaborators/groups/[id]/invitations` | proprietaire/admin de groupe | Cree des invitations en lot par utilisateurs et/ou emails, ignore les membres deja presents ou invitations actives, sans ajout automatique |
| `PATCH` | `/api/collaborators/invitations/[id]` | invite ou emetteur | Accepte, refuse ou annule une invitation |
| `GET` | `/api/collaborators/groups/[id]/messages?limit=&cursor=` | membre actif | Lit le fil du groupe avec pagination cursor, mentions et partages chatbot |
| `POST` | `/api/collaborators/groups/[id]/messages` | membre actif | Envoie un message, une mention ou un partage chatbot appartenant a l'utilisateur; le partage chatbot cree un snapshot consultable par le groupe |
| `PATCH` | `/api/collaborators/messages/[id]` | auteur ou gestionnaire | Modifie/archive un message et reconstruit les mentions |
| `DELETE` | `/api/collaborators/messages/[id]` | auteur ou gestionnaire | Soft delete du message et archive le snapshot chatbot associe si applicable |
| `GET` | `/api/collaborators/shared-conversations/[id]` | membre actif du groupe | Ouvre la copie/snapshot d'une conversation chatbot partagee sans exposer la conversation originale |
| `POST` | `/api/collaborators/groups/[id]/contact-support` | membre actif | Ajoute un message systeme et notifie l'equipe support DTSC |

Les champs de pieces justificatives ne sont plus des champs texte libres dans l'UI operations: l'utilisateur selectionne un fichier depuis ordinateur ou mobile. Le fichier est valide cote serveur (type MIME, taille, session, RBAC), stocke dans Supabase Storage via la cle service role cote serveur, puis reference par une URL interne `/api/admin/operation-files/...`. Cette URL ne doit pas etre exposee comme un objet public Supabase.

Les collaborateurs lies a `HrcfoEmployee.userId` disposent d'un module prive `/activities`. Il affiche les activites COO partagees avec eux: taches assignees ou supervisees, operations pilotees, demandes inter-departements, blocages et reunions. Un utilisateur sans dossier collaborateur actif est redirige vers `/dashboard`.

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
- `/collaborators`
- `/profile`
- `/settings`
- `/support`
- `/notifications`
- `/announcements`
- `/admin`

`/documents` reste disponible comme ancienne route et redirige vers `/company`. `/admin` est visible pour `ADMIN`, `MANAGER` et `SUPPORT`; les sous-modules internes sont controles par `AppSetting.adminRoleAccess`. Le role `CLIENT` est redirige vers `/dashboard`.

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
- `hrCfo`: ressources humaines, finance, budgets, depenses, factures et controle interne;
- `sco`: supply chain operations, fournisseurs, achats, stocks, actifs et logistique;
- `visits`: visites du site;
- `activity`: conversations, utilisateurs et tickets;
- `audits`: paiements, logs API et webhooks.

La page Administration est organisee en sous-modules via `section` dans l'URL (`/admin?section=users`, `/admin?section=audits`, etc.) afin d'eviter une page unique trop longue. La vue generale accepte un filtre periode (`7`, `30`, `90`, `200` jours) ou une date precise, puis recalcule les metriques serveur: utilisateurs actifs et nouveaux comptes, conversations, messages, tokens, visites publiques, tickets, paiements confirmes, revenus suivis, contacts, abonnes newsletter, erreurs API, documents prets, publications publiques et brouillons. Les graphiques restent bornes dans leurs cartes et utilisent les series journalieres de visites, messages et tokens. Les sous-modules `HR & CFO` et `SCO` ajoutent un mini-ERP interne DTSC: formulaires de creation, listes paginees, recherche intelligente, changement de statut, notes de suivi, suppression controlee, audit log et logs API. Les blocs `Audit des paiements` et `Logs API et webhooks` utilisent `ListControls` et `useSmartList` pour une recherche accent-insensible et une pagination cote UI. Les visites publiques sont agregees par requete SQL et le total est calcule par `count()` sur la periode filtree, sans limite fixe a 500 lignes.

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
- `lib/private-chat-actions.ts`

Flux:

1. Le client appelle `POST /api/chat`.
2. La route verifie la session.
3. Rate limit: 30 requetes par heure et par utilisateur via Upstash Redis si configure, sinon fallback memoire.
4. Verification du statut utilisateur.
5. Verification des parametres globaux: chatbot actif, maintenance inactive.
6. Verification des limites journalieres:
   - nombre de messages utilisateur;
   - total tokens depuis `UsageLog`.
7. Creation ou recuperation de la conversation; l'historique peut etre classe par `projectName`.
8. Sauvegarde du message utilisateur.
9. Detection d'une action privee explicitement confirmee: envoi d'un message a DTSC ou creation d'un ticket support.
10. Si une action est prete, la route execute l'action cote serveur, journalise `AuditLog`, enregistre la reponse assistant et retourne un flux texte court sans exposer de secret.
11. Sinon, recuperation du contexte Entreprise prive via `lib/company-context.ts`, si renseigne.
12. Selection du modele: modele explicite de la requete, sinon `User.preferredModel`, sinon modele par defaut serveur.
13. Injection des preferences privees `chatResponseStyle` et `chatResponseLength` pour adapter le ton et le niveau de detail de la reponse.

Actions privees du chatbot:

- `SEND_EMAIL`: apres confirmation explicite, cree un `ContactMessage` avec `source = private_chatbot` et envoie le message a `CONTACT_EMAIL` ou `DTSC_CONTACT_EMAIL` via le service email serveur;
- `CREATE_TICKET`: apres confirmation explicite, cree un `SupportTicket`, applique une priorite validee et notifie les utilisateurs `ADMIN` ou `SUPPORT` actifs;
- si l'objet, la description, la priorite ou la confirmation manquent, le chatbot demande les informations restantes au lieu d'executer l'action.
12. Envoi des 24 derniers messages a OpenAI Responses API, avec contexte Entreprise et contexte documentaire lorsque pertinent.
13. Streaming du texte vers le client.
14. Sauvegarde de la reponse assistant, du `UsageLog` et du log API.

Interface:

- sur mobile/PWA, l'historique des conversations s'ouvre dans un panneau lateral via un bouton menu, afin que la conversation active garde l'espace principal;
- les dossiers/projets peuvent etre crees, renommes et supprimes depuis l'historique; supprimer un dossier ne supprime pas les conversations, il les remet dans `Sans dossier`;
- le fil de conversation affiche un avertissement indiquant que le chatbot peut se tromper et que les reponses importantes doivent etre verifiees.

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
| `PATCH` | `/api/account/preferences` | session | Modele LLM prefere, notifications, notifications navigateur/PWA, page de demarrage, densite d'interface, langue, fuseau horaire, format de date, synthese email, style et longueur de reponse IA |

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
| `PATCH` | `/api/conversations/[id]` | session proprietaire | Renommer conversation et renseigner le dossier/projet |
| `DELETE` | `/api/conversations/[id]` | session proprietaire | Supprimer conversation |
| `GET` | `/api/conversation-projects` | session | Liste des dossiers/projets de conversations |
| `POST` | `/api/conversation-projects` | session | Creer un dossier/projet |
| `PATCH` | `/api/conversation-projects/[id]` | proprietaire | Renommer un dossier/projet |
| `DELETE` | `/api/conversation-projects/[id]` | proprietaire | Supprimer un dossier et retirer le classement des conversations |

### Mes collaborateurs

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `GET` | `/api/collaborators/groups` | session | Groupes de l'utilisateur, invitations en attente, utilisateurs invitables et compteurs de mentions non lues |
| `POST` | `/api/collaborators/groups` | session | Creation groupe et appartenance proprietaire |
| `PATCH` | `/api/collaborators/groups/[id]` | proprietaire/admin groupe ou `ADMIN` | Modifier groupe |
| `DELETE` | `/api/collaborators/groups/[id]` | membre actif | Archiver le groupe ou quitter selon role |
| `POST` | `/api/collaborators/groups/[id]/invitations` | proprietaire/admin groupe | Inviter plusieurs utilisateurs et/ou emails en un envoi |
| `PATCH` | `/api/collaborators/invitations/[id]` | invite ou emetteur | Accepter, refuser ou annuler invitation |
| `GET` | `/api/collaborators/groups/[id]/messages?limit=&cursor=` | membre actif | Lire messages, mentions et partages chatbot avec pagination |
| `POST` | `/api/collaborators/groups/[id]/messages` | membre actif | Envoyer message, reponse `replyToId`, mention ou snapshot de partage chatbot |
| `POST` | `/api/collaborators/groups/[id]/mentions/read` | membre actif | Marquer comme lues les mentions non lues du groupe pour l'utilisateur courant |
| `PATCH` | `/api/collaborators/messages/[id]` | auteur ou gestionnaire | Modifier/archive un message |
| `DELETE` | `/api/collaborators/messages/[id]` | auteur ou gestionnaire | Soft delete d'un message et retrait d'acces au snapshot associe |
| `GET` | `/api/collaborators/shared-conversations/[id]` | membre actif du groupe | Lire une copie partagee de conversation chatbot |
| `POST` | `/api/collaborators/groups/[id]/contact-support` | membre actif | Notifie l'equipe support DTSC |

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

Preferences:

- `SUPPORT` respecte `notifySupportEnabled`;
- `USAGE` respecte `notifyUsageEnabled`;
- `BROADCAST` et `ANNOUNCEMENT` respectent `notifyBroadcastEnabled`;
- `pushNotificationsEnabled` affiche une notification navigateur/PWA pour les dernieres notifications non lues pendant que l'utilisateur est connecte. Les vraies notifications push serveur peuvent etre ajoutees plus tard avec VAPID ou un fournisseur push, sans changer le modele `PushSubscription`.

### Annonces

| Methode | Route | Acces | Description |
| --- | --- | --- | --- |
| `POST` | `/api/announcements` | roles autorises | Creer annonce |
| `PATCH` | `/api/announcements/[id]` | `ADMIN` | Modifier annonce |
| `DELETE` | `/api/announcements/[id]` | `ADMIN` | Supprimer annonce |
| `POST` | `/api/announcements/[id]/copy` | session | Copier une annonce en brouillon avec nouvel auteur |
| `POST` | `/api/announcements/[id]/transfer` | session | Transferer une annonce a des utilisateurs et notifier |
| `POST` | `/api/announcements/[id]/report` | session | Signaler une annonce avec motif et priorite |
| `PATCH` | `/api/announcements/[id]/status` | `ADMIN` | Archiver, restaurer, epingler ou desepingler |
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
| `POST` | `/api/admin/publications` | bloc `publications` | Creation d'une publication publique; les non-admin autorises creent uniquement des brouillons si `allowNonClientPublicationDrafts` est actif |
| `PATCH` | `/api/admin/publications/[id]` | bloc `publications` | Modification; admin pour tout, contributeur non-client uniquement sur ses brouillons |
| `DELETE` | `/api/admin/publications/[id]` | `ADMIN` | Suppression d'une publication publique |
| `PATCH` | `/api/admin/access` | `ADMIN` | Mise a jour des blocs Administration visibles par role non-client |
| `POST` | `/api/admin/broadcast` | `ADMIN` | Notification interne + email utilisateurs, avec logs API et cause d'erreur explicite |
| `POST` | `/api/admin/newsletter-broadcast` | `ADMIN` | Email abonnes newsletter, avec logs API et cause d'erreur explicite |
| `GET` | `/api/admin/exports/payments` | `ADMIN` | Export CSV compatible Excel des paiements |
| `POST` | `/api/admin/hr-cfo/[entity]` | bloc `hrCfo` | Creation d'un dossier HR & CFO (`departments`, `positions`, `accounts`, `employees`, `budgets`, `transactions`, `payrolls`) |
| `PATCH` | `/api/admin/hr-cfo/[entity]/[id]` | bloc `hrCfo` | Mise a jour statut/notes d'un dossier HR & CFO |
| `DELETE` | `/api/admin/hr-cfo/[entity]/[id]` | bloc `hrCfo` | Suppression controlee d'un dossier HR & CFO |
| `POST` | `/api/admin/sco/[entity]` | bloc `sco` | Creation d'un dossier SCO (`materialItems`, `vendors`, `purchaseRequests`, `inventory`, `assets`, `logistics`) |
| `PATCH` | `/api/admin/sco/[entity]/[id]` | bloc `sco` | Mise a jour statut/notes d'un dossier SCO |
| `DELETE` | `/api/admin/sco/[entity]/[id]` | bloc `sco` | Suppression controlee d'un dossier SCO |
| `POST` | `/api/admin/ceo/[entity]` | bloc/poste `ceo` | Creation d'un objectif CEO ou d'une entree de journal de supervision (`objectives`, `supervisionLogs`) |
| `PATCH` | `/api/admin/ceo/[entity]/[id]` | bloc/poste `ceo` | Mise a jour d'un objectif CEO ou d'une entree de supervision |
| `DELETE` | `/api/admin/ceo/[entity]/[id]` | bloc/poste `ceo` | Suppression controlee d'un objectif CEO ou d'une entree de supervision |
| `POST` | `/api/admin/mpo/[entity]` | bloc/poste `mpo` | Creation d'un projet MPO ou registre projet (`projects`, `records`) |
| `PATCH` | `/api/admin/mpo/[entity]/[id]` | bloc/poste `mpo` | Mise a jour d'un projet MPO ou registre projet |
| `DELETE` | `/api/admin/mpo/[entity]/[id]` | bloc/poste `mpo` | Suppression controlee d'un projet MPO ou registre projet |
| `POST` | `/api/admin/cto/[entity]` | bloc/poste `cto` | Creation d'un projet technique CTO ou registre technique (`projects`, `records`) |
| `PATCH` | `/api/admin/cto/[entity]/[id]` | bloc/poste `cto` | Mise a jour d'un projet technique CTO ou registre technique |
| `DELETE` | `/api/admin/cto/[entity]/[id]` | bloc/poste `cto` | Suppression controlee d'un projet technique CTO ou registre technique |
| `POST` | `/api/admin/la/[entity]` | bloc/poste `la` | Creation d'un dossier juridique (`cases`, `contracts`, `templates`, `risks`, `documents`, `disputes`, `requests`, `reports`) |
| `PATCH` | `/api/admin/la/[entity]/[id]` | bloc/poste `la` | Mise a jour d'un element juridique LA avec enrichissement collaborateur/departement |
| `DELETE` | `/api/admin/la/[entity]/[id]` | bloc/poste `la` | Suppression controlee d'un element juridique; un dossier lie a des contrats/documents doit etre archive |

Les routes HR & CFO / SCO / COO / CEO / MPO / CTO / LA utilisent `requireAdminBlockAccess()`: `ADMIN` a toujours acces, tandis que `MANAGER` et `SUPPORT` dependent de `AppSetting.adminRoleAccess`. Les postes officiels du dossier RH completent ces droits: `CEO` peut superviser les vues executives et critiques; `COO` coordonne les operations, projets et blocages; `HR_CFO` gere les donnees RH/finance; `SCO` gere uniquement la supply chain; `MPO` pilote les projets; `CTO` pilote la technologie; `LA` pilote les dossiers juridiques, contrats, conformite, litiges et archives confidentielles. Chaque mutation valide le payload avec Zod, ecrit `ApiLog` et `AuditLog`, et ne renvoie pas de donnees sensibles hors de la session autorisee.

Les cartes KPI generiques des sous-modules operationnels n'utilisent plus `Valeur suivie` ni `Alertes operationnelles`. Elles affichent des indicateurs actionnables: elements actifs, priorites a traiter, transactions impactantes pour HR & CFO, taches bloquees/en retard pour COO et decisions a suivre pour CEO.

Le champ `Poste` du dossier collaborateur n'est plus un texte libre. Il pointe vers `DtscPosition`, gere depuis `HR & CFO > Manager les postes`. Les codes de poste sont stables (`CEO`, `COO`, `HR_CFO`, `SCO`, `CTO`, `MPO`, `LA`, etc.) et servent a determiner les permissions metier cote serveur sans se baser sur une comparaison approximative de texte.

Les champs et workflows s'inspirent des principes suivants: ISO 30414 pour le reporting du capital humain, COSO pour le controle interne, ISO 9001 pour l'approche processus et l'amelioration continue, ISO 45001 pour la logique sante/securite lorsque des risques operations apparaissent, et ASCM SCOR pour structurer les operations supply chain. Les champs visibles `Responsable`, `Demandeur` et `Assigne a` des operations internes sont alimentes par les collaborateurs deja enregistres afin d'eviter les noms libres incoherents.

Les regles financieres sensibles sont centralisees dans `lib/hr-cfo-finance.ts`: creation de budget avec solde disponible, validation des transactions d'entree/sortie, mise a jour du solde du compte, consommation budgetaire, generation de facture, transaction d'abonnement et paie. Une transaction de sortie exige un budget actif et suffisamment disponible; une paie validee cree une transaction de sortie; un paiement d'abonnement confirme cree une transaction d'entree idempotente sur le compte `Banque` et rattache la facture de paiement a cette transaction.

Le SCO dispose maintenant d'un referentiel `MaterialItem` pour les biens materiels. Les stocks et actifs peuvent etre rattaches a ce referentiel pour suivre le meme bien entre inventaire, equipement, assignation et maintenance. Les demandes d'achat selectionnent le fournisseur retenu dans la liste des fournisseurs actifs ou sous surveillance, ce qui evite de saisir un fournisseur non reference. Les champs SCO ajoutent aussi `sourceSection`, `sourceItemId`, liens projet MPO, liens projet CTO, liens budget HR & CFO, liens tache COO, mission et actif afin de retracer l'origine et la destination d'un besoin supply chain sans dupliquer les transactions ni les taches.

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

Les publications publiques sont gerees depuis le bloc `Publications publiques` de `/admin`. L'editeur riche permet le collage d'images ou l'ajout par selection de fichier. Cote navigateur, l'image est redimensionnee en format web lisible, limitee a 960x540 et convertie en WebP avant envoi vers le serveur; cote serveur, la route verifie l'acces au bloc `publications`, le type MIME et la taille avant stockage dans Supabase. En creation ou modification, un clic sur une image affiche une icone de suppression directement sur le visuel afin de retirer l'image du contenu avant enregistrement. Le formulaire affiche aussi un apercu public avant publication pour verifier la taille, le texte et les images. Le catalogue admin affiche maintenant l'auteur, le statut et la date/heure de derniere publication ou mise en brouillon pour chaque contenu.

`AppSetting.allowNonClientPublicationDrafts` permet a l'administrateur d'autoriser les roles non-client qui disposent du bloc `publications` a creer des brouillons sous leur nom. Ces contributeurs ne peuvent jamais publier, supprimer ni modifier une publication deja publiee; ils peuvent modifier uniquement leurs propres brouillons. L'auteur d'origine reste conserve quand un administrateur publie le contenu.

Le catalogue admin des publications utilise `ListControls` et `useSmartList`: recherche accent-insensible sur titre, slug, resume, categorie et statut, puis pagination cote UI. Les creations, modifications et suppressions sont synchronisees dans l'etat client puis `router.refresh()` recharge les donnees serveur sans attendre un rechargement complet de la page.

Routes ajoutees:

| Route | Methode | Acces | Payload | Reponse |
| --- | --- | --- | --- | --- |
| `/api/admin/publications/images` | `POST` | bloc `publications` | `multipart/form-data` avec `file` image JPEG/PNG/WebP optimisee | `{ ok, url, path }` |
| `/api/public/publication-images/[...path]` | `GET` | Public | chemin Supabase commencant par `publications/` | Blob image cacheable |
| `/api/public/search` | `GET` | Public | query string `q` optionnelle, max 80 caracteres | `{ results: [{ title, description, href, category }] }` |
| `/api/publications/[id]/comments` | `POST` | Utilisateur connecte | `{ content, parentId? }` | commentaire cree |
| `/api/publications/comments/[id]` | `PATCH` | `ADMIN` ou auteur dans la fenetre d'edition | `{ content }` | commentaire modifie |
| `/api/publications/comments/[id]` | `DELETE` | `ADMIN` | aucun | suppression du commentaire et de ses reponses |
| `/api/publications/[id]/reactions` | `POST` | Utilisateur connecte | `{ value: 1 | -1 }` | reaction creee, remplacee ou retiree |

Regles RBAC:

- `ADMIN` cree, modifie, publie et supprime les publications publiques;
- les contributeurs non-client autorises creent et modifient uniquement leurs brouillons;
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

## 14.1 PWA DTSC Platform

La configuration PWA est volontairement orientee vers l'espace prive:

- `app/manifest.ts` expose `name: DTSC Platform`, `short_name: DTSC`, `start_url: /dashboard`, `display: standalone`, `theme_color: #0B1220` et les categories business/productivity/technology;
- si un utilisateur non connecte ouvre `/dashboard`, le middleware d'authentification conserve la redirection vers la page de connexion;
- `components/pwa/pwa-register.tsx` enregistre `/sw.js` uniquement en production depuis le layout global afin que la landing page puisse proposer l'installation;
- `components/pwa/pwa-register.tsx` demande une mise a jour du service worker au retour en ligne, au focus, au retour de visibilite et toutes les six heures; si un worker en attente existe, il recoit `SKIP_WAITING` puis le client controle se recharge une seule fois via `controllerchange`;
- `components/pwa/pwa-install-prompt.tsx` affiche une proposition discrete uniquement dans l'espace authentifie, avec les boutons `Installer l'application` et `Plus tard`;
- `components/pwa/public-pwa-install-card.tsx` ajoute sur l'accueil une invitation publique a installer l'application, avec fallback d'instructions si le navigateur ne declenche pas le prompt natif;
- `components/pwa/pwa-notification-bridge.tsx` affiche des notifications navigateur/PWA pour les dernieres notifications non lues lorsque l'utilisateur a active cette preference et que le navigateur a accorde la permission;
- le choix `Plus tard` est conserve dans `localStorage` pendant sept jours;
- `app/offline/page.tsx` affiche une page publique `/offline` en ligne; le fallback hors connexion utilise `public/offline.html`, fichier HTML autonome precache, afin d'eviter les erreurs de chunks Next.js indisponibles sur mobile.

Fichiers PWA:

| Fichier | Role |
| --- | --- |
| `app/manifest.ts` | Manifest App Router, start URL privee `/dashboard` |
| `public/sw.js` | Service worker prudent, cache assets statiques uniquement |
| `public/offline.html` | Fallback hors ligne autonome sans JavaScript Next.js |
| `public/icons/icon-192x192.png` | Icône PWA 192 |
| `public/icons/icon-512x512.png` | Icône PWA 512 |
| `public/icons/maskable-icon-512x512.png` | Icône maskable avec marge de securite |
| `public/icons/apple-touch-icon.png` | Icône iOS |
| `components/pwa/pwa-register.tsx` | Enregistrement du service worker |
| `components/pwa/pwa-install-prompt.tsx` | Prompt d'installation prive |
| `components/pwa/pwa-notification-bridge.tsx` | Alertes navigateur/PWA pendant session connectee |
| `components/pwa/public-pwa-install-card.tsx` | Carte d'installation publique sur la landing page |

Regles de cache:

- aucune reponse `/api/*` n'est mise en cache;
- aucune page HTML privee n'est stockee en cache applicatif;
- les navigations hors ligne tombent sur `/offline.html`, qui ne contient aucune donnee personnelle et ne depend pas des bundles applicatifs;
- seuls les assets statiques Next.js, images publiques, icônes, polices, JS et CSS sont caches;
- `/auth/*`, `/dashboard`, `/chat`, `/activities`, `/collaborators`, `/admin`, `/profile`, `/settings`, `/support`, `/notifications`, `/announcements`, `/billing`, `/company`, `/documents` et `/session-expired` restent exclus du cache de contenu.
- les PWA installees recuperent automatiquement la derniere version apres reconnexion Internet sans cacher de donnees privees supplementaires.

## 15. SEO et pages publiques

Fichiers:

- `app/sitemap.ts`
- `app/robots.ts`
- `app/layout.tsx`
- pages publiques principales: `/`, `/services`, `/solutions`, `/secteurs`, `/projets`, `/ressources`, `/ressources/[slug]`, `/a-propos`, `/contact`
- pages ressources historiques: `/data-afrique`, `/bi-kpi`, `/ia-entreprise`
- pages legales: `/conditions-utilisation`, `/politique-confidentialite`, `/politique-cookies`

Objectifs codes:

- sitemap;
- robots.txt;
- metadonnees;
- Open Graph/Twitter;
- contenus publics longs et indexes;
- FAQ d'accueil avec composant local `Accordion` base sur `details/summary` accessible et donnees structurees JSON-LD `FAQPage`;
- sections publiques avec surfaces alternees et cartes `dtsc-card` / `dtsc-card-alt` pour ameliorer la hierarchie visuelle en mode clair et sombre;
- navigation publique par routes dediees avec onglet actif selon `pathname`;
- recherche publique intelligente dans une barre large dediee sous la navigation via `/api/public/search`, combinant l'index statique `lib/public-search.ts` et les publications admin publiees;
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
| `/ressources` | Ressources publiques statiques, accordions par categorie et trois dernieres publications admin en cartes |
| `/ressources/[slug]` | Lecture detaillee d'une publication admin publiee |
| `/a-propos` | Presentation DTSC, vision, mission, business model et postes de l'organisation sans noms individuels |
| `/contact` | Contact professionnel et inscription newsletter |
| `/politique-cookies` | Cookies essentiels, stockage local, PWA, statistiques publiques et choix utilisateur |

La politique des cookies decrit les cookies strictement necessaires, le stockage local, la PWA, les statistiques de visites publiques et les futurs traceurs non essentiels. Elle s'appuie sur les recommandations CNIL et rappelle qu'aucun cookie publicitaire n'est utilise actuellement.

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
- service worker PWA limite aux assets statiques: les API, routes d'authentification et pages privees ne sont pas cachees;
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

## 20.2 Postes officiels, permissions metier et section CEO - 15 mai 2026

Cette mise a jour centralise les fonctions internes DTSC dans une table officielle `DtscPosition`. Le dossier `HrcfoEmployee` conserve `jobTitle` pour compatibilite historique, mais le champ visible `Poste` pointe maintenant vers `positionId`, avec `positionCode` et `positionTitle` denormalises pour les recherches et les affichages. Les postes par defaut sont seedes par migration et par `ensureDefaultPositions()` lorsque l'administration se charge.

Postes critiques initiaux:

- `CEO`: supervision executive et arbitrage strategique;
- `COO`: pilotage operationnel, taches, workflows, blocages et rapports;
- `HR_CFO`: RH, finances, budgets, transactions, paie et controle;
- `SCO`: fournisseurs, achats, stocks, actifs, biens materiels et logistique;
- `CTO`: pilotage technique;
- `MPO`: Management & Projects Officer, portefeuille projets, cadrage, cahiers de charges, livrables, risques et coordination numerique.

La fonction `requireAdminBlockAccess()` prend maintenant en compte deux niveaux:

- RBAC systeme via `AppSetting.adminRoleAccess`;
- poste metier officiel via `lib/business-roles.ts`.

La section Administration `CEO` ajoute:

- une vue executive consolidee finance/RH/COO/SCO avec filtre de periode `ceoStart` / `ceoEnd` porte par l'URL `/admin?section=ceo`;
- les objectifs strategiques `CeoObjective`;
- le journal de supervision `CeoSupervisionLog`;
- des routes CRUD securisees `/api/admin/ceo/[entity]` et `/api/admin/ceo/[entity]/[id]`.

Le filtre CEO ne modifie pas les donnees source: il filtre les transactions, collaborateurs, taches COO, operations, reunions et donnees SCO utilisees dans les cartes de synthese. Les soldes de comptes restent affiches comme solde courant non periodise afin d'eviter une lecture comptable trompeuse.

Le module `/activities` lit aussi le poste officiel: un collaborateur `CEO` voit une synthese de supervision critique; un collaborateur `COO` voit les operations/taches/blocages a piloter globalement; les autres collaborateurs gardent la logique de propriete ou d'implication. Les objectifs `CeoObjective` assignes et les entrees `CeoSupervisionLog` concernant un collaborateur apparaissent dans le bloc "Objectifs et supervision CEO". Les commentaires utilisent `CooComment` avec les types `CEO_OBJECTIVE` et `CEO_SUPERVISION`, avec controle serveur: CEO et roles admin autorises peuvent superviser, tandis que les collaborateurs non autorises ne voient que les objectifs ou suivis qui les concernent.

Les routes CEO creent une notification applicative ciblee vers `/activities` lors de la creation ou de la mise a jour d'un objectif ou d'une entree de supervision. Les notifications ne sont pas diffusees a toute l'equipe: elles ciblent le responsable de l'objectif, le collaborateur concerne et/ou le responsable de suivi.

## 20.3 Integrations SCO, MPO et CTO - 16 mai 2026

La section SCO reste le centre supply chain: biens materiels, fournisseurs, demandes d'achat, stocks, inventaires, actifs, equipements, missions et logistique. Elle ne remplace pas HR & CFO pour les budgets/transactions et ne recree pas un systeme de taches COO. Les champs ajoutes sont non destructifs et permettent de relier les dossiers SCO a:

- HR & CFO via `relatedBudgetId` pour les besoins budgetaires;
- COO via `relatedTaskId` ou les notifications de blocage/missions;
- MPO via `relatedProjectId` pour les besoins materiels/logistiques projets;
- CTO via `relatedTechnicalProjectId` pour les equipements techniques;
- CEO via notifications uniquement sur criticite, arbitrage ou rupture.

Les notifications SCO sont ciblees: demande d'achat recue, besoin venant de CTO/MPO, besoin budgetaire HR & CFO, achat critique CEO, stock faible/rupture, actif endommage/perdu et mission logistique a coordonner. Les commentaires transversaux utilisent `CooComment` avec les types `SCO_PURCHASE_REQUEST`, `SCO_VENDOR`, `SCO_MATERIAL`, `SCO_INVENTORY`, `SCO_ASSET`, `SCO_LOGISTICS`, et verifient l'appartenance ou le poste cote API.

Deux sections administratives complementaires sont disponibles:

- `MPO`: `MpoProject` et `MpoProjectRecord` pour portefeuille projets, cadrage, cahiers de charges, livrables, risques, demandes budgetaires, besoins SCO, collaboration CTO/COO, rapports et documentation projet;
- `CTO`: `CtoTechnicalProject` et `CtoTechnicalRecord` pour projets techniques, architecture, taches techniques, APIs, bases de donnees, deploiements, securite, bugs/incidents, qualite, besoins budgetaires et besoins materiels SCO.

`/activities` expose les blocs SCO/MPO/CTO aux collaborateurs concernes selon leur poste officiel ou leur implication. Les roles CEO/COO conservent une vue de supervision; SCO n'est pas assimile au commercial, et MPO n'est pas assimile au marketing.

## 20.4 Section LA - Legal Advisor - 16 mai 2026

La section Administration `LA` est ajoutee comme module juridique transversal. L'acces repose sur `requireAdminBlockAccess("la")`, le RBAC configure par `AppSetting.adminRoleAccess` et le poste officiel `LA` du dossier `HrcfoEmployee`. `CEO` conserve une supervision sur les dossiers critiques ou necessitant arbitrage; les autres collaborateurs ne voient dans `/activities` que les elements juridiques ou ils sont demandeurs, responsables ou explicitement impliques.

Modeles ajoutes:

- `LegalCase`: dossiers juridiques, types de dossiers, departement demandeur, demandeur, responsable juridique, risque, priorite, statut, echeance, piece jointe, decision juridique et validation CEO requise;
- `LegalContract`: contrats et conventions, partie concernee, responsable interne, periode, montant, document joint, dossier juridique lie, validation LA et validation CEO;
- `LegalTemplate`: modeles juridiques, clauses, versions et statuts;
- `LegalRisk`: risques juridiques et conformite avec probabilite, impact, mesure corrective, responsable et escalade CEO;
- `LegalDocument`: archivage juridique avec fichier joint, date d'expiration, statut et niveau de confidentialite (`INTERNAL_PUBLIC`, `CONFIDENTIAL`, `VERY_CONFIDENTIAL`, `CEO_ONLY`, `LA_CEO_ONLY`);
- `LegalDispute`: litiges et reclamations avec montant potentiel, responsable de suivi, prochaine action et documents;
- `LegalRequest`: demandes internes vers LA depuis HR & CFO, COO, CTO, MPO, SCO ou CEO;
- `LegalReport`: rapports LA hebdomadaires, mensuels, contrats, risques, litiges, documents expirant et demandes par departement.

Les routes `/api/admin/la/[entity]` et `/api/admin/la/[entity]/[id]` valident les payloads via `laSchemas`, enrichissent les IDs collaborateurs/departements en noms d'affichage, journalisent `ApiLog` et `AuditLog`, et creent des notifications ciblees vers les collaborateurs concernes, les postes `LA` et le `CEO` en cas de criticite, escalade ou validation requise. Les pieces jointes utilisent les champs fichier du panneau operationnel et doivent rester servies par les routes privees Supabase Storage existantes.

Les commentaires juridiques reutilisent `CooComment` avec les types `LEGAL_CASE`, `LEGAL_CONTRACT`, `LEGAL_TEMPLATE`, `LEGAL_RISK`, `LEGAL_DOCUMENT`, `LEGAL_DISPUTE`, `LEGAL_REQUEST` et `LEGAL_REPORT`. Pour les documents juridiques, les niveaux `CEO_ONLY` et `LA_CEO_ONLY` limitent les commentaires et notifications aux postes LA/CEO et a l'admin autorise.

## 20.1 Mise a jour HR & CFO, COO et Activites DTSC - 15 mai 2026

Regles financieres appliquees:

- le service `lib/hr-cfo-finance.ts` centralise les statuts impactants, le recalcul des soldes, la consommation budgetaire, la creation de paie et les transactions d'abonnement;
- le KPI `Chiffre d'affaires` additionne uniquement les transactions d'entree validees, payees ou approuvees, en excluant le libelle exact `capital de départ`;
- le `capital de départ` augmente le solde du compte selectionne mais ne compte pas comme revenu commercial;
- les transactions en brouillon n'impactent ni les comptes, ni les budgets, ni les KPIs; une annulation retire l'impact precedent;
- les transactions de sortie exigent un budget actif; le budget determine le compte financier consomme;
- la paie derive le brut du dossier RH, ajoute les primes, retire les retenues et cree une sortie financiere uniquement quand elle devient validee ou payee;
- tous les paiements d'abonnement confirmes creent une entree idempotente sur le compte financier `Banque`.

Nouveaux modeles et champs Prisma:

- `CooComment`: commentaires securises rattaches a une tache, operation, demande, blocage, reunion, rapport, workflow, paie, objectif CEO ou suivi de supervision CEO;
- `CollaboratorRequest`: demandes directes entre collaborateurs depuis `/activities`, visibles par le demandeur, le destinataire ou un admin autorise; la reponse est portee visuellement par le destinataire et l'API interdit a un autre collaborateur de la saisir;
- `CooWorkflowShare`: historique des workflows partages par le COO a des collaborateurs;
- `CooOperationalReport.recipientEmployeeId`, `recipientName`, `priority`, `content`, `readAt`, `treatedAt`.

Routes API ajoutees ou modifiees:

| Methode | Route | Acces | Usage |
| --- | --- | --- | --- |
| `GET` | `/api/activities/comments?entityType=&entityId=` | session collaborateur ou role autorise | Lire les commentaires d'un element operationnel autorise |
| `POST` | `/api/activities/comments` | session collaborateur ou role autorise | Ajouter un commentaire et notifier les participants concernes |
| `POST` | `/api/activities/requests` | collaborateur DTSC | Creer une demande directe vers un autre collaborateur avec notification ciblee |
| `PATCH` | `/api/activities/requests/[id]` | demandeur ou destinataire implique | Mettre a jour une demande collaborateur: le destinataire peut repondre et faire avancer le statut, le demandeur peut annuler |
| `PATCH` | `/api/activities/tasks/[id]` | collaborateur assigne/responsable | Changer l'avancement d'une tache et declarer un blocage lie si necessaire |
| `POST` | `/api/activities/blockers` | collaborateur DTSC | Declarer un blocage visible par le COO/admin |
| `POST` | `/api/activities/reports` | collaborateur DTSC | Envoyer un rapport operationnel a un autre collaborateur |
| `GET` | `/api/admin/payrolls/[id]/pdf` | admin/role autorise ou collaborateur proprietaire | Telecharger un bulletin de paie PDF |
| `POST/PATCH/DELETE` | `/api/admin/hr-cfo/[entity]` | bloc admin `hrCfo` | Appliquer les regles financieres centralisees |
| `POST/PATCH` | `/api/admin/coo/[entity]` | bloc admin `coo` | Partager des workflows, renseigner destinataires de rapports et journaliser les operations |

Les types de commentaires acceptes incluent `COLLAB_REQUEST`, `CEO_OBJECTIVE` et `CEO_SUPERVISION`; ces types limitent l'acces aux personnes directement referencees ou aux roles strictement autorises.

## 20.3 Responsive Activites, notifications lisibles et changelog - 18 mai 2026

Interface Activites:

- les modales applicatives imposent maintenant `min-w-0`, `overflow-x-hidden` et des marges mobiles plus compactes pour eviter les debordements horizontaux;
- les formulaires collaborateur COO/LA de `/activities` contraignent les selecteurs et grilles avec `w-full min-w-0`, ce qui garde les champs dans leur conteneur sur mobile;
- les titres et descriptions de modales utilisent des retours de ligne naturels pour conserver une lecture correcte sur petits ecrans.

Notifications:

- les badges de type utilisent `formatEnumLabel()` au lieu d'afficher la valeur technique brute;
- les apercus et details remplacent les tokens techniques avec underscores, par exemple `COLLAB_REQUEST` ou `IN_PROGRESS`, par des libelles francais lisibles;
- les notifications liees aux activites collaborateur pointent par defaut vers `/activities` si aucun lien cible explicite n'est fourni.

Documentation:

- `docs/CHANGELOG.md` initialise le suivi chronologique des ameliorations par commit.

## 20.4 Agent IA public DTSC et confirmations publications - 18 mai 2026

Agent IA public:

- le widget `DtscAgentWidget` est integre a la landing page publique et reste isole cote client;
- la route `POST /api/public/dtsc-agent` recoit une conversation courte, applique un rate limit public, appelle OpenAI cote serveur avec le prompt de cadrage DTSC et ne renvoie jamais de cle API au client;
- les reponses sont renvoyees en `application/x-ndjson` avec des evenements `delta` puis `done` afin que le widget affiche une progression type streaming;
- `AppSetting.publicAgentEnabled` permet a l'admin d'activer ou desactiver l'agent depuis Parametres globaux;
- lorsque l'agent est desactive, la route renvoie un fallback public sans appel OpenAI: resume des expertises DTSC et invitation a remplir manuellement le formulaire Contact/newsletter;
- le fallback de l'agent desactive oriente aussi vers la FAQ de la landing page pour les questions frequentes;
- la route injecte un contexte FAQ issu de la landing page afin d'orienter les visiteurs vers les reponses publiques existantes sur DTSC, l'assistant, les tickets, la securite, les abonnements et les publications;
- la route enrichit le prompt avec les publications publiques reellement publiees; l'agent ne doit citer que ces ressources et ne doit jamais inventer de guide, checklist, article, PDF ou etude de cas non redige par DTSC;
- un filtre serveur refuse les messages manifestement hors perimetre DTSC avant l'appel OpenAI et renvoie la reponse officielle de recentrage;
- l'agent est limite aux sujets DTSC: transformation numerique, data analytics, reporting, automatisation, IA appliquee, developpement web/applications metier, conseil technologique, gouvernance des donnees et prise de contact;
- l'outil serveur `createLeadAndNotify` est appele uniquement apres confirmation du visiteur et exige les champs minimaux: nom complet, email, service recherche et description du besoin;
- une conversation deja transmise envoie `leadSubmitted=true` afin d'eviter plusieurs notifications pour la meme demande dans le widget.

Prospects et email:

- `NewsletterSubscriber` est reutilise pour eviter une table doublon et ajoute les champs `requestedService`, `needDescription`, `urgency`, `estimatedBudget`, `preferredContactChannel` et `aiSummary`;
- le statut `new_ai_lead` identifie les prospects issus de l'agent IA public;
- `lib/public-ai-leads.ts` valide les donnees avec Zod, nettoie les champs, upsert par email et envoie une notification via `sendZohoOutboundMail`;
- le destinataire est `CONTACT_EMAIL` si defini, sinon `DTSC_CONTACT_EMAIL`, par defaut `contact@dtsc-platform.com`.
- les emails entrants prospects et newsletter utilisent le gabarit professionnel de `lib/zoho-mail.ts`, avec HTML nettoye, champs Zoho `bodyHtml`/`toText`/`ccText`/`bccText` et version texte structuree pour les clients qui n'affichent pas le HTML.

Route API:

| Methode | Route | Acces | Payload principal | Reponse |
| --- | --- | --- | --- | --- |
| `POST` | `/api/public/dtsc-agent` | public rate limite | `messages`, `leadSubmitted`, `conversationId` | Flux `application/x-ndjson` avec evenements `delta` puis `done` |

Migration:

- `prisma/migrations/20260518120000_public_ai_agent_leads/migration.sql` ajoute les champs de qualification IA sur `NewsletterSubscriber` et l'index `NewsletterSubscriber_source_status_idx`.
- `prisma/migrations/20260518143000_public_agent_setting/migration.sql` ajoute `AppSetting.publicAgentEnabled`.
- `prisma/migrations/20260518162000_publication_draft_contributors/migration.sql` ajoute `AppSetting.allowNonClientPublicationDrafts`.

Confirmations applicatives:

- le gestionnaire des publications publiques demande une confirmation avant suppression definitive;
- la sauvegarde d'une modification de publication ouvre aussi une confirmation applicative avant `PATCH`;
- la gestion des inscrits newsletter demande une confirmation avant mise a jour, conversion, desabonnement ou archivage;
- les actions sensibles restent journalisees cote API via `AuditLog`.

Variables:

- `OPENAI_API_KEY`: obligatoire pour l'agent IA public;
- `CONTACT_EMAIL`: destinataire explicite des prospects IA, avec fallback sur `DTSC_CONTACT_EMAIL`;
- `ZOHO_MAIL_*`: configuration email existante reutilisee pour l'envoi des notifications.

## 20.2 Acces admin par poste RH, workflows collaborateur et prospects newsletter - 17 mai 2026

Acces Administration:

- la fonction centrale `canAccessAdminSection(user, blockId, access)` combine le role applicatif, `AppSetting.adminRoleAccess` et le poste officiel issu de `HrcfoEmployee.position` / `DtscPosition.code`;
- `ADMIN` conserve tous les blocs;
- les sections sensibles exigent le poste officiel exact: `HR_CFO` pour HR & CFO, `SCO`, `COO`, `CEO`, `MPO`, `CTO` et `LA`;
- un RBAC coche sans poste officiel correspondant ne suffit plus pour afficher ou appeler les API sensibles;
- `requireAdminBlockAccess()` applique la meme regle cote backend pour `/api/admin/hr-cfo`, `/api/admin/sco`, `/api/admin/coo`, `/api/admin/ceo`, `/api/admin/mpo`, `/api/admin/cto` et `/api/admin/la`.

Workflows collaborateur depuis `/activities`:

| Methode | Route | Acces | Payload principal | Reponse |
| --- | --- | --- | --- | --- |
| `POST` | `/api/activities/collaborator-workflows` | collaborateur RH actif | `workflowType`, champs du formulaire COO/LA, participants ou pieces liees | `{ ok, entityType, entityId, message }` |
| `POST` | `/api/activities/files` | collaborateur RH actif ou `ADMIN` | `multipart/form-data` avec `file` | `{ ok, url, path }` |
| `GET` | `/api/activities/files/[...path]` | auteur du fichier, `ADMIN`, poste officiel `LA` ou `CEO` | chemin interne Supabase `operations/...` | fichier servi par route privee |

`workflowType` accepte `COO_MEETING`, `LEGAL_CASE`, `LEGAL_CONTRACT`, `LEGAL_RISK`, `LEGAL_DISPUTE` et `LEGAL_REQUEST`. La route cree les enregistrements dans les tables existantes (`CooMeeting`, `LegalCase`, `LegalContract`, `LegalRisk`, `LegalDispute`, `LegalRequest`) avec `sourceModule = ACTIVITES_DTSC`, `targetSection = COO` ou `LA`, `createdById`, statut initial coherent, commentaire initial via `CooComment`, notifications vers COO/LA et participants concernes. Les collaborateurs ne gagnent pas l'acces aux routes `/api/admin/...`.

Les champs de piece jointe des formulaires Activites DTSC ne sont plus des zones de texte libre. Le navigateur selectionne un fichier local, affiche un apercu local pour les images et PDF, puis envoie le fichier a `/api/activities/files`. Le serveur valide session, dossier collaborateur actif, taille maximale 10 Mo, extension et type MIME autorises (PDF, images, Word, Excel, PowerPoint, CSV, TXT), stocke via Supabase Storage service role et renvoie une URL interne `/api/activities/files/...`. La route `/api/activities/collaborator-workflows` rejette les liens arbitraires dans `attachmentUrl` ou `documentUrl`: ces champs doivent provenir d'un upload autorise. Les telechargements sont journalises et restent limites a l'auteur du fichier, aux admins et aux postes LA/CEO concernes par le workflow juridique.

Vues CEO:

- la synthese CEO ajoute des groupes consolides MPO, CTO et LA;
- les filtres `ceoStart` / `ceoEnd` restent dans l'URL et filtrent les metriques sans modifier les donnees source;
- les indicateurs LA tiennent compte des dossiers, contrats, risques, litiges, demandes et documents confidentiels.

Newsletter:

- `NewsletterSubscriber` est etendu avec `phone`, `jobTitle`, `signupPage`, `commercialConsent`, `internalNotes`, `convertedToUser`, `convertedUserId`, `convertedAt`;
- la section Administration > Utilisateurs contient le bloc `Inscrits newsletter`;
- `GET /api/admin/newsletter-subscribers` liste les prospects et les utilisateurs liables, acces `ADMIN`;
- `PATCH /api/admin/newsletter-subscribers` modifie statut/notes, archive, desabonne ou lie explicitement un inscrit a un utilisateur existant, acces `ADMIN`, avec `AuditLog` et `ApiLog`;
- aucune conversion automatique n'est effectuee depuis l'inscription publique.

Migration:

- `prisma/migrations/20260517193000_admin_access_collab_newsletter/migration.sql` ajoute les colonnes de tracabilite workflow et de qualification newsletter.

Interface:

- les sous-modules HR & CFO, SCO et COO disposent d'un filtre de date immediate qui ajuste les listes et indicateurs visibles;
- le module `/activities` dispose du meme filtre de periode et affiche les blocs interactifs: demandes collaboratives, taches, operations, coordination, blocages/reunions, rapports, paie et workflows partages;
- le bloc `Suivi de la paie` permet au collaborateur de consulter ses remunerations dans le temps et de telecharger ses bulletins;
- les collaborateurs peuvent commenter les elements operationnels autorises, declarer un blocage, envoyer un rapport operationnel et formuler une demande directe a un autre collaborateur depuis chaque modale d'activite.

Points de securite:

- les commentaires et actions collaborateur verifient l'appartenance a l'objet ou le role cote serveur;
- le RABC admin reste applique via `requireAdminBlockAccess`;
- les donnees de paie restent limitees au collaborateur concerne et aux roles autorises.

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
