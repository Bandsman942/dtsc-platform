# QA — Expérience standard des modules

## Préconditions

- tester une session utilisateur active ;
- tester les thèmes clair et sombre ;
- tester dans un navigateur mobile/PWA et desktop ;
- utiliser les largeurs 320, 360, 375, 390, 414, 768 et 1024 px ;
- vérifier qu'aucune page ne crée de scroll horizontal global.

## KPI

Pour Dashboard, Notifications, Annonces, Entreprise, Abonnement, Support, Paramètres, Profil et Activités DTSC :

- les KPI forment une seule rangée horizontale sur mobile ;
- le glissement tactile gauche/droite fonctionne ;
- chaque KPI se cale proprement grâce au snap ;
- le contenu voisin reste fixe ;
- aucun texte de KPI n'élargit le viewport ;
- à partir de `lg`, les KPI utilisent une grille dense.

## Modules standards

Pour chacun des huit modules :

- vérifier le header métier, la description et les actions ;
- vérifier le rail KPI ;
- vérifier les sections et accordéons ;
- vérifier que les formulaires, listes, filtres et actions historiques restent fonctionnels ;
- vérifier le comportement mobile, tablette et desktop ;
- vérifier le thème sombre.

## Notifications

### Liste

- cliquer sur le corps d'une notification non lue ;
- confirmer qu'elle devient lue ;
- confirmer que la navigation utilise la cible de la notification ;
- vérifier que le bouton d'information ouvre encore le détail ;
- vérifier les filtres et la recherche.

### Annonces

- créer une annonce ;
- ouvrir sa notification depuis un autre compte ;
- confirmer l'ouverture de l'annonce précise ;
- commenter et répondre ;
- confirmer l'ouverture et la mise en évidence du commentaire précis.

### Publications

- commenter une publication publique depuis un compte connecté ;
- ouvrir la notification reçue par l'auteur ou le parent ;
- confirmer que les commentaires sont dépliés ;
- confirmer la mise en évidence du commentaire cible.

### Support

- créer un ticket ;
- ouvrir la notification côté Support DTSC ;
- confirmer que le ticket précis est affiché et centré ;
- envoyer une réponse ;
- ouvrir la notification côté demandeur ;
- confirmer que le ticket concerné est affiché.

### Sécurité

- modifier manuellement une cible pour un objet non autorisé ;
- confirmer que les contrôles serveur habituels refusent l'accès ;
- vérifier qu'une URL externe ou `//host` n'est jamais persistée comme cible ;
- vérifier le fallback `/notifications` pour une cible absente ou invalide.

## Commentaires repliables

- Annonces : masquer et démasquer les commentaires ;
- Publications publiques : masquer et démasquer les commentaires ;
- Activités DTSC : ouvrir un détail, déplier les commentaires, ajouter/répondre/modifier/supprimer ;
- Enterprise Core : ouvrir un détail et déplier les commentaires ;
- confirmer que les fils longs restent scrollables et paginés ;
- confirmer que le focus d'un commentaire notifié force l'ouverture du fil.

## Images des annonces

- publier des images portrait, paysage et haute résolution ;
- cliquer/toucher chaque image dans le fil ;
- confirmer l'ouverture plein écran sans recadrage ;
- vérifier zoom +, zoom -, réinitialisation et fermeture ;
- vérifier Échap sur desktop ;
- vérifier le scroll interne d'une image zoomée ;
- confirmer que le scroll du fil est restauré après fermeture ;
- vérifier les safe areas Android/iOS/PWA.

## Automatisation

Exécuter :

```bash
pnpm qa:standard-experience
pnpm qa:responsive-ui
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

La PR ne doit pas être fusionnée avant le succès des jobs Quality et Migration, puis du déploiement Vercel Production sur `main`.
