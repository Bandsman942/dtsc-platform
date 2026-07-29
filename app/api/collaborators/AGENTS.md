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
- Les migrations Collaboration restent additives et ne détruisent pas les groupes/messages/appels existants.
- Vercel reste production-only depuis `main`; aucune Preview de feature branch ne doit être activée.
