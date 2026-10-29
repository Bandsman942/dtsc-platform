# UX-04 — Accès rapide aux modules ERP autorisés

La page « Modules ERP » propose désormais une recherche directe, des raccourcis suggérés selon la fonction dans l'organisation, des favoris épinglables et un historique récent. Ces raccourcis réduisent le nombre de pages à traverser pour ouvrir un module quotidien.

La palette de commande est aussi disponible depuis les pages privées de l'entreprise avec **Ctrl/Cmd + K**, un bouton compact dans l'en-tête desktop et un bouton tactile dans le rail mobile. La recherche y réutilise les mêmes favoris/recents ; son dialogue est téléchargé à la demande pour limiter le coût de JavaScript initial du shell. L'ouverture au clavier place le focus sur la recherche ; l'ouverture tactile laisse le contrôle à iOS sans forcer le clavier virtuel.

Les liens **proviennent exclusivement du registre de navigation filtré côté serveur** par entreprise, utilisateur et permissions. Les favoris et l'historique mémorisent seulement des codes de modules, dans le stockage local du navigateur, séparés par identifiants de compte et d'entreprise. À chaque ouverture, les codes sont revalidés contre la liste autorisée ; le stockage n'accorde aucun accès.

## Avant fusion

- Parcours E2E multi-utilisateurs et multi-entreprises : favoris isolés, disparition d'un module lorsque le droit/abonnement change, changement d'entreprise sans fuite, lien profond valide.
- Recherche FR/EN, clavier/lecteur d'écran, rechargement PWA, mode privé sans stockage et écrans de 320 à 1440 px.
- Étendre l'accueil contextualisé par rôle aux vraies tâches et KPI du dashboard sans inventer d'indicateurs ; la palette globale est implémentée mais attend E2E (#927).

Pas de migration ni de modification RBAC ; le rollback consiste à revenir sur les modifications de l'interface. Aucun Preview/Production sans OWNER_E2E.
