# PR notes — collaboration immersive polish

## Contexte

Finition de la refonte conversationnelle `Mes Collaborateurs` après la PR #22.

## UX mobile

- workspace verrouillé dans le viewport mobile ;
- aucun scroll vertical global de la page ;
- liste/fils scrollables en interne ;
- `VisualViewport` pour clavier iOS/PWA ;
- navigation haute/basse DTSC conservée et synchronisée avec le scroll interne.

## Conversation

- accents de bulles stables par participant ;
- textarea multiligne auto-extensible ;
- Entrée = nouvelle ligne ;
- envoi explicite par bouton ou Ctrl/Cmd+Entrée.

## Vocaux

- correction des MIME `audio/webm;codecs=opus` ;
- configuration backend persistée ;
- activation, durée, taille et rate limit autoritaires côté serveur ;
- API ADMIN sécurisée ;
- stockage privé et message VOICE transactionnel conservés.

## Migration

Additive uniquement : nouvelle table `CollaborationVoiceSetting`; aucune suppression ou modification destructive des messages/groupes existants.

## CI/CD

Aucun changement Vercel : feature branch sans Preview fonctionnel, Quality Gates, review, merge main, puis Production unique depuis main.
