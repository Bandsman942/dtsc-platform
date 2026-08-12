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

### Boutons partagés

Le composant `Button` ne doit jamais combiner `whitespace-normal` avec une hauteur fixe qui coupe un libellé traduit ou métier.

Le contrat est :

- hauteur automatique ;
- `min-height` tactile ;
- texte multiligne autorisé lorsque nécessaire ;
- états `hover`, `focus-visible`, `active/pressed`, `disabled` perceptibles ;
- bouton icon-only avec nom accessible ;
- CTA mobile courte lorsqu'une action principale peut être formulée sans perte de sens.

Un bouton qui tient en français mais déborde en anglais — ou l'inverse — est une régression responsive et i18n.

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

Sur les headers de module mobiles :

- une action primaire peut rester directement visible ;
- l'actualisation peut être icon-first ;
- plusieurs actions secondaires utilisent une divulgation progressive (`…`) au lieu d'empiler trois ou quatre boutons pleine largeur ;
- les actions restent toutes accessibles au clavier et au lecteur d'écran.

### Scroll horizontal

Le scroll horizontal de page est interdit. Un scroll local reste autorisé pour :

- une bande de KPI ;
- une table réellement large ;
- une timeline ou un carrousel explicitement conçu pour ce comportement ;
- un rail système mobile borné, par exemple le sélecteur d'espace lorsque plusieurs contrôles doivent rester accessibles.

Le conteneur doit être borné, accessible au clavier/tactile et ne jamais déplacer le header ou la navigation globale. Les rails tactiles utilisent `data-horizontal-rail`, `data-professional-tabs` ou le contrat équivalent afin de déclarer clairement la priorité au pan horizontal local.

### Valeurs interdites dans le contenu ordinaire

- `w-screen` ;
- `width: 100vw` ;
- `min-width` fixe supérieure à la largeur mobile ;
- largeur en pixels imposée à une carte ou un formulaire ;
- masquage d'un bug uniquement avec `overflow-x-hidden`.

Ces valeurs restent possibles pour un overlay réellement plein écran et documenté.

## Shell mobile : une hiérarchie, pas deux navigations concurrentes

Le shell mobile privé sépare désormais deux responsabilités :

### Barre supérieure

Elle contient uniquement le chrome système nécessaire :

- identité DTSC / produit ;
- actualisation contextuelle ;
- thème ;
- notifications ;
- avatar ;
- sélecteur d'espace lorsque disponible ;
- déconnexion.

Elle ne réénumère pas les grands groupes de navigation.

### Barre inférieure

`data-mobile-bottom-nav` reste la navigation primaire entre les grands groupes autorisés :

- Pilotage ;
- IA & équipe ;
- Entreprise ;
- Compte ;
- DTSC interne uniquement si le serveur permet réellement ce groupe.

Le même compteur ne doit pas être reproduit artificiellement dans plusieurs contrôles. Par exemple, le nombre global de notifications reste porté par la cloche ; le groupe Pilotage n'affiche pas une seconde copie de ce `99+`.

Le contenu principal doit conserver une marge basse suffisante pour ne jamais être recouvert par la barre fixe, y compris avec les safe areas.

## Navigation gestuelle entre grands groupes

Sur mobile, un balayage horizontal peut compléter la barre inférieure pour passer au groupe précédent/suivant. Il ne remplace jamais les liens canoniques `/modules?group=...` et n'accorde aucun droit supplémentaire.

Le composant partagé `MobileGroupSwipeNavigation` applique les règles suivantes :

- actif uniquement sous le breakpoint desktop ;
- seuil horizontal explicite avant navigation ;
- dominance horizontale sur le déplacement vertical ;
- durée maximale afin d'éviter d'interpréter un long geste ambigu ;
- zone de garde près des bords gauche/droit afin de ne pas concurrencer les gestes navigateur/système ;
- aucune utilisation de `preventDefault()` pour prendre le contrôle du geste système ;
- destination calculée uniquement parmi les groupes réellement visibles pour l'utilisateur.

### Gestes qui ne doivent jamais être interceptés

Un swipe démarré sur ou dans l'un des éléments suivants reste à son propriétaire :

- `a`, `button`, `input`, `textarea`, `select`, `label` ;
- `contenteditable` ;
- dialog ;
- éditeur / textbox / combobox ;
- `summary/details` ;
- rail horizontal ;
- tabs ;
- navigation secondaire ;
- sélecteur d'espace ;
- tout conteneur dont le contenu est réellement horizontalement scrollable ;
- élément explicitement marqué `data-no-group-swipe`.

Le swipe global doit donc commencer sur une zone de contenu neutre. Une interaction métier ne peut pas devenir accidentellement une navigation.

## i18n et responsive sont un seul contrat

Une traduction peut être plus longue que la langue de référence. Toute surface FR/EN doit être testée avec les deux dictionnaires.

Ne pas résoudre une traduction longue en :

- réduisant excessivement la taille de police ;
- tronquant une CTA dont le sens est nécessaire ;
- imposant une hauteur fixe ;
- cachant le débordement.

Préférer : libellé métier plus court, retour à la ligne, action icon-first correctement accessible ou menu secondaire.

Les dates/heures visibles utilisent la locale active plutôt qu'une locale codée en dur.

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

## QA statique et validation rendue

Le script suivant vérifie que le contrat global, les primitives, les règles scoped AGENTS et la documentation restent présents :

```bash
pnpm qa:responsive-ui
```

La gate responsive exécute également `scripts/qa-experience-debt-closure.mjs`, qui protège les invariants i18n, Button, shell mobile, swipe et gouvernance anti-dette de l'itération #251.

Elle est incluse dans `pnpm qa:regression`.

**Important :** une QA statique ne prouve pas à elle seule le rendu. Une modification UI matérielle exige aussi la validation navigateur/E2E prévue par `docs/CONTRIBUTING.md`. Un grep peut confirmer qu'une classe existe ; il ne peut pas confirmer qu'un bouton de trois lignes n'est pas coupé sur Samsung Internet.

Une modification UI ne doit pas être fusionnée si le contrôle responsive, le type-check, le lint, le build ou les E2E requis échouent.

## Critères de recette

Une page est conforme lorsque :

1. le viewport ne présente aucun scroll horizontal global ;
2. aucun titre, identifiant ou bouton important n'est coupé ;
3. les actions restent visibles et tactiles ;
4. les formulaires restent entièrement accessibles ;
5. les listes et détails rétrécissent sans agrandir la page ;
6. les overlays respectent le clavier et les safe areas ;
7. le comportement desktop reste dense et lisible ;
8. la langue active ne mélange pas des libellés FR/EN dans les surfaces couvertes ;
9. la navigation primaire mobile n'est pas dupliquée en haut et en bas ;
10. un swipe global n'intercepte jamais un contrôle ou un rail horizontal ;
11. les badges ne dupliquent pas le même signal sans raison ;
12. `pnpm qa:responsive-ui` et les Quality Gates passent ;
13. les E2E visuels requis par le changement ont une preuve explicite.
