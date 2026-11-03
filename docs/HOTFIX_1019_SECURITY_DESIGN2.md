# HOTFIX #1019 — Sécurité personnelle, DTSC Design 2.0

## Objectif
Les paramètres personnels suivent le contrat `ModuleWorkspace → ModuleContent → ModuleSection`.
Un seul accès « Sécurité du compte et notifications » ouvre un espace plein écran avec retour au module.
La sous-navigation regroupe cinq fonctions : session actuelle, TOTP / codes de récupération, appareils connectés, navigateurs reconnus et durée de session / notifications.

## UI
- Sous-navigation responsive sur deux colonnes mobiles, trois colonnes intermédiaires, cinq colonnes larges.
- Seule la rubrique choisie est visible ; les rubriques restent montées pour conserver notamment l'affichage des codes de récupération à usage unique si l'utilisateur change brièvement de rubrique.
- Les composants existants acceptent `embedded` : aucune carte globale doublée à l'intérieur du `ModuleSection`; les contrôles sensibles conservent tous leurs appels API et confirmations.
- Le QR TOTP est rendu **localement**, en SVG, à une largeur maximale explicite de 248 pixels avec zone blanche/quiet zone ; il n'est pas transmis à un service QR externe.
- FR/EN, clair/sombre, navigation clavier, focus visible, cibles tactiles de 56 pixels au moins pour la sous-navigation ; pas de défilement horizontal global.

## Périmètre / sécurité
Aucune migration ni modification d'API, du chiffrement TOTP, de la vérification MFA, des permissions, des cookies, de la révocation de session, ou des notifications Push.
Les codes de récupération sont éphémères et uniquement affichés après confirmation du second facteur : changer de rubrique conserve leur état tant que la section reste ouverte ; fermer l'espace détruit cet état.

## Tests
- QA statique : `pnpm qa:hotfix-1019-security-settings` (incluse dans `pnpm qa:regression`).
- OWNER_E2E : ouvrir « Sécurité du compte et notifications » ; tester les cinq rubriques sur ordinateur, 320/360/375/390/414/768/1024 px, FR/EN, clair/sombre ; comparer le QR à 248 px max et le scanner avec une application Authenticator ; vérifier activation/désactivation TOTP et codes de récupération, déconnexion d'un appareil distant, révocation d'un navigateur reconnu, gestion des notifications et retour à la page des Paramètres.
- La recette des anciennes PR #1013–#1017 ne remplace pas la validation de cette nouvelle modification UI.

## Livraison
Uniquement après CI verte et OWNER_E2E #1019 explicite. Merge vers `main` puis unique déploiement automatique Vercel Production ; aucun Preview de branche.
