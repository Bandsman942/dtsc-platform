# Rollout production — Session & Background Push

## Avant merge

- Vercel Preview du HEAD exact doit être `success`.
- Migration Prisma doit être appliquée sans erreur.
- Build TypeScript/Next.js doit être vert.
- QA source-level et QA mobile/PWA doivent rester vertes dans l'environnement qui peut les exécuter.
- Aucun secret VAPID ne doit apparaître dans le diff.

## Variables Vercel

À configurer sur le projet Vercel existant uniquement :

- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

Ne pas créer de nouveau projet Vercel ni changer les domaines DTSC.

La fonctionnalité Push se dégrade proprement lorsque ces variables manquent, mais un véritable test de push fermé ne peut être considéré comme réussi tant que la paire VAPID stable n'est pas configurée en production.

## Après merge

1. confirmer `main` = merge SHA ;
2. confirmer Vercel Production SHA = merge SHA ;
3. tester préférence 15/30 min ;
4. tester `Rester connecté` ;
5. tester expiration et `/session-expired` ;
6. tester deux onglets ;
7. tester changement organisation ;
8. activer Web Push sur un appareil réel ;
9. fermer toute page DTSC ;
10. déclencher une notification métier ;
11. vérifier réception système, tap, auth et targetUrl ;
12. vérifier logout manuel et suppression de la subscription du terminal.

## Tests physiques

Un build Vercel, une revue source ou une émulation ne remplacent pas :

- Chrome/Firefox desktop avec Push Service ;
- Android/PWA installée ;
- iPhone/iPad PWA installée et notification autorisée.

Le rapport final doit distinguer explicitement les tests réellement exécutés de ceux non disponibles dans l'environnement de l'agent.
