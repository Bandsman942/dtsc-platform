# UX-04 — Accès rapide aux modules ERP autorisés

La page « Modules ERP » propose désormais une recherche directe, des raccourcis suggérés selon la fonction dans l'organisation, des favoris épinglables et un historique récent. Ces raccourcis réduisent le nombre de pages à traverser pour ouvrir un module quotidien.

Les liens **proviennent exclusivement du registre de navigation filtré côté serveur** par entreprise, utilisateur et permissions. Les favoris et l'historique mémorisent seulement des codes de modules, dans le stockage local du navigateur, séparés par identifiants de compte et d'entreprise. À chaque ouverture, les codes sont revalidés contre la liste autorisée ; le stockage n'accorde aucun accès.

## Avant fusion

- Parcours E2E multi-utilisateurs et multi-entreprises : favoris isolés, disparition d'un module lorsque le droit/abonnement change, changement d'entreprise sans fuite, lien profond valide.
- Recherche FR/EN, clavier/lecteur d'écran, rechargement PWA, mode privé sans stockage et écrans de 320 à 1440 px.
- Étendre les raccourcis au tableau de bord des rôles et à la navigation globale, après validation de la première ergonomie (#927).

Pas de migration ni de modification RBAC ; le rollback consiste à revenir sur les modifications de l'interface. Aucun Preview/Production sans OWNER_E2E.
