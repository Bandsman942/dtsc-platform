# Changelog DTSC Platform

Ce document suit en français professionnel les améliorations apportées à DTSC Platform. Chaque entrée doit préciser ce qui a été ajouté, modifié, corrigé, supprimé ou amélioré afin de conserver une lecture claire de l'évolution du produit.

## 2026-06-05

### Ajouté

- Ajout de `docs/QA_REGRESSION_CHECKLIST.md`, checklist QA globale couvrant sous-domaines, auth, Console DTSC, Support, modules Entreprise, groupes, appels, notifications, calendrier, UX mobile et accès interdits entre organisations.
- Ajout de `pnpm qa:regression` via `scripts/qa-regression-checks.mjs`, suite source-level sans dépendance externe pour vérifier les garde-fous critiques multi-tenant avant build Vercel.

### Amélioré

- `AGENTS.md` impose maintenant la vérification de `pnpm qa:regression` avant commit/push et le maintien de `docs/QA_REGRESSION_CHECKLIST.md` avant push quand les parcours ou règles QA changent.
- Stabilisation des appels audio/vidéo dans `Mes collaborateurs`: durée d'appel visible à partir de `startedAt`, reprise correcte dans un appel actif, messages humains côté interface et distinction claire entre `Quitter` et `Terminer`.
- La notification flottante globale des appels ouvre désormais directement le groupe et l'appel concernés via `/collaborators?groupId=...&joinCall=...`, avec respect des préférences utilisateur d'alertes, de sons et d'affichage.
- Les boutons micro/caméra pilotent maintenant les pistes média réelles et synchronisent l'état participant côté serveur afin d'alimenter les événements `PARTICIPANT_MUTED` et `PARTICIPANT_UNMUTED`.
- Documentation README et technique complétée avec le flux de validation QA globale, les profils de test et les limites de la suite source-level.

### Sécurisé

- Durcissement complémentaire des routes Support `PATCH /api/support/tickets/[id]` et `POST /api/support/tickets/[id]/messages`: contrôle d'origine, rate limiting, validation JSON robuste, journalisation API et notifications non bloquantes.
- Ajout de routes protégées pour les événements d'appel et l'état média participant: contrôle d'origine, session, membership de groupe, validation Zod, rate limiting, audit de groupe et journalisation API.
- Les réponses de liste d'appels ne renvoient plus les détails techniques internes de salle ou de fournisseur; les messages visibles restent orientés utilisateur.
- La notification de démarrage d'appel est non bloquante afin qu'un effet secondaire de notification ne transforme pas un appel déjà créé en erreur utilisateur.

## 2026-06-04

### Modifié

- Refactorisation de `Activités [Entreprise]`: les loaders serveur sont extraits dans `lib/enterprise/*`, la page `/enterprise-activities` redevient un orchestrateur auth/contexte/membership/dataset/rendu, et les types sérialisables sont centralisés dans `lib/enterprise/enterprise-activities-types.ts`.
- Découpage de l'interface Activités [Entreprise] en panels maintenables: dashboard, blocs d'activités, demandes, workflows, repères santé et dialogue de création responsive.
- Préservation du secteur Santé dans Activités [Entreprise]: les données patients, rendez-vous, consultations, laboratoire, pharmacie, facturation, assurance, confidentialité et rapports ne sont chargées que pour les organisations `HEALTH_CARE`.
- Durcissement de `POST /api/enterprise/[organizationId]/activities` avec contrôle d'origine, rate limiting, validation du destinataire actif de l'entreprise et notifications non bloquantes après persistance.
- Les notifications des créations, modifications et incidents critiques Santé sont non bloquantes afin qu'un effet secondaire de notification ne fasse pas échouer une écriture déjà validée.
- Correction du build Vercel après le refactor Administration [Entreprise]: le loader `getEnterpriseAdministrationDataset()` sérialise maintenant explicitement ses données Prisma en `EnterpriseAdminDataset` JSON afin d'éviter l'incompatibilité TypeScript entre `Date` Prisma et chaînes côté client.
- Refactorisation de `Administration [Entreprise]`: les loaders serveur sont extraits dans `lib/enterprise/*`, la page `/enterprise-admin` redevient un orchestrateur auth/contexte/rendu, et les types sérialisables sont partagés dans `lib/enterprise/enterprise-admin-types.ts`.
- Découpage de l'interface Administration [Entreprise] en panels maintenables: dashboard, membres, modules, départements, postes, workflows, calendrier, paramètres et section santé dédiée.
- Optimisation du chargement Santé: les enregistrements `EnterpriseSectorRecord` ne sont chargés par la page Administration que pour les organisations `HEALTH_CARE`, sans modifier les sous-modules patients, rendez-vous, consultations, laboratoire, pharmacie, facturation, assurance, confidentialité ni rapports.
- Durcissement des routes mutantes Administration [Entreprise], modules, membres et santé avec contrôle d'origine et rate limiting, en conservant les validations `organizationId`, membership actif, rôle entreprise et module activé.
- Navigation produit DTSC encapsulée dans un bouton menu avec liste verticale scrollable: Site public, SaaS, Console DTSC, Support et Compte ne prennent plus d'espace permanent dans la barre latérale desktop.
- Le tableau Administration des utilisateurs garde un scroll horizontal et propose des colonnes redimensionnables manuellement, y compris au clavier, pour lire les emails, rôles, statuts et limites sans repli vertical illisible.
- Correction de la visibilité des groupes `Mes collaborateurs` hors contexte organisation: les groupes globaux standards dont l'utilisateur est membre ne sont plus masqués par le filtre réservé aux groupes transversaux.
- La création de groupe collaboratif applique désormais un rate limiting, un contrôle d'origine et une notification non bloquante afin qu'une erreur de notification ne fasse pas échouer la réponse après persistance.

## 2026-06-02

### Modifié

- Correction de la création des tickets Support: la route `POST /api/support/tickets` valide désormais l'origine, applique un rate limiting, ignore les contextes organisation obsolètes au lieu de bloquer la persistance et ne fait plus échouer la réponse de création si la notification DTSC rencontre une erreur.
- Le formulaire Support conserve la référence du formulaire avant l'appel réseau et gère les erreurs `fetch` afin d'éviter un état d'envoi bloqué après soumission.
- Refactorisation de la Console DTSC: les chargements de données de `/admin` sont extraits dans `lib/console/*` par domaine fonctionnel afin de garder la page App Router comme orchestrateur d'authentification, de section active et de rendu.
- Les règles Support corrigées sont conservées pendant le refactor: l'historique utilisateur reste basé sur `SupportTicket.userId`, tandis que `organizationId` demeure un contexte de triage et d'analyse.
- Correction responsive mobile des cartes et formulaires récents: Console DTSC, journaux d'audit, KPI, support, calendrier interne, dialogues et champs partagés restent désormais bornés à la largeur de l'écran avec retour à la ligne des libellés longs.
- Transformation progressive de `/admin` en Console DTSC SaaS avec vue générale de pilotage: entreprises clientes actives, abonnements, tickets ouverts/critiques, utilisateurs actifs, modules activés, incidents API, audits sensibles et événements sécurité récents.
- Extension du `Calendrier interne`: CRUD complet des disponibilités collaborateurs, plages sur date précise ou fréquence quotidienne/hebdomadaire/mensuelle, suppression logique auditée et visibilité des disponibilités DTSC ouverte au rôle `SUPPORT`.
- Correction de la visibilité du module `Mes collaborateurs` en contexte entreprise cliente: le lien reste affiché dans tous les contextes authentifiés et la lecture des groupes repose sur le membership actif et le contexte autorisé, plus sur l'abonnement actif de l'organisation.
- Réorganisation des libellés de sections Console autour de Vue générale, Entreprises clientes, Abonnements & facturation, Support client, Publications & contenus, Utilisateurs & accès, Sécurité & audit, Modules internes DTSC et Paramètres plateforme.
- Correction du module Support: l'historique des tickets d'un utilisateur est à nouveau visible indépendamment du contexte actif, tout en conservant `organizationId` comme contexte de triage et l'isolation stricte par `userId`.
- La création d'un ticket support déclenche désormais un rafraîchissement serveur de la liste afin que le ticket apparaisse immédiatement après persistance.
- Correction du build Vercel sur la navigation privée: les items `NavLinks` sont typés explicitement pour éviter qu'un chemin actif soit inféré en `unknown` pendant le contrôle TypeScript.
- Stabilisation de la couche multi-sous-domaines: redirections post-login centralisées, `next` interne validé, déconnexion ramenée vers Account et navigation inter-produits Console DTSC, SaaS, Support, Compte et Site public.
- La Console DTSC protège strictement `/admin` pour les sessions `DTSC_INTERNAL`, tout en redirigeant les chemins SaaS et Support vers leurs sous-domaines dédiés afin de conserver une navigation SSO fluide.
- Les liens critiques du shell, de la navigation desktop/mobile, du dashboard, du support, de l'administration et des pages Account utilisent les helpers de `lib/domains.ts` quand ils traversent un produit.
- Ajout de `docs/SUBDOMAIN_QA_CHECKLIST.md` et enrichissement de la documentation Vercel pour les domaines, variables d'environnement, ordre de test et rollback sans extraction monorepo.
- Harmonisation des contenus publics DTSC autour des 7 leviers numériques officiels: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.
- Les pages Accueil, Services, Solutions, Secteurs, Projets, À propos, Contact, Ressources et les metadata SEO présentent désormais les solutions, secteurs et démonstrations comme des exemples ou cas d'application des 7 leviers, sans créer de liste concurrente de services.
- Alignement de l'index de recherche publique, du contexte de l'assistant IA public, du prompt DTSC et des textes newsletter pour rattacher chatbot, dashboards, ERP, CRM, portails clients, assistant documentaire, reporting et workflows numériques aux leviers correspondants.
- Mise à jour de la page `/offline`, du fallback `public/offline.html` et du cache service worker pour conserver les 7 leviers DTSC hors connexion.

## 2026-05-30

### Ajouté

- Préparation de DTSC Platform à une séparation logique par sous-domaines dans le même projet Vercel: site public, espace SaaS, console DTSC, compte/authentification et support.
- Ajout de `lib/domains.ts` pour centraliser les URLs produit, détecter le type de host courant, construire les liens cross-subdomain et éviter les liens critiques hardcodés.
- Ajout de la documentation `docs/ROUTING_AND_SUBDOMAINS.md` avec matrice de routage, variables d'environnement, fonctionnement du cookie partagé, limites connues et trajectoire future vers monorepo.

### Modifié

- Renommage du package npm en `dtsc-platform`.
- Le middleware détecte les hosts publics, app, console, account et support, puis applique des redirections légères sans déplacer les routes App Router existantes.
- Les liens critiques de connexion, inscription, déconnexion, navigation publique et branding produit utilisent progressivement les helpers de domaines.
- Le shell privé affiche le contexte produit actif avec un branding discret sur desktop et mobile.

### Sécurisé

- Le cookie `dtsc_session` peut recevoir `AUTH_COOKIE_DOMAIN` en production pour être partagé entre sous-domaines officiels tout en conservant `httpOnly`, `sameSite=lax`, `secure` et le format de session existant.
- La console `console.dtsc-platform.com` reste réservée aux sessions `DTSC_INTERNAL`; un client ou membre d'entreprise non autorisé est redirigé vers l'espace SaaS.
- Les routes `/api/*`, assets, service worker, pages offline et fichiers publics sont exclus du routage par host afin de ne pas casser les API, la PWA ni les intégrations existantes.

### Documentation

- Mise à jour de `README.md`, `docs/TECHNICAL_DOCUMENTATION.md`, `docs/CHANGELOG.md`, `env.example`, de la politique de confidentialité et de la politique des cookies pour expliquer la préparation multi-sous-domaines et le cookie de session optionnel partagé.

## 2026-05-29

### Corrigé

- Le module `Calendrier interne` est à nouveau disponible en contexte entreprise cliente: la page, les routes `/api/calendar*`, les disponibilités et les événements utilisent maintenant le `organizationId` actif au lieu de rester réservés au seul tenant DTSC.
- `Administration [Entreprise]` affiche une vue `Calendrier interne` avec les événements planifiés de l'organisation et un accès direct au calendrier, sans exposer les événements d'une autre entreprise.
- Les groupes `Mes collaborateurs` proposent explicitement les types transversaux `CROSS_ORGANIZATION` et `PRIVATE_NETWORK`, avec invitation et acceptation obligatoires pour les utilisateurs recherchés sur toute la plateforme.
- Correction du build Vercel des checkboxes de participants `Activités DTSC`: le rendu n'accède plus à un champ `email` absent du type `CollaboratorOption`.
- Les sélecteurs multi-collaborateurs des réunions, workflows COO, formulaires Activités DTSC et workflows entreprise utilisent désormais des listes à cases à cocher au lieu de demander Ctrl/Cmd + clic.
- Les blocs `Activités DTSC` qui disposent d'une action de création affichent leur bouton dès l'ouverture du bloc, même si aucune donnée n'existe encore.
- Le sélecteur d'espace actif reste visible et utilisable sur mobile grâce à une largeur minimale, un style contrasté et un comportement horizontal stable.
- Dans `Administration > MPO > Portefeuille de projets`, `Documents associés` devient une zone d'import fichier privée avec contrainte de taille, aperçu et téléchargement du fichier déjà stocké; les champs médicaux n'apparaissent qu'après activation explicite du projet médical.
- Les champs `Catégorie` des registres MPO/CTO et des référentiels SCO principaux passent en combobox contrôlées afin de réduire les saisies libres non structurées.
- Les dialogues de formulaires hauts utilisent désormais un vrai comportement plein écran desktop/mobile: en-tête de fermeture toujours visible, hauteur utile du viewport, fermeture par bouton, Échap ou clic sur le fond, afin d'éviter les formulaires enfermés dans une zone scrollable trop courte.
- Standardisation complémentaire des formulaires `Profil et activités entreprise`, `Disponibilité`, `Informations du compte`, `Modifier le profil`, sections de paramètres privées et sous-formulaires `Administration [Entreprise]`: les saisies longues passent par des dialogues hauts `92dvh` avec étiquettes/aides visibles quand le formulaire était encore inline.
- Les formulaires ciblés des modules Entreprise, Support, Paramètres, Activités DTSC, Administration DTSC et Activités [Entreprise] s'ouvrent désormais dans des dialogues hauts responsive avec scroll interne, au lieu de rester prisonniers de cartes ou de blocs trop courts.
- Ajout d'étiquettes et d'aides contextuelles sur les champs des formulaires ciblés: activités professionnelles, création de ticket support, identité professionnelle, création de compte utilisateur, création/modification d'entreprise cliente, gestion d'abonnement, demandes/blocages/rapports DTSC et demandes d'activités entreprise.
- Affinage du secteur `HEALTH_CARE`: formulaires santé restructurés sans répétition inutile, combobox alimentées par patients/rendez-vous/consultations/collaborateurs/départements/postes de l'organisation, et validation backend des références par `organizationId`.
- Réorganisation de `Administration [Entreprise]`: modules filtrés par socle commun et template santé, retrait du bloc technique `Blocs Activités entreprise`, séparation collaborateurs/invitations/postes/permissions/départements/workflows/paramètres.
- Les invitations collaborateurs entreprise ne créent plus un membre actif immédiatement: elles restent en statut `INVITED`, évitent les doublons et notifient l'utilisateur existant.
- `Activités [Entreprise]` utilise des formulaires santé spécifiques avec destinataire obligatoire et métadonnées persistées, et affiche les workflows partagés.
- Correction du build Vercel sur les workflows entreprise: les étapes optionnelles sont normalisées avant découpage pour satisfaire TypeScript strict.

### Sécurisé

- Ajout de `organizationId` sur `InternalCalendarEvent` et `CollaboratorAvailability`, avec migration de backfill vers l'organisation interne DTSC et index dédiés au filtrage par entreprise.
- Les participants et propriétaires du calendrier sont validés côté backend contre les membres actifs de l'organisation active; un membre d'une entreprise ne peut plus cibler un collaborateur DTSC ou une autre entreprise via le calendrier.
- Renforcement de l'isolation en contexte entreprise: `Dashboard`, `Chatbot`, `Entreprise`, `Documents`, `Paramètres`, `Notifications`, `Support` et `Mes collaborateurs` restent visibles, mais leurs données historiques sont maintenant filtrées par `organizationId` quand l'utilisateur travaille dans une entreprise.
- Les badges et alertes de notifications du shell sont filtrés par contexte actif afin de ne pas mélanger les notifications globales, DTSC internes et entreprise.
- Les routes santé refusent désormais les références patient, rendez-vous, consultation, département ou poste qui ne sont pas dans la même entreprise.
- Les paramètres généraux et santé sont persistés sur `Organization.settingsJson` / `brandingJson` avec audit, au lieu de rester des champs décoratifs côté interface.
- Les sous-modules santé désactivés sont vérifiés avec leur code réel côté API afin d'empêcher l'accès backend à un sous-module masqué.

### Ajouté

- Ajout de la première itération sectorielle concrète pour `HEALTH_CARE`: sous-modules Patients, Rendez-vous et Incidents qualité dans `Administration [Entreprise]`, avec listes recherchables, pagination, détail, formulaire plein écran mobile, modification et archivage via menu `...`.
- Ajout du modèle `EnterpriseSectorRecord` et de la migration `20260528100000_enterprise_sector_records` pour stocker des données métier sectorielles isolées par `organizationId`, `sectorCode`, `moduleCode` et `recordType`.
- Ajout des routes sécurisées `GET/POST /api/enterprise/[organizationId]/healthcare` et `PATCH/DELETE /api/enterprise/[organizationId]/healthcare/[recordId]`, avec validation Zod, rate limiting, contrôle du module activé, notifications ciblées et audit logs.
- Extension de l'itération `HEALTH_CARE` avec dashboard santé, consultations, dossiers médicaux, équipe médicale, laboratoire, pharmacie interne, facturation médicale, assurances/prises en charge, documents médicaux, confidentialité, paramètres et rapports santé.
- Ajout d'actions métier persistées pour les sous-modules santé: confirmation/annulation de rendez-vous, conversion en consultation, clôture/réouverture, validation labo, gestion de prises en charge, mouvements de stock et résolution d'incident.
- Ajout de la migration `20260528133000_healthcare_sector_iteration` pour enrichir le template santé, les organisations santé existantes et les blocs Activités santé avec documents médicaux, paramètres, rapports, laboratoire, pharmacie et documents patient.
- Ajout de la migration `20260529113000_enterprise_department_responsible` pour persister le responsable d'un département entreprise.
- Ajout de la migration `20260529170000_contextualize_client_modules` pour contextualiser les documents RAG, chunks, profils entreprise, activités entreprise, conversations, projets de conversation, messages, usages chat et notifications par `organizationId`.
- Ajout d'une documentation dédiée `docs/sectors/health-care.md` pour les sous-modules, workflows, permissions, stockage et limites de l'itération santé.
- Extension de `Mes collaborateurs`: la recherche d'invitation peut proposer les utilisateurs actifs de toute l'application afin de créer des groupes transversaux, tout en conservant l'acceptation obligatoire et le contrôle d'appartenance au groupe.

### Sécurisé

- Les données santé ne sont servies qu'aux membres actifs pouvant gérer l'administration de l'entreprise active et uniquement si l'organisation est une entreprise cliente active de secteur `HEALTH_CARE`.
- Les sous-modules santé avancés continuent d'utiliser `organizationId`, `sectorCode = HEALTH_CARE`, les permissions de module entreprise, le rate limiting et les audit logs; les incidents critiques notifient les responsables entreprise actifs.

## 2026-05-27

### Ajouté

- Ajout de la couche SaaS sectorielle: référentiel `BusinessSector`, templates sectoriels, modules/postes/départements/blocs d'activités/workflows générés par entreprise et demandes `EnterpriseActivityRequest` isolées par `organizationId`.
- Ajout de la migration `20260527143000_enterprise_sector_templates` avec seed idempotent des secteurs et du socle commun entreprise.
- Ajout des routes `/api/admin/business-sectors`, `/api/admin/sector-templates`, `/api/enterprise/[organizationId]/administration`, `/api/enterprise/[organizationId]/modules/[moduleId]` et `/api/enterprise/[organizationId]/activities`.
- Ajout des pages dynamiques privées `/enterprise-admin` et `/enterprise-activities` pour afficher `Administration [Entreprise]` et `Activités [Entreprise]` selon le contexte actif et le membership.
- Ajout de la documentation `docs/enterprise-sector-modules.md`.

### Amélioré

- Le bloc Administration `Entreprises clientes` utilise désormais une combobox de secteurs alimentée par la base, affiche l'aperçu du modèle sectoriel et peut appliquer le template à la création ou depuis le menu `...`.

### Corrigé

- Correction du build Vercel des modules SaaS sectoriels: les variables locales nommées `module` ont été renommées pour respecter `@next/next/no-assign-module-variable`, et le texte JSX des activités entreprise échappe correctement les apostrophes.

### Modifié

- Le menu `...` des entreprises clientes permet désormais de modifier les informations générales, gérer l'abonnement, archiver ou supprimer logiquement une entreprise avec audit et conservation des données internes.
- `Administration [Entreprise]` permet à un admin/manager entreprise d'ajouter un collaborateur existant à son organisation sans dépendre de DTSC, avec notification ciblée et contrôle backend du membership.

### Sécurisé

- Renforcement de l'isolation SaaS hybride: le contexte interne DTSC exige désormais un membership actif sur l'organisation `DTSC` (`dtsc-internal`) au lieu de se baser uniquement sur le rôle global.
- Blocage des modules internes historiques `/admin`, `/activities`, `/calendar` et de leurs routes API pour toute session qui n'est pas explicitement dans le tenant DTSC interne.
- Filtrage contextuel des modules partagés: annonces par `scope`/`organizationId`, groupes par `organizationId`/membership et tickets support par contexte actif.

### Ajouté

- Migration `20260527120000_strengthen_tenant_isolation` qui normalise l'entreprise interne `DTSC`, rattache les collaborateurs DTSC liés à un dossier RH actif et reclasse les groupes collaboratifs historiques dans le tenant DTSC.
- Conservation du contexte actif lors du heartbeat de session afin d'éviter qu'une session entreprise revienne silencieusement à un contexte global.

## 2026-05-22

### Corrigé

- Masquage complet du module `Calendrier interne` pour les utilisateurs `CLIENT`: navigation desktop/mobile, page `/calendar`, middleware et routes `/api/calendar*` bloquent désormais cet accès.
- Correction étendue du clipping des formulaires longs: les dialogues partagés utilisent désormais davantage de hauteur utile avec scroll interne, les accordéons/cartes Administration, Activités, Annonces et Support évitent de couper les extrémités des formulaires sur desktop/mobile.
- Correction de l'éditeur riche des annonces et publications publiques: la saisie sur brouillon local ne réapplique plus le HTML à chaque frappe, le curseur reste à l'endroit modifié et la suppression immédiate d'image fonctionne avant l'enregistrement.

### Ajouté

- Fondation SaaS hybride multi-entreprises: extension `Organization`, memberships actifs, grants `ADMIN_ENTREPRISE`, abonnements/facturation organisationnels et champs `organizationId` progressifs sur support, annonces et groupes.
- Création de l'organisation interne stable `dtsc-internal` via migration `20260522153000_hybrid_multi_tenant`.
- Connexion avec entreprise optionnelle: l'API `POST /api/auth/organizations` ne retourne que les entreprises où l'email saisi est membre actif, et `POST /api/auth/sign-in` refuse l'accès aux espaces internes clients sans membership actif.
- Sélecteur d'espace connecté après connexion via `POST /api/account/context`, avec contexte actif stocké en session.
- Bloc Administration `Entreprises clientes` pour créer/suspendre/archiver les organisations clientes, désigner ou retirer un administrateur entreprise et lier un plan, sans accès DTSC aux données métier privées.

## 2026-05-21

### Ajouté

- Ajout du module privé `Calendrier interne` avec page `/calendar`, navigation privée, vues mobiles premium, événements, disponibilités, participants et conflits.
- Ajout des modèles Prisma `CollaboratorAvailability`, `InternalCalendarEvent`, `InternalCalendarEventParticipant` et `InternalCalendarConflict` avec migration `20260521193000_internal_calendar`.
- Ajout des routes sécurisées `GET/POST /api/calendar`, `GET/POST /api/calendar/availabilities` et `GET/PATCH/DELETE /api/calendar/events/[id]`.
- Ajout d'une synchronisation COO vers le calendrier interne pour les tâches datées et réunions datées créées depuis l'Administration COO.
- Ajout d'une route sécurisée `POST /api/announcements/images` pour téléverser les images d'annonces via Supabase Storage, avec validation type/taille, rate limiting, audit log et URL publique contrôlée.
- Ajout de pièces jointes persistées sur les demandes collaboratives (`CollaboratorRequest.attachments`) avec migration `20260521152000_collaborator_request_attachments`.
- Ajout de réactions persistées `Like`/`Dislike` sur les réponses assistant du chatbot privé, avec migration `20260521113000_message_feedback` et route sécurisée `PATCH /api/conversations/messages/[id]/feedback`.
- Ajout d'un historique d'activité compact dans le Profil à partir des notifications, conversations, tickets support et messages de groupe réels de l'utilisateur.
- Ajout de filtres avancés dans les notifications: toutes, non lues, mentions, appels, groupes, administration, workflows, juridique, RH, système et critiques.
- Ajout d'une navigation flottante mobile pour les sections Administration autorisées.
- Ajout d'un badge monochrome DTSC dédié aux notifications PWA Android afin que l'icône système reste professionnelle et lisible.

### Corrigé

- Correction de la régression de plein écran des appels vidéo: suppression de l'observateur de mutations récursif sur le DOM LiveKit, focus plein écran appliqué de façon bornée avec fallback et conteneur plein écran ciblé par référence stable.
- Correction du polling global des événements d'appel afin qu'une réponse `401` désactive proprement le polling côté client sans bruit console répété.
- Correction du build Vercel du calendrier interne: les validateurs Zod create/update utilisent désormais un schéma de base non raffiné avant d'appliquer les règles de dates, afin d'éviter l'erreur `.partial() cannot be used on object schemas containing refinements`.
- Correction de la visibilité du calendrier interne: les événements privés et participants ne sont plus exposés largement aux collaborateurs non concernés.
- Correction de l'expérience plein écran des appels vidéo mobile: les contrôles restent au premier plan, disparaissent automatiquement après quelques secondes et réapparaissent au toucher.
- Correction du focus plein écran des appels vidéo: la sélection d'un participant ne peut plus masquer toute la scène si la tuile LiveKit n'est pas encore identifiable; l'affichage retombe sur la grille normale au lieu d'un écran vide.
- Correction du plein écran mobile des appels vidéo afin que la scène occupe réellement tout le viewport PWA, sans être réduite par la liste des participants ou les contrôles secondaires.
- Correction de l'enregistrement des préférences utilisateur sur mobile/PWA: les notifications navigateur sont désormais déclenchées via le service worker quand disponible et toutes les erreurs de permission/API mobile sont capturées sans casser l'application.
- Correction du bloc Abonnement afin que les surfaces de paiement et cartes de plans restent lisibles en mode clair comme en mode sombre.
- Correction des filtres de notifications pour qu'ils s'appuient sur les vrais `type`/`targetUrl` au lieu d'une recherche texte trop large qui mélangeait les catégories.
- Correction du positionnement des menus `...` des annonces et commentaires liés: actions en haut à droite avec icône verticale et menu glass aligné.

### Amélioré

- Le calendrier interne affiche ses indicateurs en accordéon, ouvre les détails événement en plein écran mobile et regroupe les sous-sections de détail en accordéons.
- Les événements calendrier disposent maintenant d'actions `...` pour modifier ou annuler un événement, avec formulaire responsive en modale haute.
- Les conflits calendrier affichent le collaborateur concerné et la raison métier lisible depuis son emploi du temps.
- Les événements de type tâche, réunion, blocage, mission ou appel planifié créent une source métier reliée dans COO, SCO ou Mes collaborateurs selon le type.
- Les cartes d'annonces sont recentrées avec marges symétriques et menu d'actions horizontal en haut à droite.
- Les formulaires des blocs Administration s'ouvrent dans des boîtes de dialogue hautes et scrollables pour éviter qu'ils restent compressés dans l'arrière-plan des accordéons.
- Les champs `Input` partagés récupèrent automatiquement un libellé accessible et une info contextuelle depuis leur placeholder lorsqu'aucun label explicite n'est fourni.
- Le calendrier interne détecte les chevauchements, absences, congés, missions, indisponibilités et créneaux hors horaires disponibles avant création ou modification d'événement.
- Les messages sortants des groupes `Mes collaborateurs` affichent un accusé compact: une coche quand le message est envoyé et deux coches vertes lorsque tous les autres membres actifs ont confirmé la lecture.
- Sur mobile/PWA, le sélecteur de vue plein écran d'appel disparaît automatiquement après le choix d'un participant ou du partage d'écran, puis réapparaît au toucher de la scène.
- Le plein écran des appels vidéo gagne un sélecteur premium permettant de focaliser la vue automatique, un partage d'écran ou un participant précis sur desktop/mobile, avec un fond de scène uniformisé autour des tuiles arrondies.
- Le chat pendant appel devient une boîte flottante autonome, déplaçable, redimensionnable et dotée d'un scroll vertical interne borné avec saisie fixe.
- Les appels vidéo sont mieux adaptés mobile/desktop: tuiles plus arrondies et visibles sur mobile, avatars fournisseur réduits/remplacés par la photo de profil quand disponible, bouton plein écran renommé en `Réduire l'écran` une fois actif et PWA autorisée en portrait/paysage.
- L'éditeur des annonces internes supporte désormais l'ajout de plusieurs images par sélection ou glisser-déposer, l'optimisation client et un aperçu mobile/desktop avant publication.
- Les demandes collaboratives acceptent des fichiers joints depuis l'appareil; le demandeur et le destinataire peuvent les prévisualiser ou télécharger via route privée.
- L'expérience d'appel de groupe masque les contrôles LiveKit bruts, ajoute des contrôles DTSC pour le partage d'écran et le plein écran, et conserve explicitement l'appel actif pendant l'ouverture du chat.
- Les nouveaux libellés visibles des annonces et appels sont raccordés aux dictionnaires FR/EN afin de suivre la langue choisie dans les paramètres.
- La route `/offline` et le fallback statique `public/offline.html` reprennent le design mobile/PWA premium actuel avec surfaces glass, logo DTSC et safe-area mobile.
- Harmonisation du rendu clair/sombre des accordéons, listes premium et menu flottant Administration avec des surfaces glass basées sur les variables DTSC.
- Les blocs de données des sections Administration sont désormais affichés comme accordéons premium, avec cartes de liste cohérentes et lisibles en mode sombre.
- Accordéons premium appliqués aux zones Dashboard, Entreprise, Abonnement et Profil pour réduire le scroll mobile/PWA.
- Module Abonnement rendu plus premium avec cartes glass, badges de plan actif et états de paiement connectés aux données backend existantes.
- Commentaires des annonces internes et publications publiques repliés par défaut, avec ouverture volontaire, pagination et scroll interne.
- Formulaire de création d'annonce et formulaire de ticket support repliés pour libérer l'espace mobile.
- Discussions de tickets support contenues dans un fil scrollable avec saisie accessible.
- Dropdowns Radix stylés en combobox premium partagée.

## 2026-05-20

### Corrigé

- Correction d'une régression de rendu global causée par l'import direct des styles LiveKit dans `app/globals.css`; les styles d'appel sont maintenant scoped via `.dtsc-livekit-room` afin de préserver le design premium global.
- Amélioration de l'UX des appels audio/vidéo: suppression des libellés techniques visibles, messages d'état humains, bouton micro relié à la piste audio réelle, séparation stricte entre `Quitter` et `Terminer`, durée d'appel affichée et durée finale persistée.

### Ajouté

- Intégration de la base visuelle mobile/PWA premium issue du redesign: header compact, navigation bottom, composants glass/premium réutilisables et safe-area mobile pour les espaces privés sans remplacer les modules backend existants.
- Ajout de préférences d'appel persistées par utilisateur: sons, notifications, alertes flottantes, événements participants, volume, durée des alertes et démarrage micro/caméra.
- Ajout d'une alerte flottante globale d'événements d'appel alimentée par une route sécurisée avec polling léger pour les groupes dont l'utilisateur est membre.
- Ajout d'une architecture persistée d'appels audio/vidéo pour les groupes `Mes collaborateurs`, avec sessions d'appel, participants, événements, messages système, notifications et audit de groupe.
- Ajout du service backend `lib/livekit-service.ts` pour générer des tokens LiveKit temporaires côté serveur sans exposer les clés LiveKit au frontend.
- Ajout du mode de tenue des réunions COO: commentaires uniquement, audio ou vidéo. Les réunions audio/vidéo créent automatiquement un groupe de réunion dédié ou lient un groupe existant.
- Ajout des modèles et routes pour comptes rendus de réunion COO, décisions et création de tâches de suivi liées à une décision.

### Sécurisé

- Les routes d'appels vérifient la session, l'appartenance active au groupe, le statut de l'appel et les droits de gestion avant de démarrer, rejoindre, quitter ou terminer une session.
- Les variables `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` et `LIVEKIT_URL` sont documentées comme strictement serveur; seul un token participant temporaire peut être renvoyé à un membre autorisé.

### Amélioré

- UX mobile/PWA des échanges: les modales partagées utilisent davantage la hauteur écran avec scroll interne, les conversations de groupes et le chatbot gagnent en espace utile, les cartes de groupes affichent mieux appels actifs/badges/aperçus et les historiques systèmes d'appels sont plus compacts.
- Appels de groupe: ajout d'un panneau chat léger pendant appel audio/vidéo. Les messages saisis pendant l'appel sont envoyés via la messagerie de groupe existante, persistés, compatibles mentions et visibles dans l'historique normal du groupe.
- Demandes collaboratives dans Activités DTSC: la demande initiale et la réponse du destinataire sont désormais affichées dans deux blocs visuels distincts, avec le nom du collaborateur répondant en petit libellé coloré.
- Le bloc de réponse et d'avancement d'une demande collaborative est visible uniquement pour le collaborateur destinataire.
- Les formulaires juridiques du module Activités DTSC remplacent le champ texte libre `Document joint ou lien interne` par un vrai téléversement de fichier depuis l'appareil, avec aperçu local image/PDF et téléchargement avant envoi.
- Les routes de fichiers opérationnels Administration acceptent maintenant les blocs qui utilisent déjà des champs fichier (`MPO`, `CTO`, `LA`, `CEO`) en plus de `COO`, `HR & CFO` et `SCO`.

### Sécurisé

- La route `PATCH /api/activities/requests/[id]` bloque l'ajout d'une réponse ou l'avancement métier si l'utilisateur courant n'est pas le collaborateur destinataire; l'annulation reste réservée au demandeur.
- Ajout des routes privées `POST /api/activities/files` et `GET /api/activities/files/[...path]` pour stocker les pièces jointes Activités DTSC dans Supabase Storage, valider taille/type, journaliser uploads/téléchargements et limiter la lecture à l'auteur, ADMIN, LA ou CEO.
- La route `POST /api/activities/collaborator-workflows` refuse désormais les liens arbitraires dans les champs `documentUrl` et `attachmentUrl`; ces valeurs doivent provenir d'un téléversement autorisé.

## 2026-05-18

### Ajouté

- Paramètre global `Brouillons publics par non-clients` permettant aux rôles non-client autorisés d'écrire des publications publiques en brouillon sous leur nom.
- Action serveur du chatbot privé permettant d'envoyer un message à DTSC ou de créer un ticket support après collecte des informations et confirmation explicite du client.
- Migration `20260518162000_publication_draft_contributors` pour ajouter le réglage `allowNonClientPublicationDrafts`.
- Nouvelles questions FAQ sur la landing page pour couvrir l'assistant public, les ressources non inventées, les actions du chatbot privé, la sécurité et les brouillons de publications.
- Streaming progressif des réponses de l'assistant IA public sur la landing page pour éviter l'affichage brusque des messages.
- Paramètre global administrateur `Assistant IA landing page` permettant d'activer ou désactiver l'agent public.
- Fallback public lorsque l'agent est désactivé: résumé complet de DTSC et orientation vers le formulaire manuel de contact/newsletter.
- Migration `20260518143000_public_agent_setting` pour ajouter le réglage `publicAgentEnabled`.
- Garde-fou anti-hallucination sur les ressources: l'agent ne peut citer que les publications réellement publiées et fournies par le contexte serveur.
- Garde-fou serveur hors sujet: les questions manifestement non liées à DTSC sont refusées avant appel au modèle IA.
- Agent IA public DTSC sur la landing page avec widget flottant, qualification progressive des prospects, confirmation avant transmission, création ou mise à jour de fiche prospect et notification email à l'équipe DTSC.
- Champs de qualification IA dans les inscrits newsletter: service demandé, besoin décrit, urgence, budget estimatif, canal de contact préféré et résumé IA.
- Migration `20260518120000_public_ai_agent_leads` pour enrichir les prospects newsletter sans créer de table doublon.
- Création du changelog projet dans `docs/CHANGELOG.md` pour versionner les évolutions fonctionnelles et techniques à chaque commit.

### Corrigé

- Ajout d'une confirmation applicative avant modification ou suppression des publications publiques afin d'éviter les suppressions accidentelles d'articles publiés.
- Ajout d'une confirmation avant modification, conversion, désabonnement ou archivage d'un prospect newsletter.

### Documenté

- Variables d'environnement, route API de l'agent IA public, flux de qualification prospect et règles de sécurité associées.

### Amélioré

- Gouvernance des publications publiques: les contributeurs non-admin peuvent modifier uniquement leurs brouillons, tandis que publication et suppression restent réservées aux administrateurs.
- Assistant IA public: contexte enrichi avec les thèmes de FAQ pour orienter les visiteurs vers la FAQ, les ressources ou la newsletter selon le cas.
- Emails entrants prospects/newsletter: structure professionnelle DTSC, sections claires, tableau HTML responsive et texte de secours mieux formaté pour les clients mobiles.
- Responsive du module Activités DTSC: les modales, sélecteurs et formulaires collaborateur restent désormais contenus dans leur zone naturelle sur mobile et desktop.
- Notifications: les catégories et statuts techniques affichés avec underscores sont remplacés par des libellés français lisibles dans les badges, détails et aperçus.
# 2026-05-19

- Encapsulation des actions de commentaires des annonces et publications publiques dans les menus `...`, avec `Répondre`, `Copier le texte`, `Modifier` et `Supprimer` affichés selon les permissions.
- Amélioration des groupes `Mes collaborateurs`: mentions interactives, badge de mentions non lues, marquage lu à l'ouverture, réponse à un message via `replyToId`, en-tête mobile sobre et conversation mieux isolée en plein écran mobile.
- Centralisation du formulaire `Formuler une demande à un collaborateur` dans le bloc `Demandes collaboratives` du module Activités DTSC.
- Enrichissement de `/offline` avec présentation DTSC, services, FAQ, contact essentiel et version de cache PWA excluant les pages privées sensibles.
- Ajout de `public/offline.html` comme fallback PWA autonome afin d'éviter les erreurs client Next.js hors ligne lorsque les chunks applicatifs ne sont pas disponibles sur mobile.
- Ajout d'une mise à jour automatique des PWA installées: vérification au retour en ligne, au focus, au retour de visibilité et activation du nouveau service worker avec rechargement unique du client.
- Amélioration du contraste des conversations chatbot partagées dans les groupes: cartes de preview et modales de snapshot lisibles en mode sombre comme en mode clair, avec hiérarchie visuelle plus premium.
- Ajout d'une modale professionnelle de détails de groupe accessible par clic sur l'en-tête du groupe dans `Mes collaborateurs`, avec métriques, propriétaire, rôle courant, membres et invitations en attente.
- Ajout de snapshots persistants `CollaborationSharedConversation` pour partager une copie consultable des conversations chatbot dans les groupes sans exposer la conversation privée originale.
- Ajout de la pagination/cursor et du scroll borné pour les messages de groupe et les commentaires transversaux Activités DTSC.
- Amélioration du module Mes collaborateurs: chargement progressif des anciens messages, couleurs stables par intervenant et ouverture des conversations chatbot partagées en boîte de dialogue.
- Remplacement des actions visibles du chatbot par un menu `...` avec infos, copie de lien, partage, transfert vers groupe, renommage et suppression.
- Amélioration du transfert d'annonces avec recherche intelligente par nom, email, rôle, poste ou département, sélection multiple et résumé des destinataires.
- Enrichissement de l'éditeur riche avec palette de couleurs contrôlée et types de listes avancés: puce simple, cercle, carré, numérotée, alphabétique, checklist et tirets.
- Extension des dictionnaires i18n FR/EN pour les commentaires, conversations, annonces, chatbot, groupes et éditeur.
- Documentation AGENTS mise à jour avec les standards permanents de commentaires, conversations, snapshots de partage, annonces, éditeur riche, i18n et mobile-first.

- Ajout du module privé **Mes collaborateurs** avec groupes, invitations individuelles ou groupées, membres, messagerie, mentions, partage de conversations chatbot, contact support DTSC, notifications et audit de groupe.
- Ajout d'un composant réutilisable `ActionMenu` pour les menus contextuels `...`, appliqué au fil des annonces et aux messages collaboratifs.
- Enrichissement des annonces: soft delete, archivage, épinglage, copie persistée, transfert, signalement, indicateurs, informations détaillées et compteurs.
- Ajout de la persistance des mentions collaboratives via `CooCommentMention` et des notifications de mention dans les commentaires d'activités.
- Ajout des helpers `lib/user-format.ts` pour afficher les dates du chatbot, messages et historiques selon la langue, le fuseau horaire et le format utilisateur.
- Ajout des dictionnaires `locales/fr.json` et `locales/en.json`, avec application sur la navigation privée et les nouvelles interactions.
- Documentation AGENTS, README, documentation technique et pages légales actualisées pour les nouvelles données, notifications, messagerie et standards UX.
