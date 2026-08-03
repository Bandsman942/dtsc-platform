# Contrat responsive des modules standards

## Largeurs de validation

320, 360, 375, 390, 414, 768, 1024, 1280 et 1440 px.

## Invariants

- aucun débordement horizontal global ;
- `min-w-0` sur les conteneurs flex/grid sensibles ;
- KPIs, tabs, filtres, actions secondaires et cartes condensées utilisent un rail horizontal tactile lorsque nécessaire ;
- le rail conserve `overflow-x-auto`, `touch-pan-x`, `flex-nowrap` et des éléments `shrink-0` ;
- les tableaux utilisent une stratégie responsive explicite ;
- les dialogues et drawers restent scrollables dans la hauteur utile ;
- les longs formulaires deviennent plein écran sur mobile ;
- le clavier mobile ne masque pas l’action principale ;
- les safe areas sont respectées ;
- les textes longs reviennent à la ligne ;
- aucune action essentielle ne dépend du survol.

## Parcours mobile

Pour les objets métier longs : liste → détail plein écran → formulaire plein écran → retour. Les actions secondaires passent par un menu contextuel accessible.

## Vérification

L’audit mobile réutilise le contrat de `ModuleMetrics` et les primitives `components/workspace/*`. Les validations visuelles restent à exécuter manuellement selon `MANUAL_E2E_STANDARD_MODULES_ITERATION_01.md`.
