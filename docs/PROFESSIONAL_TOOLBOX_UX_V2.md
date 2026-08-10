# Professional Toolbox UX V2 — Notes, Floating Action Hub et calculatrice

Statut : livraison corrective liée à l’Issue #204.

## Baseline

La contribution part de `main@8157340e9353fc9a88e588538cbb7a9a7c9a3cc0`, après fusion de DTSC AI03. Elle ne modifie ni Prisma, ni les routes de sécurité des notes, ni les frontières multi-tenant.

## Diagnostic

### Saisie mobile des notes

L’implémentation historique utilisait un `contentEditable` dont chaque événement `input` synchronisait le HTML et le texte dans plusieurs états React, puis dans l’état du composant parent. Sur les navigateurs mobiles, cette succession de rerenders pendant la composition du clavier virtuel pouvait produire du scintillement et des déplacements de viewport/caret.

### Workflow de création

Métadonnées et contenu riche étaient affichés dans le même dialogue. Le volume de contrôles et la barre riche multi-lignes réduisaient la surface utile sur mobile et rendaient la découverte des commandes difficile.

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

- Éditeur plein écran avec `dvh` et safe areas via `Dialog`.
- Taille de texte éditable mobile à 16 px pour éviter le zoom automatique.
- Toolbar horizontale tactile et accessible au clavier.
- Cibles principales d’au moins 40–44 px.
- Contenus longs et formules autorisent leur propre scroll horizontal sans créer de débordement global.
- FR/EN conservés sur les nouvelles surfaces.

## QA

Le gate existant `qa-iteration-07-owner-e2e-remediation-v3.mjs` est étendu pour vérifier statiquement :

- le chargement de V2 ;
- le workflow métadonnées → éditeur ;
- l’éditeur non contrôlé et le maintien du caret ;
- le rendu riche ;
- la logique de scroll du Floating Action Hub ;
- l’absence d’exécution dynamique dans la calculatrice ;
- la présence des nouvelles formules financières.

Les Quality Gates canoniques restent obligatoires avant merge.

## Rollback

Aucune migration n’est requise. Le rollback applicatif consiste à rétablir le loader product-scoped vers `professional-toolbox.tsx` et à revert les changements du Floating Action Hub. Les données de notes existantes restent compatibles.
