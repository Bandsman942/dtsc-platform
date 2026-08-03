# Socle d’accessibilité des modules standards

Cette itération établit un socle, sans revendiquer une conformité complète non auditée.

## Exigences minimales

- landmarks et titre principal unique ;
- hiérarchie de titres cohérente ;
- labels associés aux champs ;
- descriptions et erreurs annoncées ;
- focus visible et ordre clavier logique ;
- dialogues avec titre, description, focus initial et restitution du focus ;
- boutons et icônes avec nom accessible ;
- `aria-current` dans la navigation ;
- régions live pour chargements, succès et erreurs ;
- contrastes lisibles dans les thèmes clair et sombre ;
- statut non dépendant uniquement de la couleur ;
- cibles tactiles utilisables ;
- tableaux avec en-têtes et alternative mobile.

## Écarts

Chaque itération fonctionnelle doit documenter les écarts spécifiques de son module. Une QA statique ne remplace pas un audit clavier, lecteur d’écran et contraste sur les parcours réels.
