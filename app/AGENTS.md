# AGENTS.md — Contrat responsive obligatoire des pages

Ces règles s'appliquent à toutes les pages, layouts, routes UI et feuilles de style de `app/`.

## Règles bloquantes

- Toute page nouvelle ou modifiée doit préserver le contrat racine `data-dtsc-responsive-root` défini dans `app/layout.tsx`.
- Vérifier les largeurs **320, 360, 375, 390, 414, 768 et 1024 px** avant livraison.
- Les wrappers de page et de module utilisent `w-full min-w-0 max-w-full`; aucun contenu privé ou public ne doit créer un scroll horizontal de page.
- Les grilles dynamiques utilisent `minmax(0, 1fr)` pour leurs colonnes flexibles; les enfants de `flex` et `grid` utilisent `min-w-0`.
- Les textes longs et codes techniques utilisent `overflow-wrap:anywhere`, `break-words` ou `break-all`.
- Les groupes d'actions utilisent `data-responsive-actions`, une grille mobile ou `flex-wrap`.
- Ne pas utiliser `100vw`, `w-screen` ou une largeur fixe comme solution de layout ordinaire. Réserver ces valeurs aux overlays réellement plein écran.
- Un scroll horizontal local doit être intentionnel, borné, accessible et ne jamais déplacer toute la page.
- Préserver `viewportFit`, safe areas, comportement clavier iOS, PWA standalone, navigation mobile et scroll interne des dialogues.
- Ne jamais masquer un défaut de largeur uniquement avec `overflow-x-hidden` ou `overflow-x-clip`; corriger le composant responsable.

## Validation obligatoire

```bash
pnpm qa:responsive-ui
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

Toute modification UI échouant à ce contrat est bloquante pour la PR et le déploiement.
