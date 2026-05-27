# Changelog DTSC Platform

Ce document suit en français professionnel les améliorations apportées à DTSC Platform. Chaque entrée doit préciser ce qui a été ajouté, modifié, corrigé, supprimé ou amélioré afin de conserver une lecture claire de l'évolution du produit.

## 2026-05-27

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
