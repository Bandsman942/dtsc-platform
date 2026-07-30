# QA — Mes Collaborateurs immersive polish

## Mobile / viewport

- 320 / 375 / 390 / 414 px : aucun scroll vertical global de la page Collaboration.
- Liste des groupes et fil de messages scrollables séparément.
- Scroll descendant : chrome mobile haut/bas masqué ; scroll remontant ou retour en haut : chrome restauré.
- Tap hors contrôle : comportement global DTSC existant préservé.
- Clavier iOS/PWA : composer visible dans le `VisualViewport`, aucune zone de saisie masquée derrière la navigation.

## Conversations

- Couleur de participant stable entre deux rendus pour le même utilisateur.
- Contraste lisible clair/sombre.
- Message courant distinct visuellement.
- Textarea auto-extensible ; Entrée ajoute une ligne ; bouton Envoyer transmet le message ; Ctrl/Cmd+Entrée transmet également.

## Vocaux

- `audio/webm;codecs=opus` accepté après normalisation MIME.
- Enregistrement MediaRecorder avec autorisation microphone.
- Activation/désactivation backend appliquée côté API et composer.
- Durée maximale backend appliquée côté client pour l'UX et recalculée côté serveur.
- Taille maximale backend appliquée côté client pour l'UX et recalculée côté serveur.
- Rate limit horaire backend appliqué.
- Création transactionnelle `CollaborationGroupMessage(VOICE)` + `CollaborationVoiceMessage`.
- Lecture réservée aux membres du groupe via URL signée privée.
- Suppression conserve la logique de nettoyage média existante.

## Régression

- Filtres Tous / Non lus / Favoris / Groupes / Archivés.
- Photos de groupe et statuts image.
- Invitations, mentions, réponses, lectures et présence.
- Appels LiveKit accessibles depuis le mode avancé.
- Isolation tenant/contexte et membership actif.
- `qa:collaboration-experience` inclus dans `qa:regression`.
- Migration-from-scratch.
- Type-check, lint, build.
- Vercel Preview toujours désactivé ; Production uniquement depuis `main`.
