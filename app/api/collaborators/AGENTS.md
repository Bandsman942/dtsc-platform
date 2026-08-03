# Collaboration APIs — règles pérennes

- Toute lecture/mutation de groupe doit vérifier une session puis l’appartenance active au groupe dans le contexte courant avec les helpers `lib/collaboration.ts`.
- Un rôle DTSC global ne doit jamais ouvrir un groupe client sans membership du groupe et contexte autorisé.
- Toute mutation sensible applique `isSameOriginRequest()`, `await rateLimit(...)`, validation Zod ou validation de fichier dédiée, `ApiLog` et audit métier approprié.
- Les médias Collaboration utilisent uniquement le stockage privé serveur avec service role ; ne jamais utiliser `getPublicUrl` ni persister une URL signée.
- Les chemins média doivent être bornés par `collaboration/{groupId}/...` et revalidés avant création d’une URL signée.
- Les photos de groupe sont modifiables uniquement par un OWNER/ADMIN du groupe autorisé.
- Les statuts image expirent à 24 h par défaut et restent visibles uniquement aux membres autorisés du groupe.
- Un vocal crée toujours un vrai `CollaborationGroupMessage` de type `VOICE` plus une ligne `CollaborationVoiceMessage`; ne jamais stocker un vocal uniquement comme blob sans message métier.
- Les paramètres des vocaux (`enabled`, durée, taille et rate limit) sont autoritaires côté serveur via `CollaborationVoiceSetting`; le frontend ne peut jamais augmenter ou contourner ces limites.
- Normaliser les MIME audio avec paramètres (`audio/webm;codecs=opus`, etc.) avant validation et stockage ; ne jamais dépendre d’une égalité brute du header MIME navigateur.
- Les réponses (`replyToId`) doivent pointer vers un message du même groupe.
- Les préférences de notification doivent être appliquées côté serveur avant `notifyUser(s)` ; le frontend n’est jamais la source de vérité du mute.
- Les suppressions de messages vocaux doivent rendre le média inaccessible et nettoyer le blob privé lorsque possible.
- Les heartbeats de présence alimentent `CollaborationPresenceSession` en mettant à jour une session existante ; ne jamais créer une ligne par heartbeat.
- Le journal de présence d’un groupe exige membership actif puis permission OWNER/ADMIN, borne les requêtes et limite chaque membre à sa fenêtre `joinedAt` → `leftAt`.
- `CollaborationGroupMessageRead.readAt` reste l’unique source des heures de lecture. Ne jamais dupliquer l’accusé de lecture dans une table parallèle.
- Un lien de réunion dans le fil doit dériver d’un vrai `CooMeeting` AUDIO/VIDEO lié au groupe ; l’API de join revérifie membership, horaire planifié et réutilise l’appel `RINGING`/`ACTIVE` existant avant toute création de room.
- La fin d’un appel COO lié peut créer un prompt de compte-rendu idempotent. Le contenu détaillé va dans `CooMeetingMinutes`; le résumé publié dans le groupe reste un message dérivé et ne remplace pas le compte-rendu COO.
- Les migrations Collaboration restent additives et ne détruisent pas les groupes/messages/appels/réunions existants.
- Vercel reste production-only depuis `main`; aucune Preview de feature branch ne doit être activée.

## Itération standard 03

- Les conversations directes utilisent le résolveur canonique et `directKey`; aucune route ne crée une seconde conversation concurrente.
- Une mutation de message accepte `clientMessageId` et retourne le même objet sur retry.
- Les références message, réponse, fil, membre, média et appel sont revalidées dans le même groupe et le même contexte.
- Les pièces jointes restent privées, contrôlées et servies par URL signée après vérification du membership.
- Les transitions d’appel, expiration de sonnerie et durées sont calculées côté serveur.
- Une notification d’appel ne connecte jamais automatiquement le destinataire.

## Mentions et filtres commerciaux

- Toute mention `@tous` est détectée et autorisée côté serveur, jamais uniquement dans le composant client.
- L’ouverture d’une conversation marque dans la même transaction les accusés de lecture et les mentions réellement chargées ; ne jamais effacer globalement toutes les mentions d’un groupe.
- Les listes personnalisées de conversations sont toujours scoped par `session.userId`, validées, limitées, same-origin pour les mutations et sans capacité d’élargir le répertoire autorisé.
