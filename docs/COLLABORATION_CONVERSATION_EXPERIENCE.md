# Mes Collaborateurs — Conversation Experience

## Objectif

Le module **Mes Collaborateurs** adopte une expérience conversationnelle inspirée des usages WhatsApp/Messenger sans copier leur identité visuelle. DTSC conserve son design system et ses composants réutilisables.

La refonte ne remplace pas le métier Collaboration existant. Elle réutilise :

- `CollaborationGroup` et `CollaborationGroupMember` ;
- `CollaborationGroupMessage`, réponses, mentions et accusés de lecture ;
- invitations et présence ;
- appels audio/vidéo LiveKit ;
- partages de conversations ;
- audit de groupe.

## UX principale

Mobile :

```text
Liste des discussions
→ filtres Tous / Non lus / Favoris / Groupes / Archivés
→ statuts récents
→ sélection
→ conversation plein écran
→ composer texte / vocal
```

Desktop :

```text
Liste + filtres | Conversation active
```

Le menu `...` d'un groupe expose notamment les informations, favoris, épinglage, archivage, notifications, photo du groupe, statut, invitations, paramètres et accès aux appels.

## Viewport conversationnel immersif

Sur mobile/PWA, la page privée ne défile plus verticalement lorsque `Mes Collaborateurs` est affiché. Le shell conversationnel :

- verrouille le scroll global du document ;
- utilise `VisualViewport` pour suivre l'écran réellement disponible, y compris sur iOS avec clavier ouvert ;
- conserve uniquement le scroll interne de la liste des groupes et du fil de messages ;
- s'étend automatiquement lorsque les navigations DTSC haute et basse sont masquées ;
- se réduit exactement entre ces deux navigations lorsqu'elles réapparaissent ;
- réutilise le contrôleur mobile DTSC existant pour le tap d'apparition/disparition des barres ;
- masque les barres lors d'un scroll descendant du fil et les restitue lors d'un scroll remontant ou au retour en haut.

Le composant réutilisable `useImmersiveConversationViewport()` centralise ce comportement afin d'éviter un second moteur de navigation mobile propre à Collaboration.

## Couleurs des participants

Les messages ne sont pas limités à une seule couleur pour tous les interlocuteurs. Les participants conservent une couleur stable dérivée d'un identifiant déterministe lorsque celui-ci est disponible.

La palette commune est fournie par `lib/participant-colors.ts`. Le shell applique l'accent correspondant aux bulles des autres participants tout en préservant contraste, thème clair/sombre et couleur propre du message de l'utilisateur courant.

Aucune couleur aléatoire n'est recalculée à chaque rendu.

## Saisie multiligne

`VoiceConversationComposer` utilise désormais une vraie zone `textarea` auto-extensible :

- `Entrée` crée une nouvelle ligne ;
- le bouton Envoyer transmet le message ;
- `Ctrl+Entrée` ou `Cmd+Entrée` est un raccourci d'envoi ;
- la hauteur reste bornée, puis la zone devient scrollable en interne ;
- le comportement VisualViewport et safe-area reste compatible iOS/PWA.

## Extension de données additive

La migration `20260729221000_add_collaboration_conversation_experience` ajoute :

- `CollaborationGroupExperience` : métadonnées privées de photo de groupe ;
- `CollaborationGroupStory` : statuts image éphémères ;
- `CollaborationVoiceMessage` : métadonnées privées d'un vocal rattaché à un vrai message ;
- `CollaborationGroupPreference` : préférences personnelles par utilisateur/groupe.

La migration additive `20260730103000_add_collaboration_voice_settings` ajoute :

- `CollaborationVoiceSetting` : configuration serveur globale des messages vocaux.

Aucune table Collaboration historique n'est supprimée ou remplacée.

## Photos de groupe

Seuls les membres OWNER/ADMIN du groupe peuvent changer la photo.

Le fichier est stocké dans le bucket privé existant :

```text
collaboration/{groupId}/avatar/...
```

La base conserve uniquement bucket/path/MIME/taille. L'affichage utilise une URL signée temporaire après contrôle d'accès.

## Statuts image

Un membre actif peut publier une image et une légende courte dans son groupe.

Par défaut :

```text
createdAt
→ visible aux membres du groupe
→ expiresAt = +24 h
```

Le fichier reste privé :

```text
collaboration/{groupId}/stories/{storyId}/...
```

L'auteur ou un gestionnaire peut supprimer le statut.

## Messages vocaux

Le navigateur enregistre via `MediaRecorder` lorsque la plateforme le supporte.

Le workflow est :

```text
microphone
→ MediaRecorder
→ Blob audio
→ normalisation MIME
→ API membre du groupe
→ configuration serveur
→ upload privé
→ CollaborationGroupMessage(messageType=VOICE)
→ CollaborationVoiceMessage
→ URL signée à la lecture
```

Les MIME produits par les navigateurs peuvent contenir des paramètres, par exemple `audio/webm;codecs=opus`. Le backend normalise toujours le type avant validation afin de ne pas refuser un enregistrement WebM/Opus valide.

### Paramètres backend vocaux

`CollaborationVoiceSetting(id=global)` est la source de vérité pour :

- activation/désactivation des vocaux ;
- durée maximale en secondes ;
- taille maximale du fichier ;
- nombre maximal d'uploads vocaux par heure et utilisateur.

Valeurs initiales :

```text
enabled = true
maxDurationSeconds = 300
maxFileSizeBytes = 16 MiB
rateLimitPerHour = 120
```

Le frontend charge les capacités via :

```text
GET /api/collaborators/voice-settings
```

L'administration serveur utilise :

```text
GET   /api/admin/collaboration-voice-settings
PATCH /api/admin/collaboration-voice-settings
```

Le `PATCH` est réservé au rôle global `ADMIN`, protégé par same-origin, rate limiting, validation Zod, AuditLog et ApiLog.

Les limites visibles côté navigateur ne sont qu'une aide UX. Le serveur recalcule et refuse toute durée, taille, fréquence ou tentative d'envoi interdite par la configuration courante.

Le vocal est distinct des appels LiveKit et ne remplace pas les appels audio/vidéo.

## Notifications et préférences

Les préférences sont personnelles :

- favori ;
- épinglé ;
- archivé ;
- tous les messages ;
- mentions uniquement ;
- aucune notification ;
- mute temporaire.

Le serveur applique ces préférences avant l'envoi de notifications. Le frontend ne peut pas contourner un mute.

## Sécurité

Les nouveaux endpoints appliquent :

```text
session
→ contexte courant
→ membre actif du groupe
→ permission objet
→ same-origin pour mutation
→ rate limit
→ validation Zod/fichier
→ stockage privé
→ audit + ApiLog
```

Les `replyToId` sont validés dans le même groupe afin d'interdire une référence croisée entre conversations.

## Compatibilité

La refonte préserve :

- les groupes existants ;
- tous les messages existants ;
- mentions/réponses/lectures ;
- invitations ;
- présence ;
- partages Chatbot ;
- appels LiveKit.

Un **mode appels avancé** reste accessible depuis le menu et réutilise l'implémentation LiveKit existante pendant que l'écran principal devient plus conversationnel.

## CI/CD

Le chantier respecte le workflow DTSC :

```text
feature branch
→ QA
→ GitHub Quality Gates
→ PR
→ review
→ merge main
→ unique Vercel Production
→ prisma migrate deploy
→ pnpm build
→ vérification SHA
```

Aucun Preview Vercel fonctionnel n'est activé.
