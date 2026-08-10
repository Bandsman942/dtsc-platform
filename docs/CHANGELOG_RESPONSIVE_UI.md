# Changelog — Contrat responsive global

## 2026-08-10

### Corrigé

- Correction urgente de la boîte à outils professionnelle sur petit écran : l’éditeur de notes ne force plus une hauteur minimale supérieure au viewport visible lorsque le clavier virtuel est ouvert.
- Ajout d’une présentation `editor` dans la primitive `Dialog`, synchronisée avec `window.visualViewport`, avec en-tête compact, corps `flex` sans scroll concurrent et footer mobile à deux actions.
- Le long texte d’aide de l’éditeur est masqué uniquement sur mobile afin de réserver la hauteur disponible à la rédaction.
- Les actions de retour et d’enregistrement utilisent des libellés compacts sur mobile et conservent leurs intitulés complets sur tablette/desktop.
- La fermeture de l’éditeur repasse par le workflow de retour aux informations afin de récupérer le brouillon courant avant de quitter la surface de rédaction.

### QA

- `qa:responsive-ui` contrôle désormais le contrat keyboard-safe de la boîte à outils : présentation immersive, suppression du `min-h-[24rem]`, suppression du calcul concurrent `visual-height - 10rem`, conteneur `flex-1 min-h-0` et footer mobile compact.

### CI/CD

- Aucun changement Prisma, API, isolation multi-tenant ou persistance des notes.
- Production reste exclusivement issue de `main` après PR et Quality Gates verts.

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
