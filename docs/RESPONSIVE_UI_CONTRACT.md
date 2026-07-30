# Contrat responsive obligatoire — DTSC Platform

## Objectif

Toutes les interfaces DTSC Platform doivent rester utilisables sur mobile, PWA, tablette et desktop sans créer de deuxième largeur de page, masquer des actions ou couper des contenus importants.

Ce contrat s'applique à chaque nouvelle page, chaque composant ajouté et chaque refactor UI. Il complète l'architecture workspace et les règles mobile/iOS existantes.

## Couche globale

`app/layout.tsx` porte l'attribut `data-dtsc-responsive-root`. La feuille `app/mobile-stability.css` applique alors des garde-fous à l'ensemble de l'application :

- largeur racine bornée à `100%` ;
- `min-width: 0` sur les structures courantes ;
- largeur maximale des surfaces principales bornée au parent ;
- coupure des identifiants, URLs, emails et textes longs avec `overflow-wrap:anywhere` ;
- contrôles et médias limités à la largeur disponible ;
- fallback `overflow-x: hidden` lorsque `overflow-x: clip` n'est pas supporté.

Cette couche évite qu'un contenu dynamique agrandisse le viewport. Elle ne remplace pas la correction locale d'une mauvaise grille ou d'un groupe d'actions non responsive.

## Primitives partagées

Les primitives `ModuleWorkspace`, `ModuleHeader`, `ModuleToolbar`, `ModuleContent`, `ModuleSection`, `BusinessList` et `BusinessListItem` imposent :

- `w-full min-w-0 max-w-full` ;
- `overflow-x-clip` uniquement sur leurs surfaces de page ;
- des colonnes flexibles basées sur `minmax(0, 1fr)` ;
- des textes dynamiques capables de se couper ;
- des en-têtes et actions pouvant revenir à la ligne sur mobile.

Les actions de header ou toolbar utilisent `data-responsive-actions`. Sous 480 px, elles passent en grille de deux colonnes `minmax(0, 1fr)` ; au-dessus, elles restent en groupe flexible et peuvent se répartir sur plusieurs lignes.

## Règles de composition

### Flex et grid

Tout enfant qui doit pouvoir rétrécir utilise `min-w-0`. Une grille mono-colonne avec contenu dynamique utilise :

```tsx
<div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
```

Dans une grille composée, chaque colonne flexible utilise `minmax(0, 1fr)`.

### Textes longs

Les codes techniques, références, emails, URLs et titres provenant de la base peuvent être plus longs que prévu. Utiliser selon le cas :

```tsx
className="break-words [overflow-wrap:anywhere]"
```

ou `break-all` pour un identifiant purement technique. Ne pas utiliser `whitespace-nowrap` sur un texte métier qui peut varier.

### Actions

Un groupe d'actions ne doit jamais forcer une largeur desktop sur mobile. Utiliser :

```tsx
<div data-responsive-actions>
  ...
</div>
```

ou une grille mobile explicite puis `sm:flex sm:flex-wrap`.

### Scroll horizontal

Le scroll horizontal de page est interdit. Un scroll local reste autorisé pour :

- une bande de KPI ;
- une table réellement large ;
- une timeline ou un carrousel explicitement conçu pour ce comportement.

Le conteneur doit être borné, accessible au clavier/tactile et ne jamais déplacer le header ou la navigation globale.

### Valeurs interdites dans le contenu ordinaire

- `w-screen` ;
- `width: 100vw` ;
- `min-width` fixe supérieure à la largeur mobile ;
- largeur en pixels imposée à une carte ou un formulaire ;
- masquage d'un bug uniquement avec `overflow-x-hidden`.

Ces valeurs restent possibles pour un overlay réellement plein écran et documenté.

## Largeurs de référence

Toute interface nouvelle ou modifiée doit être vérifiée au minimum à :

- 320 px ;
- 360 px ;
- 375 px ;
- 390 px ;
- 414 px ;
- 768 px ;
- 1024 px.

Les tests doivent couvrir thème clair/sombre, PWA standalone, clavier mobile, safe areas, textes longs, langue française et anglaise, état vide, état chargé et permissions différentes.

## Quality Gate

Le script suivant vérifie que le contrat global, les primitives, les règles scoped AGENTS et la documentation restent présents :

```bash
pnpm qa:responsive-ui
```

Il est inclus dans `pnpm qa:regression`. Une modification UI ne doit pas être fusionnée si ce contrôle, le type-check, le lint ou le build échoue.

## Critères de recette

Une page est conforme lorsque :

1. le viewport ne présente aucun scroll horizontal global ;
2. aucun titre, identifiant ou bouton important n'est coupé ;
3. les actions restent visibles et tactiles ;
4. les formulaires restent entièrement accessibles ;
5. les listes et détails rétrécissent sans agrandir la page ;
6. les overlays respectent le clavier et les safe areas ;
7. le comportement desktop reste dense et lisible ;
8. `pnpm qa:responsive-ui` et les Quality Gates passent.
