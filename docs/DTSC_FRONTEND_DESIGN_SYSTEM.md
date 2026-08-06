# DTSC Frontend Design System

## Objectif

Le design system DTSC fournit un socle commun à Public, Account, App, Console et Support. Il ne remplace pas les composants métiers : il stabilise leur langage visuel, leur contraste et leur comportement responsive.

## Tokens sémantiques

Les tokens sont définis dans `app/design-system.css`. Les composants doivent utiliser les rôles `brand`, `background`, `surface`, `text`, `border`, `focus`, `success`, `warning`, `danger` et `info`, plutôt que de répéter des valeurs hexadécimales.

Les accents produits restent légers : Public bleu, Account cyan, App bleu, Console indigo, Support vert. La marque mère conserve DTSC Navy, DTSC Blue et DTSC Cyan.

## Typographie

L’échelle canonique comprend Display, H1, H2, H3, Body large, Body, Body small, Label et Caption. Les titres n’utilisent plus systématiquement le poids maximal ; la hiérarchie dépend aussi de la taille, de l’espacement et du contraste.

## Espacement, rayons et ombres

Les rayons sont limités aux rôles control, card, panel, modal, hero et pill. Les ombres `sm`, `md`, `lg`, `focus` et `floating` restent sobres et ne doivent pas remplacer une hiérarchie de contenu claire.

## Motion

Les durées `fast`, `normal` et `slow` utilisent les courbes `standard` ou `emphasized`. `prefers-reduced-motion` désactive les animations et transitions non essentielles. Aucun contenu ne dépend d’une animation pour devenir visible.

## Accessibilité

Tout contrôle interactif possède un nom accessible, un focus visible et une cible mobile suffisante. Le système doit rester utilisable à 320 px, au zoom 200 % et sans souris.
