# Changelog DTSC Platform

Ce document suit en français professionnel les améliorations apportées à DTSC Platform. Chaque entrée doit préciser ce qui a été ajouté, modifié, corrigé, supprimé ou amélioré afin de conserver une lecture claire de l'évolution du produit.

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

- Ajout du module privé **Mes collaborateurs** avec groupes, invitations individuelles ou groupées, membres, messagerie, mentions, partage de conversations chatbot, contact support DTSC, notifications et audit de groupe.
- Ajout d'un composant réutilisable `ActionMenu` pour les menus contextuels `...`, appliqué au fil des annonces et aux messages collaboratifs.
- Enrichissement des annonces: soft delete, archivage, épinglage, copie persistée, transfert, signalement, indicateurs, informations détaillées et compteurs.
- Ajout de la persistance des mentions collaboratives via `CooCommentMention` et des notifications de mention dans les commentaires d'activités.
- Ajout des helpers `lib/user-format.ts` pour afficher les dates du chatbot, messages et historiques selon la langue, le fuseau horaire et le format utilisateur.
- Ajout des dictionnaires `locales/fr.json` et `locales/en.json`, avec application sur la navigation privée et les nouvelles interactions.
- Documentation AGENTS, README, documentation technique et pages légales actualisées pour les nouvelles données, notifications, messagerie et standards UX.
