# Mes Collaborateurs — finition immersive

Cette itération complète la refonte conversationnelle livrée par la PR #22 sans reconstruire le module.

## Architecture

`CollaboratorsImmersiveConversationShell` enveloppe le workspace existant et réutilise `useImmersiveConversationViewport` pour le plein écran mobile/PWA. Le contrôleur global DTSC conserve la responsabilité du tap qui affiche/masque les navigations ; le shell ne fait que verrouiller le scroll global, calculer la hauteur utile avec `VisualViewport` et piloter le chrome à partir du scroll interne.

## Couleurs

Les couleurs de participants réutilisent `getParticipantColor`. Le shell associe le nom affiché à l'identifiant utilisateur disponible dans les props de groupe/utilisateurs, puis applique un accent stable aux bulles reçues. Les messages de l'utilisateur courant gardent l'accent principal DTSC.

## Composer

`VoiceConversationComposer` est partagé. Il utilise une `textarea` auto-extensible : Entrée crée une nouvelle ligne ; le bouton Envoyer et Ctrl/Cmd+Entrée envoient le texte.

## Vocaux

`CollaborationVoiceSetting` configure côté serveur :

- `enabled` ;
- `maxDurationSeconds` ;
- `maxFileSizeBytes` ;
- `rateLimitPerHour`.

La route de vocal charge cette configuration avant toute création. Elle normalise le MIME navigateur, valide taille/durée, applique le rate limit, puis crée transactionnellement le message et ses métadonnées privées.

## Frontières

Cette itération ne remplace pas LiveKit, ne rend aucun média public et ne modifie pas le workflow Vercel production-only.
