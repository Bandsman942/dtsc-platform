# QA — Contrat responsive global DTSC Platform

## Contrôles automatiques

- [ ] `pnpm qa:responsive-ui`
- [ ] `pnpm qa:regression`
- [ ] `pnpm type-check`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] `git diff --check`
- [ ] migrations-from-scratch inchangées ou réussies si le pipeline les exécute

## Viewports obligatoires

Tester les interfaces nouvelles ou modifiées à :

- [ ] 320 px
- [ ] 360 px
- [ ] 375 px
- [ ] 390 px
- [ ] 414 px
- [ ] 768 px
- [ ] 1024 px

## Scénarios visuels

- [ ] Aucun scroll horizontal de page.
- [ ] Les identifiants et références longues se coupent sans agrandir le viewport.
- [ ] Les titres et descriptions ne sont pas masqués sous un bouton ou un badge.
- [ ] Les groupes d'actions reviennent à la ligne ou passent en grille sur mobile.
- [ ] Les listes, détails et formulaires restent dans la largeur du parent.
- [ ] Les champs de formulaire restent accessibles avec le clavier mobile ouvert.
- [ ] Les dialogues longs utilisent un scroll interne.
- [ ] Les safe areas haute et basse sont préservées en PWA standalone.
- [ ] Les menus et overlays ne sont pas coupés sur les bords.
- [ ] Le thème clair et le thème sombre restent lisibles.
- [ ] Les libellés FR et EN longs sont vérifiés.
- [ ] Les états vide, chargement, erreur et données nombreuses restent conformes.

## Scénario de non-régression Workflows

- [ ] Ouvrir `Workflows` sur un mobile étroit.
- [ ] Ouvrir le workflow `REQUEST_MANAGER_APPROVAL`.
- [ ] Vérifier que le code long reste dans la carte.
- [ ] Vérifier que le titre et la description restent entièrement contenus.
- [ ] Vérifier que `Étape`, `Transition`, `Enregistrer` et `Publier` restent visibles et tactiles.
- [ ] Vérifier que les étapes et transitions ne créent pas une largeur supplémentaire.
- [ ] Vérifier la timeline et les dialogues d'édition avec le clavier ouvert.

## Critère de sortie

La livraison est bloquée tant qu'un débordement horizontal global, une action coupée ou un Quality Gate en échec subsiste.
