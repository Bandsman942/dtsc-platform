# Mes Collaborateurs — présence, lectures et réunions liées

## Objectif

Cette itération complète l’expérience conversationnelle sans remplacer les objets métier existants. Elle traite trois sujets : fluidité tactile mobile, journal de présence pour les gestionnaires de groupe et continuité entre une réunion COO audio/vidéo et son groupe de conversation.

## Scroll conversationnel sans saccades

Sur mobile/PWA, le fil reste un scroller interne alors que la page globale est verrouillée. Le comportement repose sur deux responsabilités séparées :

- `useImmersiveConversationViewport()` suit uniquement `VisualViewport` et fixe la surface de conversation ;
- `PrivateMobileChromeController` est l’unique moteur qui décide de masquer ou afficher le chrome DTSC.

Dans une conversation immersive, `pointerdown` ne bascule plus immédiatement les barres. Le contrôleur distingue :

```text
Tap court et immobile
→ toggle du chrome

Drag vertical significatif vers le haut
→ masquer une fois pour ce geste

Drag vertical significatif vers le bas
→ afficher une fois pour ce geste
```

Une décision de drag n’est jamais inversée pendant le même geste. Le rebond inertiel du navigateur et les micro-inversions ne peuvent donc plus déclencher une seconde transition concurrente.

Le fil ne mesure pas le header/footer pendant le scroll et n’écrit pas la géométrie du workspace en réponse au scroll des messages.

## Journal de connexion / déconnexion

La migration additive introduit `CollaborationPresenceSession`.

Une session contient :

- utilisateur ;
- identifiant de session client lorsqu’il existe ;
- type de client ;
- heure de connexion ;
- dernier heartbeat ;
- heure et cause de déconnexion.

Les heartbeats périodiques mettent à jour `lastHeartbeatAt`. Ils ne créent pas une nouvelle ligne toutes les 15 secondes. Lorsqu’un navigateur disparaît sans envoyer correctement `offline`, une session dont le heartbeat est périmé est considérée comme terminée à son dernier heartbeat.

### Accès

`GET /api/collaborators/groups/{groupId}/presence-journal`

La route exige :

```text
session
→ membre actif du groupe
→ OWNER / ADMIN autorisé
→ période d’appartenance au groupe
→ filtres bornés
```

Un gestionnaire ne peut pas voir les sessions d’un membre antérieures à son entrée dans le groupe ou postérieures à son départ.

Filtres disponibles : recherche nom/email/poste, membre, en ligne/hors ligne, type d’appareil, période, durée et tri récent/ancien/plus long. La requête brute est bornée à 1 000 sessions et l’UI invite à affiner la période lorsqu’elle atteint cette limite.

## Infos de lecture d’un message

Aucune nouvelle table n’est créée pour les accusés de lecture. La source de vérité reste `CollaborationGroupMessageRead.readAt`.

`Infos du message` affiche désormais pour chaque membre :

- nom/avatar ;
- état en ligne/hors ligne ;
- heure exacte de lecture, avec secondes, pour les messages lus ;
- liste distincte des membres qui n’ont pas encore lu.

L’API existante continue de vérifier que l’utilisateur est l’auteur du message ou un gestionnaire autorisé du groupe.

## Réunion COO → groupe → appel

Les groupes audio/vidéo déjà créés depuis `CooMeeting` restent la base. L’itération ajoute uniquement `CollaborationMeetingLink` pour matérialiser le lien dans le fil.

```text
CooMeeting AUDIO / VIDEO
        ↓
CollaborationGroup meetingId
        ↓
MEETING_LINK dans le fil
        ↓ à scheduledAt
clic d’un participant
        ↓
réutiliser CollaborationGroupCall actif
OU créer le premier CollaborationGroupCall
        ↓
LiveKit existant
```

Le lien est synchronisé avec le titre, le mode, la date et l’heure de la vraie réunion COO. Avant l’heure planifiée, le bouton est désactivé côté UI et l’API retourne également un refus ; le frontend n’est donc pas la règle de sécurité.

Un premier participant autorisé peut ouvrir la room à l’heure planifiée. Les clics suivants réutilisent l’appel `RINGING`/`ACTIVE` existant pour la même réunion afin d’éviter des rooms concurrentes.

## Fin de réunion → compte-rendu COO + résumé groupe

À la fin d’un `CollaborationGroupCall` lié à une réunion, l’API crée de manière idempotente :

- un message `MEETING_MINUTES_PROMPT` dans le groupe ;
- un `CollaborationMeetingMinutesPublication` qui relie appel, réunion, message et futur compte-rendu.

Le bouton de rédaction est visible au responsable de compte-rendu de la réunion, au propriétaire ou à un administrateur autorisé du groupe.

L’enregistrement :

```text
Compte-rendu détaillé
→ CooMeetingMinutes
→ lié au CooMeeting existant

Résumé
→ CollaborationGroupMessage type MEETING_SUMMARY
→ visible dans le groupe
```

Si aucun résumé n’est saisi, le serveur produit un extrait textuel borné du compte-rendu ; aucune IA externe n’est nécessaire pour rendre le workflow fonctionnel.

## Migration

`20260730131500_add_collaboration_presence_meeting_workflow` crée uniquement :

- `CollaborationPresenceSession` ;
- `CollaborationMeetingLink` ;
- `CollaborationMeetingMinutesPublication`.

Il n’y a aucun `DROP TABLE`, `DROP COLUMN` ou remplacement des groupes/messages/appels/réunions historiques.

## CI/CD

Le workflow reste :

```text
feature branch
→ aucun Preview Vercel fonctionnel
→ Quality Gates
→ review
→ merge normal main
→ unique Vercel Production
→ prisma migrate deploy
→ pnpm build
→ vérification du SHA Production
```
