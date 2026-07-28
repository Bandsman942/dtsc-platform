# Régression iPhone — clavier virtuel et navigation mobile

Date : 2026-07-28

## Symptômes reproduits

L'enregistrement utilisateur fourni sur iPhone montre deux symptômes dans le même parcours mobile DTSC :

1. dans une modale métier longue (`Activités DTSC` → `Formuler une demande`), un champ de saisie peut recevoir visuellement le focus sans que le clavier logiciel apparaisse ;
2. après les transitions focus/clavier/chrome navigateur, la navigation mobile basse peut être peinte nettement au-dessus du bas réel de l'écran, jusqu'au milieu de la zone visible.

L'enregistrement est une reproduction **avant correction**. Il ne constitue pas une validation iPhone post-correctif.

## Cause technique retenue

La régression ne provient pas du formulaire Activités lui-même : ses champs texte et `textarea` ne sont ni `disabled`, ni `readOnly`, ni configurés avec `inputMode="none"`.

La cause est transversale à la fondation mobile :

- le `Dialog` partagé observait `window.visualViewport` et réinjectait `height` **et `offsetTop`** dans un state React à chaque événement `resize`/`scroll` ;
- l'overlay entier pouvait donc être repositionné pendant l'animation du clavier ou du chrome navigateur ;
- les contrôles éditables recevaient globalement `touch-action: manipulation` ;
- `PrivateMobileChromeController` interprétait les `resize`/`scroll` clavier comme des événements de navigation/page ;
- la barre mobile basse est un élément `position: fixed` animé, et la couche globale utilisait `transform`, `filter` et `will-change: transform` pour son masquage/affichage.

Cette combinaison est fragile sur WebKit/iOS récent : le viewport visuel peut être transitoirement décalé ou retardé pendant l'ouverture/fermeture du clavier, et les éléments `position: fixed` peuvent être peints par rapport à une ancienne référence de viewport.

## Correctif DTSC

### Dialog partagé

- `visualViewport.offsetTop` n'est plus utilisé pour déplacer l'overlay ;
- les événements `visualViewport` ne déclenchent plus de rerendu React du champ focalisé ;
- seule la hauteur visible est propagée via une variable CSS sur le DOM ;
- aucun `.focus()` synthétique n'est utilisé ;
- le tap utilisateur reste le geste natif qui doit ouvrir le clavier/picker ;
- le scroll interne du dialog ajuste seulement la visibilité du contrôle déjà focalisé ;
- le backdrop ferme au `click`, pas au `pointerdown`.

### Contrôles de formulaire

- la règle 16 px anti-zoom Safari est conservée ;
- les champs éditables (`input`, `textarea`, `select`, `contenteditable`, textbox/combobox) reviennent à `touch-action: auto` ;
- `touch-action: manipulation` reste réservé aux boutons/liens/actions tactiles.

### Navigation mobile

Pendant qu'un champ éditable est actif :

- `PrivateMobileChromeController` suspend le traitement de `scroll` et `resize` comme signal de collapse/navigation ;
- la navigation basse est masquée jusqu'à la fin de la transition de clavier/picker ;
- le retour entre deux champs n'affiche pas brièvement la navigation entre les focus.

La navigation basse ne doit plus dépendre d'une translation `transform` ou d'un `backdrop-filter` pendant les transitions de viewport mobile. Son masquage se fait par `opacity`/`visibility`.

## Invariants

- Ne jamais forcer l'ouverture du clavier par un hack JavaScript.
- Ne jamais appeler `preventDefault()` sur le geste de saisie d'un champ pour corriger iOS.
- Ne pas déplacer un dialog complet avec `visualViewport.offsetTop` pendant la saisie.
- Ne pas laisser les `resize` clavier piloter l'auto-collapse de la navigation privée.
- Une barre `position: fixed` critique ne doit pas dépendre d'un `transform` pour son ancrage pendant les transitions clavier/chrome iOS.
- Conserver les safe areas, le `viewport-fit=cover`, les contrôles à 16 px et le scroll interne des dialogs.

## QA source-level

`pnpm qa:mobile` contrôle désormais notamment :

- absence d'usage de `visualViewport.offsetTop` dans le Dialog partagé ;
- absence de focus synthétique ou `preventDefault()` ;
- `touch-action: auto` pour les champs éditables ;
- suspension du chrome mobile pendant `focusin`/`focusout` ;
- absence de transform/backdrop sur la navigation basse pendant le clavier ;
- conservation des protections Select, ActionMenu et PWA du Sprint 1.

## Incident Preview Vercel constaté pendant la correction

La branche a été volontairement ramenée temporairement à un arbre de fichiers **strictement identique à `main`** pour distinguer une erreur de code d'une erreur du pipeline Preview.

Probe : `dba3f468c0fb00f1d960bc1af914aea88d9550a3`.

Résultat GitHub `compare main...fix/ios-keyboard-viewport-navigation` à ce point : aucun fichier modifié.

Résultat Vercel Preview : `Error` malgré ce zéro diff.

Le `vercel.json` du repository utilise :

```text
pnpm prisma migrate deploy && pnpm build
```

Ce probe prouve que le statut Preview rouge observé pendant ce chantier n'est pas un signal permettant d'attribuer l'échec au diff iOS. L'environnement ou le pipeline Preview doit être diagnostiqué séparément ; il ne faut ni masquer cette anomalie, ni modifier artificiellement le code mobile pour tenter de la faire disparaître.

## Matrice manuelle iPhone à exécuter après déploiement

Tester au minimum à 375, 390 et 414 px lorsque l'appareil le permet :

1. ouvrir `Activités DTSC` ;
2. ouvrir `Formuler une demande` ;
3. toucher `Objet de la demande` : clavier visible et saisie possible ;
4. toucher `Collaborateur destinataire` : picker/list déroulante utilisable ;
5. faire défiler jusqu'à `Message détaillé` ;
6. toucher le `textarea` : clavier visible sans perte de focus ;
7. passer d'un champ à un autre ;
8. fermer le clavier ;
9. fermer la modale ;
10. vérifier que la navigation DTSC reste au bas de l'écran et ne remonte pas au milieu ;
11. refaire le parcours après changement d'orientation quand pertinent ;
12. refaire le parcours dans Safari/PWA et, si le lien est ouvert depuis un navigateur embarqué, dans ce contexte WebKit également.

## Limites

Même avec une implémentation DTSC correcte, l'application ne peut pas garantir le comportement interne du clavier logiciel iOS. Les bugs WebKit connus doivent être traités par feature detection et réduction des interactions avec le viewport, pas par browser sniffing ou timers agressifs.

Ne jamais écrire « test iPhone réussi » tant qu'un appareil réel n'a pas exécuté le parcours post-correctif.