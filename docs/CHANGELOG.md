# Changelog DTSC Platform

Ce document suit en français professionnel les améliorations apportées à DTSC Platform. Chaque entrée doit préciser ce qui a été ajouté, modifié, corrigé, supprimé ou amélioré afin de conserver une lecture claire de l'évolution du produit.

## 2026-05-18

### Ajouté

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

- Emails entrants prospects/newsletter: structure professionnelle DTSC, sections claires, tableau HTML responsive et texte de secours mieux formaté pour les clients mobiles.
- Responsive du module Activités DTSC: les modales, sélecteurs et formulaires collaborateur restent désormais contenus dans leur zone naturelle sur mobile et desktop.
- Notifications: les catégories et statuts techniques affichés avec underscores sont remplacés par des libellés français lisibles dans les badges, détails et aperçus.
