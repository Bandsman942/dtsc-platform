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

## Extension de données additive

La migration `20260729221000_add_collaboration_conversation_experience` ajoute :

- `CollaborationGroupExperience` : métadonnées privées de photo de groupe ;
- `CollaborationGroupStory` : statuts image éphémères ;
- `CollaborationVoiceMessage` : métadonnées privées d'un vocal rattaché à un vrai message ;
- `CollaborationGroupPreference` : préférences personnelles par utilisateur/groupe.

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
→ Blob audio
→ API membre du groupe
→ upload privé
→ CollaborationGroupMessage(messageType=VOICE)
→ CollaborationVoiceMessage
→ URL signée à la lecture
```

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
