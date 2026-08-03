# Éditeur de contenu riche partagé DTSC

## Objectif

`components/ui/rich-text-editor.tsx` est la primitive commune pour les futures zones de rédaction de texte, d’images et de vidéos. Une itération métier ne doit pas créer un éditeur parallèle sans justification architecturale.

## Capacités

- paragraphes, titres H1 à H3, citations et blocs de code ;
- gras, italique, souligné, barré, surlignage et couleurs contrôlées ;
- liens ajoutés ou retirés, domaines automatiquement reconnus à l’affichage ;
- listes à puces, numérotées, alphabétiques, tâches et tirets ;
- retraits, alignements gauche/centre/droite/justifié ;
- tableaux responsives, séparateurs, émojis, annuler et rétablir ;
- images optimisées, téléversées et supprimables ;
- vidéos directes HTML5 ou cartes de lien sûres quand l’URL n’est pas un média direct.

## Sécurité

Le HTML affiché passe par `sanitizeRichHtml`. Les scripts, styles injectés, iframes, objets, embeds, gestionnaires d’événements, `javascript:` et `data:text/html` sont supprimés. Les liens externes s’ouvrent avec `noopener noreferrer nofollow`.

Les vidéos arbitraires ne sont pas injectées sous forme d’iframe. Une URL MP4, WebM ou OGG peut produire un lecteur HTML5; les autres adresses restent des cartes de lien explicites.

## Réutilisation

La primitive est activée dans les annonces avec images et vidéos. Les prochaines itérations doivent la réutiliser pour les contenus éditoriaux qui exigent une mise en forme riche, tout en adaptant les permissions, les endpoints média et les limites métier.
