# Régression login — 2026-07-28

## Symptôme

Le formulaire de connexion pouvait afficher le fallback client « Impossible de traiter la demande. » alors que les identifiants et le contexte d'organisation étaient valides.

## Cause technique

Le Sprint Sessions a rendu `setSessionCookie()` dépendant de la lecture de `UserSessionPreference`. Cette préférence est secondaire à l'authentification, mais une erreur Prisma sur ce stockage remontait sans fallback et transformait la requête `/api/auth/sign-in` en erreur serveur non JSON.

Le formulaire d'authentification affiche alors son message générique, car les erreurs métier normales (identifiants invalides, compte inactif, membership refusé, rate limit) utilisent toutes une réponse JSON explicite.

## Correction

`getUserSessionIdleTimeoutMinutes()` traite désormais une indisponibilité du stockage de préférence comme un mode dégradé sûr et retourne la politique serveur par défaut (30 minutes).

La sauvegarde explicite d'une préférence continue à échouer normalement si la base ne peut pas l'enregistrer : seul le chemin de lecture nécessaire au login est rendu résilient.

## Invariant

Une préférence de confort ou de politique utilisateur ne doit jamais rendre l'authentification DTSC indisponible. La session reste bornée par la politique serveur et sa durée absolue.
