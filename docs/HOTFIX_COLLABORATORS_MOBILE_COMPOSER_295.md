# Hotfix #295 — compositeur mobile Mes Collaborateurs

Base : `main@f6cf6ad3a9ee94e7ebf6b0eb85cb1e3645970ba4`.

## Régression observée

Les captures OWNER du 14 août 2026 montrent qu’un brouillon multi-ligne dans **Mes Collaborateurs** transforme le compositeur en grande ellipse et réduit fortement la surface du fil, en particulier lorsque le clavier virtuel est ouvert.

## Cause racine

Le polish immersif appliquait `border-radius: 9999px` au formulaire du compositeur. Ce rayon est adapté à une saisie mono-ligne, mais devient une ellipse lorsque le `textarea` auto-grandit. La primitive de saisie autorise par ailleurs une croissance verticale importante avant scroll interne.

## Correctif

- remplacer la capsule forcée par un rectangle arrondi (`1.25rem`, `1.15rem` sur mobile) ;
- borner la zone de texte du compositeur immersif à `6rem` ;
- activer le scroll interne du `textarea` au-delà de cette hauteur ;
- conserver les contrôles IA, vocal, envoi, réponse et pièce jointe ;
- conserver `env(safe-area-inset-bottom)` ;
- conserver le hook `useImmersiveConversationViewport`, qui suit `window.visualViewport` lors de l’ouverture/fermeture du clavier mobile ;
- ne pas masquer le problème avec un `overflow-x-hidden` global.

## QA

`scripts/qa-collaborators-mobile-composer-295.mjs` protège :

- l’absence du rayon elliptique `9999px` sur le formulaire ;
- la hauteur maximale et le scroll interne ;
- la safe-area ;
- le contrat d’autosize/accessibilité de `VoiceConversationComposer` ;
- le contrat `VisualViewport` utilisé pour le clavier.

OWNER_E2E reste requis sur mobile réel avant merge.
