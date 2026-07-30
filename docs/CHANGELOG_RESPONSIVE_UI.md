# Changelog — Contrat responsive global

## 2026-07-30

### Corrigé

- Correction du débordement mobile observé dans le workspace Workflows lorsque des codes techniques et des groupes d'actions élargissaient la carte au-delà du viewport.
- Renforcement de `ModuleWorkspace`, `ModuleHeader`, `ModuleToolbar`, `ModuleContent`, `ModuleSection`, `BusinessList` et `BusinessListItem` avec des largeurs réductibles et bornées.
- Ajout d'une coupure sûre des textes, identifiants, emails et URLs longs.
- Ajout d'un comportement mobile partagé pour les groupes d'actions.

### Ajouté

- Contrat racine `data-dtsc-responsive-root` appliqué à toute l'application.
- Garde-fous CSS globaux contre l'agrandissement involontaire du viewport.
- Règles scoped `app/AGENTS.md` et `components/AGENTS.md` applicables aux futurs travaux UI.
- Documentation `docs/RESPONSIVE_UI_CONTRACT.md`.
- Checklist `docs/QA_RESPONSIVE_UI_CHECKLIST.md`.
- Quality Gate `pnpm qa:responsive-ui`, intégré à `pnpm qa:regression`.

### CI/CD

- Aucun changement de schéma Prisma ou de données.
- Le workflow production-only Vercel reste inchangé.
- La livraison exige type-check, QA responsive, QA de régression, lint, build et migration-from-scratch réussis avant fusion dans `main`.
