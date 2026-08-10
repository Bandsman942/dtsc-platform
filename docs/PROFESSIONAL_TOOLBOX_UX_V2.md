# Professional Toolbox UX V2 — Notes, Floating Action Hub et calculatrice

Statut : livraison corrective liée à l’Issue #204, renforcée par le hotfix mobile #209.

## Baseline

La contribution initiale part de `main@8157340e9353fc9a88e588538cbb7a9a7c9a3cc0`, après fusion de DTSC AI03. Le hotfix #209 repart du dernier `main@7c7fcf3ea9f6d9b773a74b5c52dae863b62b2b50`. Ces travaux ne modifient ni Prisma, ni les routes de sécurité des notes, ni les frontières multi-tenant.

## Diagnostic

### Saisie mobile des notes

L’implémentation historique utilisait un `contentEditable` dont chaque événement `input` synchronisait le HTML et le texte dans plusieurs états React, puis dans l’état du composant parent. Sur les navigateurs mobiles, cette succession de rerenders pendant la composition du clavier virtuel pouvait produire du scintillement et des déplacements de viewport/caret.

### Workflow de création

Métadonnées et contenu riche étaient affichés dans le même dialogue. Le volume de contrôles et la barre riche multi-lignes réduisaient la surface utile sur mobile et rendaient la découverte des commandes difficile.

### Régression visual viewport du hotfix #209

Après la séparation métadonnées → éditeur plein écran, le dialogue d’édition conservait encore trois contraintes concurrentes sur petit écran : un en-tête descriptif volumineux, un footer métier haut et une zone interne imposant `min-h-[24rem]` en plus d’un calcul manuel sur `dvh`. Lorsque le clavier Android réduisait `window.visualViewport`, la zone d’édition ne pouvait plus se contracter et le texte devenait presque invisible derrière les surfaces fixes.

### Floating Action Hub

Le hub était fixe mais ne réagissait pas au sens du scroll du workspace.

### Calculatrice

Le clavier historique était construit comme une liste de boutons générique. L’ordre des touches ne correspondait pas aux conventions des calculatrices usuelles et le mode financier ne couvrait que trois opérations.

## Architecture livrée

### Loader product-scoped

`components/productivity/product-scoped-professional-toolbox.tsx` charge désormais dynamiquement `ProfessionalToolboxV2` sur les hosts privés autorisés (`app`, `console`, `support`, `local`). L’ancienne implémentation reste dans le repo comme référence de rollback et n’est pas supprimée dans cette livraison.

### Notes en deux étapes

`ProfessionalToolboxV2` sépare :

1. **Informations de la note** : titre, type, priorité, statut, échéance, étiquettes et épinglage.
2. **Édition plein écran** : contenu riche uniquement, avec actions fixes de retour et d’enregistrement.

Le bouton **Valider et éditer** ne persiste rien. La persistance intervient uniquement depuis l’étape d’édition finale.

### Éditeur riche stable

`ProfessionalNoteRichEditor` est volontairement non contrôlé pendant la frappe :

- aucun `setState` React n’est déclenché à chaque caractère ;
- le contenu reste dans le DOM `contentEditable` jusqu’à la lecture via le handle impératif au moment de l’enregistrement ;
- la sélection courante est mémorisée dans un `Range` et restaurée avant une commande de formatage ;
- les boutons de toolbar empêchent le transfert de focus lors du `pointerdown` ;
- la toolbar est une ligne fixe, `flex-nowrap`, horizontalement scrollable ;
- le caret est maintenu dans le viewport interne de l’éditeur en ajustant uniquement `editor.scrollTop`, sans faire défiler la page entière.

Cette stratégie applique les principes React de stockage des valeurs transitoires très fréquentes dans des refs plutôt que dans l’état de rendu.

### Présentation immersive keyboard-safe — hotfix #209

La primitive partagée `Dialog` possède désormais une présentation explicite `editor`, utilisée par la boîte à outils au lieu d’un layout parallèle :

- la hauteur du panneau suit directement `--dtsc-dialog-visual-height`, synchronisée sur `window.visualViewport` ;
- l’en-tête devient compact sur mobile et masque uniquement le long texte d’aide, conservé sur tablette/desktop ;
- le corps du dialogue devient un conteneur `flex` sans scroll concurrent : seul l’éditeur riche gère le défilement du texte ;
- l’ancien `min-h-[24rem]` et le calcul manuel `visual-height - 10rem` sont supprimés ;
- le rail de mise en forme reste fixe en tête de l’éditeur et continue à défiler horizontalement ;
- le footer devient une grille compacte à deux actions sur mobile puis reprend une disposition desktop classique ;
- les libellés mobiles sont raccourcis sans perdre les intitulés complets sur écran plus large ;
- fermer l’éditeur revient aux informations de la note et récupère le contenu courant via le handle impératif afin d’éviter une perte accidentelle du brouillon de session ;
- l’éditeur occupe `flex-1`, `min-h-0`, sans bordure/carte imbriquée supplémentaire dans la présentation immersive.

Cette organisation rapproche l’expérience d’une application de prise de notes native : titre compact, rail de formatage, vaste zone de rédaction et commandes stables au-dessus du clavier, tout en conservant les primitives et le branding DTSC.

### Aperçu riche

La vue de détail rend le `contentHtml` déjà normalisé par le serveur dans un conteneur dédié qui conserve les titres, listes, alignements, couleurs, tailles, polices, espacements, citations, code, tableaux et liens. Aucun passage en mode Modifier n’est nécessaire pour voir la mise en forme.

### Floating Action Hub

Le provider écoute les événements de scroll en capture, ignore les dialogues et le hub lui-même, puis compare la position courante à la précédente avec un seuil de 8 px :

- déplacement vers le haut (`delta < 0`) : fermeture du menu et masquage du hub ;
- déplacement vers le bas (`delta > 0`) : réapparition du hub ;
- état initial : visible.

La visibilité utilise opacité + translation et désactive les interactions lorsqu’il est masqué.

### Calculatrice V2

Le mode Standard adopte un clavier 4 colonnes conventionnel avec `AC`, signe, pourcentage, opérateurs, chiffres, décimale et égalité.

Le mode Scientifique ajoute les fonctions sûres `sin`, `cos`, `tan`, `sqrt`, `log`, `ln`, `abs`, `pow`, les constantes `pi` et `e`, les puissances et parenthèses.

L’évaluation repose sur `SafeExpressionParser`, un parseur récursif local. `eval`, `new Function` et les appels externes sont interdits.

Le mode Financier propose :

- mensualité d’emprunt ;
- valeur future ;
- valeur actuelle ;
- CAGR ;
- ROI ;
- VAN / NPV ;
- seuil de rentabilité ;
- taux annuel effectif.

Chaque formule possède ses champs, son explication, sa formule de référence et une aide sur les hypothèses.

## Sécurité et données

- Les routes existantes `/api/toolbox/notes` et `/api/toolbox/notes/[id]` restent l’unique autorité de persistance.
- Les notes restent filtrées par `session.userId`.
- Same-origin, validation Zod, rate limit, audit et sanitisation du HTML restent inchangés.
- La calculatrice est 100 % locale et n’envoie aucune donnée à un provider externe.

## Responsive et accessibilité

- Éditeur plein écran avec `visualViewport`, `dvh` et safe areas via `Dialog`.
- Le panneau d’édition se contracte réellement lorsque le clavier logiciel réduit le viewport à 320, 360, 375, 390 ou 414 px de large.
- Aucun minimum de hauteur fixe ne peut forcer l’éditeur derrière le clavier.
- Taille de texte éditable mobile à 16 px pour éviter le zoom automatique.
- Toolbar horizontale tactile et accessible au clavier.
- Cibles principales d’au moins 40–44 px.
- Les deux actions essentielles restent compactes et visibles au bas du viewport d’édition.
- Contenus longs et formules autorisent leur propre scroll horizontal sans créer de débordement global.
- FR/EN conservés sur les nouvelles surfaces.

## QA

Le gate historique `qa-iteration-07-owner-e2e-remediation-v3.mjs` vérifie le workflow de la boîte à outils. Le gate permanent `qa:responsive-ui` vérifie désormais aussi statiquement le contrat du hotfix #209 :

- utilisation de `presentation="editor"` ;
- suppression du `min-h-[24rem]` et du calcul concurrent de hauteur ;
- conteneur d’éditeur `flex-1 min-h-0` ;
- présentation immersive portée par la primitive `Dialog` ;
- footer mobile compact à deux colonnes ;
- synchronisation sur la hauteur du visual viewport.

Les Quality Gates canoniques restent obligatoires avant merge.

## Rollback

Aucune migration n’est requise. Le rollback applicatif du hotfix #209 consiste à revert la présentation `editor` de `Dialog` et son usage dans `ProfessionalToolboxV2`. Les routes et les données de notes existantes restent compatibles.
