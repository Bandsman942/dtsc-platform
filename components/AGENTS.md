# AGENTS.md — Contrat responsive obligatoire des composants

Ces règles s'appliquent à tous les composants de `components/` et de ses sous-dossiers, pour chaque nouveau sprint, correctif ou refactor.

## Règles bloquantes

- Tout composant nouveau ou modifié doit rester utilisable sans débordement horizontal de page aux largeurs de référence **320, 360, 375, 390, 414, 768 et 1024 px**.
- Tout enfant direct d'un conteneur `flex` ou `grid` susceptible de rétrécir doit utiliser `min-w-0`; les surfaces principales doivent aussi utiliser `max-w-full`.
- Une grille mono-colonne contenant des données dynamiques doit déclarer `grid-cols-[minmax(0,1fr)]`. Toute colonne flexible d'une grille composée doit utiliser `minmax(0, 1fr)` plutôt que `1fr` seul lorsque son contenu peut être long.
- Les identifiants, emails, URLs, codes métier et textes sans espaces doivent pouvoir se couper avec `overflow-wrap:anywhere`, `break-words` ou `break-all` selon la sémantique. Ne jamais laisser un code technique agrandir le viewport.
- Les groupes d'actions doivent utiliser `data-responsive-actions`, une grille mobile ou `flex-wrap`. Aucun groupe de boutons ne peut dépendre d'une largeur desktop.
- `w-screen`, `100vw`, les `min-width` fixes et les largeurs en pixels supérieures au viewport sont interdits pour le contenu ordinaire. Ils ne sont acceptés que pour un vrai overlay plein écran documenté.
- Le scroll horizontal est interdit au niveau de la page. Un scroll horizontal local n'est accepté que pour un contenu qui l'exige réellement, dans un conteneur borné et accessible.
- Les formulaires, listes, cartes, dialogues, tableaux et médias doivent rester `min-w-0`/`max-w-full`; les dialogues et formulaires longs gardent un scroll interne et les safe areas.
- Réutiliser `components/workspace/*`, `components/ui/*` et le contrat racine `data-dtsc-responsive-root` avant de créer une nouvelle structure responsive parallèle.
- Ne jamais considérer `overflow-x-hidden` ou `overflow-x-clip` comme la correction unique d'un composant trop large: corriger aussi sa grille, ses enfants flexibles, ses textes longs et ses actions.

## Validation obligatoire

Avant commit et push d'une modification UI:

```bash
pnpm qa:responsive-ui
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

Une PR UI ne doit pas être fusionnée si le contrat responsive ou l'un de ces Quality Gates échoue.
