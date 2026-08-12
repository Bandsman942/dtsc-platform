# Issue #257 — Swipe mobile fluide entre groupes

## Intention produit

Le swipe gauche/droite complète la barre de navigation inférieure sans la remplacer. Sur mobile, l'utilisateur doit percevoir la continuité spatiale entre deux grands groupes : le contenu courant suit le doigt, quitte l'écran dans le sens du geste validé, puis le groupe réellement navigué entre depuis le côté opposé.

## Modèle d'interaction

1. Le geste ne démarre que dans une zone neutre, hors bords système et hors contrôles interactifs.
2. Tant que l'intention horizontale n'est pas claire, le composant ne transforme pas la page et laisse le scroll vertical fonctionner normalement.
3. Une fois l'intention horizontale établie, la surface `.dtsc-private-main` suit le doigt avec `transform`, sans reflow du shell.
4. Une destination adjacente autorisée est préchargée.
5. Un geste insuffisant déclenche un retour souple à zéro.
6. Un geste validé par distance ou vélocité termine la sortie de la surface courante.
7. Après la navigation canonique, la nouvelle surface entre depuis le côté opposé.
8. Aux extrémités, une résistance courte remplace toute navigation inexistante.

## Stabilité du shell

Le header mobile, la barre inférieure, les safe areas et les contrôles système ne sont pas déplacés. Seule la surface principale est animée, ce qui évite une sensation de page entière arrachée et conserve les repères de navigation.

## Accessibilité et préférences système

`prefers-reduced-motion: reduce` supprime les animations décoratives de sortie/entrée et conserve la navigation fonctionnelle. Aucun `preventDefault()` global n'est utilisé : les gestes système et le scroll vertical restent prioritaires.

## Zones exclues

Les formulaires, liens, boutons, dialogues, éditeurs, rails horizontaux, onglets professionnels, sélecteurs de contexte, zones scrollables horizontalement et éléments `data-no-group-swipe` conservent leur propre geste.

## Validation

La QA source `scripts/qa-smooth-mobile-group-swipe.mjs` est exécutée via `scripts/qa-responsive-ui-contract-checks.mjs`, donc via la régression canonique. Elle vérifie la présence du drag-follow, du snap-back, de la sortie/entrée directionnelle, du reduced motion et des exclusions.

La QA statique ne prouve pas la sensation tactile. Avant fusion, la recette sur appareil réel doit vérifier au minimum : swipe gauche, swipe droite, geste annulé, scroll vertical, rails horizontaux, extrémités de liste, thème clair/sombre, PWA et Samsung Internet.

## Dette de contribution

- Dette créée : Aucune.
- Dette maintenue : #252 et #253, hors périmètre.
- Dette remboursée : transition brutale issue du premier swipe de #251.
- Dette reportée : Aucune.
