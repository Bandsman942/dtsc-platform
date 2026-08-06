# Guide utilisateur — Annonces
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Annonces** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

Créez une annonce, choisissez son audience autorisée et publiez-la ou conservez-la en brouillon. La programmation n’est proposée que si un service fiable existe. Les brouillons ne sont pas visibles par le public ciblé.

Les images publiées s’ouvrent dans la visionneuse plein écran. Selon vos droits, vous pouvez modifier, archiver, épingler, commenter, réagir ou signaler. Un lien de notification ouvre l’annonce exacte.

## Liens, hashtags et partage

Les hashtags sont affichés comme des liens bleus. Un clic sur `#sujet` remplit la recherche et filtre les annonces contenant le même hashtag. Les adresses commençant par `http://`, `https://`, `www.` et les noms de domaine reconnaissables ouvrent le site dans un nouvel onglet sécurisé.

Le menu contextuel propose **Partager**. Sur un appareil compatible, la feuille de partage native est utilisée; sinon le lien canonique de l’annonce est copié.

## Édition riche partagée

La zone de rédaction permet les titres, citations, blocs de code, liens, listes avancées, tâches, retraits, alignements, couleurs, polices, tailles, tableaux, séparateurs, émojis, annuler/rétablir, images optimisées et vidéos. Cette primitive est commune aux futures zones éditoriales DTSC.

## Accès et permissions

- Ouvrez le module depuis la navigation du contexte actif.
- Les boutons et actions dépendent du rôle, du poste officiel, des permissions individuelles, du tenant actif et de l’état du module.
- Une action masquée dans l’interface reste également refusée par le serveur lorsqu’elle n’est pas autorisée.
- Sur mobile, utilisez le parcours liste → détail plein écran → formulaire plein écran → retour.

## Statuts, validations et traçabilité

- Les statuts visibles correspondent aux états réellement persistés ; les codes techniques ne sont pas présentés comme libellés métier.
- Les validations, refus, annulations, réouvertures et actions sensibles conservent leur auteur, leur date et, lorsque requis, leur motif.
- Une action répétée avec la même clé métier ne doit pas produire de doublon ni un second impact.

## Sécurité et confidentialité

- Les données sont limitées à l’utilisateur ou à l’organisation autorisée.
- Les références reçues du navigateur sont revérifiées côté serveur dans le même contexte.
- Les documents et informations sensibles utilisent les routes privées et les contrôles d’accès prévus par le module.

## Dépannage

- Actualisez la vue si une opération validée n’apparaît pas immédiatement.
- Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau.
- En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.
