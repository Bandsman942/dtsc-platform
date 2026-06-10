# Checklist QA regression DTSC Platform

Cette checklist couvre les parcours critiques apres les refactors Console DTSC, Entreprise, Support, appels collaboratifs et sous-domaines. Elle complete la commande:

```bash
pnpm qa:regression
```

La commande effectue des controles source-level sans dependance externe: middleware, redirects, routes Support, routes Enterprise, groupes, appels, notifications, calendrier et loaders. Elle ne remplace pas les tests manuels avec comptes reels de staging.

## Pharmacie - Lots & péremptions

- [ ] Une organisation PHARMACY crée et modifie un lot lié à un produit actif de la même organisation.
- [ ] Les doublons produit + numéro de lot et les codes-barres de lot dupliqués sont refusés.
- [ ] Les quantités négatives, incohérentes ou supérieures à la quantité reçue sont refusées.
- [ ] Les lots expirés, rappelés, bloqués et en quarantaine sont exclus de l'endpoint FEFO.
- [ ] Les lots vendables sont triés par date de péremption croissante.
- [ ] Les actions quarantaine, levée, rappel, blocage et annulation exigent un motif et créent une trace.
- [ ] Une organisation ne peut consulter ou modifier aucun lot d'une autre organisation.
- [ ] Le formulaire lots reste plein écran sur mobile et utilise les référentiels réels pour ses relations.

## Pharmacie - Stock & inventaire

- [ ] Les KPI stock, ruptures, stocks faibles, surstocks et valeurs proviennent des lots de l'organisation active.
- [ ] La vue stock par produit additionne les quantités disponibles, réservées et endommagées des lots.
- [ ] Une session d'inventaire génère des lignes depuis les lots de la même organisation.
- [ ] Un comptage calcule et persiste l'écart sans modifier directement le stock.
- [ ] Un ajustement validé crée un mouvement et modifie le lot; son annulation crée un mouvement inverse.
- [ ] Aucun ajustement ne peut produire une quantité disponible négative.
- [ ] Les emplacements, collaborateurs, départements, produits et lots d'une autre organisation sont refusés.
- [ ] Les dix sous-vues Stock & inventaire restent lisibles en cartes mobiles et les formulaires s'ouvrent en plein écran.
- [ ] Chaque étiquette des formulaires Stock & inventaire possède une info-bulle compréhensible et chaque option de liste est affichée en français métier, sans code interne.
- [ ] Sur un écran mobile étroit, les formulaires Stock, les filtres Produits et le sélecteur d'entreprise de connexion restent entièrement contenus dans leur zone sans débordement horizontal.

## Pharmacie - Entrées stock / réceptions

- [ ] Une organisation PHARMACY peut créer et modifier une réception en brouillon liée uniquement à ses fournisseurs, commandes, produits, collaborateurs, départements et emplacements.
- [ ] La soumission n'impacte pas le stock; la validation augmente les lots et crée un mouvement `RECEIPT` par lot reçu.
- [ ] Valider deux fois la même réception ne double jamais le stock.
- [ ] L'annulation après validation crée les mouvements inverses et refuse une quantité disponible négative.
- [ ] Une réception partielle conserve la quantité restante attendue et met la commande liée à `PARTIALLY_RECEIVED`.
- [ ] Les écarts de quantité sont persistés et les écarts critiques apparaissent dans les KPI.
- [ ] Les documents de réception utilisent le système documentaire privé sans champ URL libre.
- [ ] La liste utilise des cartes mobiles, le formulaire est plein écran et aucun sous-bloc n'est un placeholder.

## Navigation et socle commun Enterprise

- Vérifier que la sidebar d'une entreprise cliente affiche uniquement les modules du socle commun actifs et autorisés.
- Vérifier que les modules sectoriels Santé et Pharmacie restent accessibles dans `Administration [entreprise]` sans carte ou lien latéral répété.
- Ouvrir plusieurs pages `/enterprise-modules/[moduleCode]` du socle commun et vérifier les KPI/listes issus de l'organisation active.
- Vérifier qu'une page générique refuse un module sectoriel même avec une URL saisie manuellement.
- Vérifier qu'aucune donnée d'une autre organisation n'apparaît dans les collaborateurs, départements, workflows, demandes, réunions ou audits.

## 1. Socle technique

- Executer `pnpm install --no-frozen-lockfile` si l'environnement local n'a pas encore `node_modules`.
- Executer `pnpm type-check`.
- Executer `pnpm lint`.
- Executer `pnpm qa:regression`.
- Executer `pnpm build`.
- Executer `git diff --check`.
- Verifier que Vercel lance toujours `pnpm prisma migrate deploy && pnpm build`.
- Verifier qu'aucune migration Prisma destructive n'est ajoutee.
- Verifier que la migration `20260607143000_support_and_operational_comment_threads` ajoute uniquement des colonnes, index et clés étrangères.
- Verifier que `docs/SAAS_PLANS_AND_ENTITLEMENTS.md` reste aligne avec `lib/billing/plans.ts`, `lib/billing/plan-limits.ts`, `lib/billing/module-entitlements.ts` et `lib/billing/entitlements.ts`.

## 2. Sous-domaines et auth

- Domaine public `dtsc-platform.com`: ouvrir `/`, `/services`, `/solutions`, `/secteurs`, `/projets`, `/a-propos`, `/ressources`, `/contact`, `/data-afrique`, `/bi-kpi` et `/ia-entreprise`.
- Domaine public: verifier que les liens internes visibles pointent uniquement vers des routes existantes et que les CTA principaux renvoient vers `/contact`, `/services`, `/solutions`, `/ressources`, `/projets` ou les pages pedagogiques.
- Domaine public: verifier sur mobile que les blocs de cartes, accordions, carrousels hero et CTA ne creent pas de debordement horizontal.
- Domaine public: ouvrir `/dashboard` et confirmer la redirection vers `app.dtsc-platform.com/dashboard`.
- Domaine public: ouvrir `/admin` et confirmer la redirection vers `console.dtsc-platform.com/admin`.
- Domaine public: ouvrir `/auth/sign-in` et confirmer la redirection vers `account.dtsc-platform.com/auth/sign-in`.
- Account: login avec `next` vers app, support et console.
- Account: tester un `next=https://example.com` et confirmer qu'il est refuse au profit d'une destination interne.
- Logout: confirmer l'expiration du cookie host-only et du cookie partage quand `AUTH_COOKIE_DOMAIN=.dtsc-platform.com`.
- Session expiree: ouvrir `/dashboard`, `/support`, `/collaborators`, `/enterprise-admin`, `/enterprise-activities`, `/calendar` et confirmer la redirection vers Account.

## 3. Profils utilisateur

### Utilisateur DTSC interne

- Se connecter avec contexte `DTSC_INTERNAL`.
- Ouvrir `console.dtsc-platform.com/admin`: acces autorise.
- Ouvrir `app.dtsc-platform.com/dashboard`: acces SaaS autorise.
- Ouvrir `support.dtsc-platform.com/support`: tickets Support visibles selon role.
- Ouvrir `app.dtsc-platform.com/collaborators`: groupes DTSC et groupes autorises visibles.
- Ouvrir `app.dtsc-platform.com/calendar`: calendrier interne visible selon role/poste.
- Verifier que la navigation produit affiche Console, SaaS, Support, Compte et Site public.

### Support DTSC

- Se connecter avec role `SUPPORT` et contexte `DTSC_INTERNAL`.
- Ouvrir Support: voir les tickets autorises.
- Repondre a un ticket: message persiste, notification client non bloquante.
- Tenter `/admin`: acces selon `AppSetting.adminRoleAccess`, sans passe-droit vers les donnees clientes.
- Voir les disponibilites des collaborateurs DTSC dans le calendrier si autorise par les regles recentes.
- Verifier qu'aucun ticket d'une autre organisation n'expose de donnees metier privees hors support autorise.

### Admin entreprise

- Se connecter avec contexte `ORGANIZATION`.
- Ouvrir `/enterprise-admin`: acces autorise si role entreprise habilite.
- Activer un module non socle inclus dans le plan: il apparait dans la navigation de tous les collaborateurs autorises et ouvre `/enterprise-modules/[moduleCode]`.
- Desactiver ce module: il disparait de la navigation et sa page dédiée retourne un accès introuvable/interdit.
- Confirmer qu'une entreprise ne voit que ses modules socle et ceux de son propre secteur, jamais les modules spécifiques d'un autre secteur.
- Modifier un module, un departement, un poste ou un workflow: operation persistee et limitee a `organizationId`.
- Ouvrir `/enterprise-activities`: voir les demandes de l'organisation selon permissions.
- Ouvrir `/support`: voir ses tickets personnels et creer un nouveau ticket rattache au contexte actif.
- Ouvrir `/admin`: redirection vers dashboard, pas d'acces Console DTSC.

### Membre entreprise

- Se connecter avec contexte `ORGANIZATION`.
- Ouvrir `/enterprise-admin`: refus si non habilite.
- Ouvrir `/enterprise-activities`: acces si membership actif.
- Creer une demande d'activite: visible immediatement et apres rechargement.
- Changer de contexte vers une autre organisation: les demandes, groupes et notifications changent de scope.
- Verifier qu'aucune donnee de l'organisation precedente ne reste visible.

### Client simple

- Se connecter hors organisation.
- Ouvrir `/dashboard`, `/chat`, `/company`, `/support`, `/collaborators`.
- Ouvrir `/enterprise-admin` et `/enterprise-activities`: redirection/refus attendu.
- Creer un ticket Support: visible immediatement, visible apres reconnexion, isole par `userId`.
- Tenter `/admin`: redirection dashboard.

### Utilisateur sans organisation

- Login sans `organizationId`.
- Confirmer la redirection par defaut vers `app.dtsc-platform.com/dashboard`.
- Verifier que les modules Entreprise ne sont pas accessibles.
- Verifier que Support reste accessible avec historique personnel.

## 4. Acces interdit entre organisations

- Utilisateur A de l'organisation A ne voit pas les demandes, membres, modules, workflows, records sante ou calendrier de l'organisation B.
- Utilisateur A ne peut pas appeler les routes `/api/enterprise/[organizationId]/*` de B.
- Un admin entreprise A ne peut pas ajouter, modifier ou lire des objets de B par changement manuel d'URL.
- Les donnees `HEALTH_CARE` ne se chargent que si l'organisation active a `sectorCode = HEALTH_CARE`.
- Les donnees `PHARMACY` ne se chargent que si l'organisation active a `sectorCode = PHARMACY`.
- Les routes PHARMACY refusent les produits, lots, fournisseurs, commandes, ventes et ordonnances d'une autre organisation.
- Une vente PHARMACY validee diminue le lot une seule fois; une annulation restaure le stock; une reception validee augmente le lot une seule fois.
- Les lots expires, rappeles, en quarantaine ou insuffisants sont refuses lors d'une vente.
- Administration PHARMACY affiche uniquement ses sous-modules pharmacie et Activites PHARMACY utilise des formulaires distincts avec destinataire.
- Un contexte `GLOBAL_CLIENT` ne peut pas lire les donnees d'une organisation via ancien `organizationId`.

## 5. Console DTSC

- `/admin` reste reserve a `DTSC_INTERNAL`.
- Le chargement initial ne recupere que les KPIs essentiels et les datasets de la section active.
- Les sections restent disponibles: Vue generale, Entreprises clientes, Abonnements & facturation, Support client, Publications & contenus, Utilisateurs & acces, Securite & audit, Modules internes DTSC, Parametres plateforme.
- Abonnements & facturation: verifier organisation, plan, statut abonnement, dates d'essai/renouvellement, limites utilisateurs/stockage/appels/documents, modules actifs, dernier paiement et audit des paiements.
- Abonnements & facturation: creer un abonnement pour une entreprise sans periode courante, modifier plan/statut/dates, puis verifier la persistance apres rechargement.
- Abonnements & facturation: activer, demarrer un essai, suspendre, signaler un retard et verifier que chaque transition exige un motif et produit des journaux.
- Abonnements & facturation: renouveler et verifier que l'ancienne periode passe a `EXPIRED` tandis qu'une nouvelle periode est creee et visible dans l'historique.
- Abonnements & facturation: annuler et verifier qu'aucun abonnement, paiement ou historique n'est supprime physiquement.
- Routes `/api/admin/organization-subscriptions*`: refuser origine externe, session non DTSC, role non autorise, payload invalide et creation concurrente d'une seconde periode courante.
- Plans et tarifs: un `ADMIN` modifie un prix, recharge `/admin` puis `/billing` et retrouve le prix persiste.
- Plans et tarifs: verifier qu'un `MANAGER`, une origine externe et un payload invalide sont refuses par `PATCH /api/admin/billing-plans/[id]`.
- Plans et tarifs: desactiver un plan payant et verifier qu'il reste visible dans la Console mais disparait des nouveaux abonnements; le plan `freemium` ne peut etre ni payant ni inactif.
- Plans et tarifs: appeler un parcours utilisant `ensureBillingPlans()` et verifier que les tarifs administres ne sont pas reinitialises.
- Entreprises clientes: verifier qu'une creation, suspension, archivage ou mise a jour d'abonnement exige un compte DTSC interne autorise et ne permet pas d'editer les donnees metier privees du client.
- Les modules internes CEO, COO, CTO, MPO, HR & CFO, SCO et LA restent accessibles selon poste officiel et RBAC.
- Les tableaux restent scrollables sur mobile et desktop.

## 5 bis. Plans SaaS et entitlements

- Organisation `STARTER` active sans abonnement actif: Support et collaboration de base restent lisibles, mais calendrier, appels, Administration [Entreprise], Activites [Entreprise] avancees et modules sectoriels sont bloques avec message clair.
- Organisation `BUSINESS` active avec abonnement actif: Administration [Entreprise], Activites [Entreprise], calendrier, workflows et appels collaboratifs sont disponibles selon membership/RBAC.
- Organisation `ENTERPRISE` active avec abonnement actif: modules sectoriels sante inclus et donnees `EnterpriseSectorRecord` visibles uniquement pour les modules actives.
- Organisation suspendue: modules prives bloques avec message de regularisation, Support accessible.
- Activation d'un module hors plan depuis Administration [Entreprise]: refus serveur 402/403 avec message lisible, meme si le bouton est force manuellement.
- Page `/billing` client: affichage en lecture seule du plan organisation, statut, limites, modules et enregistrements de facturation, sans action de modification autonome.
- Routes `/api/calendar/*`, `/api/collaborators/groups/*/calls`, `/api/enterprise/*` et `/api/admin/client-organizations/*`: verifier qu'un changement manuel d'URL ne contourne ni plan, ni abonnement, ni membership.

## 6. Administration [Entreprise]

- Page visible uniquement en contexte `ORGANIZATION` et avec permission d'administration.
- Les membres actifs, modules, departements, postes, workflows, calendrier et parametres sont filtres par `organizationId`.
- Les formulaires longs restent en modale/panneau responsive.
- Les routes mutantes refusent une origine externe.
- Les routes mutantes appliquent rate limiting et validation Zod.
- Le secteur Sante charge patients, rendez-vous, consultations, laboratoire, pharmacie, facturation, assurance, confidentialite et rapports uniquement pour `HEALTH_CARE`.

## 7. Activites [Entreprise]

- Page visible uniquement pour membership actif.
- Demandes recentes filtrees selon role entreprise et `organizationId`.
- Workflows partages et blocs d'activites filtres par `organizationId`.
- Creation/modification d'une demande: persistance, notification non bloquante, affichage apres rechargement.
- Changement d'organisation: aucun objet de l'ancien contexte ne reste visible.
- UX mobile: liste, recherche/pagination, detail et formulaire plein ecran restent dans la largeur de l'ecran.

## 8. Support

- Creation ticket client: persiste, visible immediatement, visible apres reconnexion.
- Historique client: tous les tickets du createur restent visibles, meme apres changement de contexte.
- Client A ne voit jamais les tickets de B.
- Support DTSC voit les tickets autorises selon role `ADMIN` ou `SUPPORT` + contexte `DTSC_INTERNAL`.
- `PATCH /api/support/tickets/[id]` refuse origine externe, utilisateur non Support DTSC et payload invalide.
- `POST /api/support/tickets/[id]/messages` refuse origine externe, utilisateur non autorise et payload invalide.
- Les notifications Support ne font pas echouer une creation ou une reponse deja persistee.
- La discussion d'un ticket reste bornée et scrollable; seuls les messages récents sont chargés initialement.
- `Charger les précédents` ajoute les anciens messages sans remplacer les messages récents.
- Depuis `...`, répondre, modifier et supprimer logiquement un message; vérifier les refus pour un utilisateur non propriétaire.
- Cliquer sur l'aperçu d'un message répondu charge progressivement les anciens messages si nécessaire, puis centre et met en évidence le message source.

## 8.1 Commentaires opérationnels

- Dans chaque fil basé sur `CooComment`, répondre à un commentaire et vérifier la persistance après rechargement.
- Cliquer sur l'aperçu de réponse et vérifier le retour vers le commentaire source, y compris quand il faut charger des commentaires précédents.
- Vérifier le CRUD dans `...`: auteur autorisé sur son commentaire, `ADMIN` autorisé, autre utilisateur refusé côté API.
- Vérifier qu'une suppression masque le contenu sans supprimer les réponses associées.
- Dans les annonces et publications publiques, cliquer sur l'aperçu d'une réponse et vérifier le centrage et la mise en évidence du commentaire source.

## 8.2 Menus d'actions

- Ouvrir les menus `...` dans une carte, un fil scrollable, une modale et près du bas de l'écran.
- Vérifier que le menu reste au premier plan, n'est pas coupé par `overflow-hidden` et se ferme au scroll, au redimensionnement, au clic extérieur et avec `Escape`.

## 9. Mes collaborateurs, groupes et messages

- Liste de groupes limitee aux groupes actifs ou l'utilisateur est membre, dans le scope de session autorise.
- Invitations visibles uniquement pour le destinataire ou email correspondant.
- Messages: lecture/ecriture reservee aux membres actifs.
- Mentions: notification uniquement des utilisateurs autorises a voir le groupe.
- Partage chatbot: snapshot persistant limite aux membres du groupe, sans exposer la conversation privee originale.
- Menus `...` et details de groupe restent utilisables sur mobile.

## 10. Appels audio/video

- Demarrage appel: session, origine, rate limit et membership verifies.
- Rejoindre appel: token genere cote serveur uniquement apres verification membership.
- Quitter: seul le participant courant passe a `LEFT`, l'appel continue.
- Terminer: reserve au lanceur ou gestionnaire autorise, `endedAt` et `durationSeconds` persistés.
- Notifications flottantes: visibles seulement aux membres du groupe, avec actions Rejoindre, Voir le groupe, Ignorer.
- Polling global: intervalle leger documente, pas de boucle agressive.
- UI: aucun libelle technique `LiveKit`, `room`, `token`, `provider` ou erreur brute visible.
- Micro/camera: boutons pilotent les pistes reelles et synchronisent `microphoneEnabled` / `cameraEnabled`.
- Mobile: controles accessibles, plein ecran utilisable, chat d'appel scrollable.

## 11. Notifications

- Les preferences utilisateur sont respectees: Support, usage, diffusions, push, sons d'appel, alertes flottantes.
- Les notifications PWA utilisent service worker quand disponible et ne cassent pas le rendu.
- Les filtres de notifications utilisent `type`, `targetUrl` ou une regle ciblee.
- Les notifications ne melangent pas les contextes organisationnels.

## 12. Calendrier interne

- Page et API proteges par session et `canAccessInternalCalendar`.
- Evenements filtres par organisation active.
- Disponibilites filtrees par collaborateur autorise et organisation.
- Un utilisateur `CLIENT` ne voit pas le calendrier interne si les regles de role l'interdisent.
- Support DTSC voit les disponibilites des collaborateurs du tenant DTSC selon les regles prevues.
- Formulaires de disponibilite et evenement restent responsive mobile.

## 13. UX mobile

- Dashboard: cartes sans depassement horizontal.
- Support: formulaire et ticket board lisibles, cartes bornees.
- Enterprise Admin: tableaux scrollables, dialogues hauts, actions dans menus.
- Enterprise Activities: panels en liste/detail, formulaire plein ecran.
- Collaborateurs: liste de groupes accessible, conversation plein ecran, composer visible.
- Appels: controles tactiles, plein ecran portrait/paysage, chat d'appel borne.
- Calendrier: listes et formulaires sans debordement.

## 14. Sortie de validation

Documenter dans le ticket ou la PR:

- commandes executees et resultats;
- comptes de test utilises;
- domaines/sous-domaines testes;
- captures mobiles si une regression visuelle etait suspectee;
- migrations appliquees ou confirmation d'absence de migration;
- risques restants et limites du polling temporaire.
# Itération PHARMACY Produits & médicaments - 9 juin 2026

- [ ] Vérifier que le catalogue Produits & médicaments liste uniquement les produits de l'organisation PHARMACY active.
- [ ] Vérifier recherche, filtres catégorie/forme/statut/règle, tri et pagination sur desktop et mobile.
- [ ] Créer puis modifier un produit avec les sections identification, classification, dispensation, stock, conservation, prix et statut.
- [ ] Vérifier le refus d'un code interne ou code-barres déjà utilisé dans la même organisation.
- [ ] Vérifier les contrôles stock minimal/maximal, températures, prix et taux de remise.
- [ ] Archiver puis réactiver un produit et vérifier qu'aucune suppression physique n'a lieu.
- [ ] Vérifier qu'un produit du catalogue est sélectionnable dans lots, ventes, réceptions et Activités Pharmacie.
- [ ] Vérifier qu'un membre non autorisé ne peut pas créer, modifier ou archiver un produit via l'API.
- [ ] Exécuter `pnpm qa:regression` ou `node scripts/qa-regression-checks.mjs`.
