# UX-07A — Densité d'affichage des espaces ERP (#947)

Ce lot est le pilote du Design System 2.0 suivi dans [#942](https://github.com/Bandsman942/dtsc-platform/issues/942).

## Contrat

`ModuleWorkspace` et `ModuleContent` disposent désormais d'une prop optionnelle `density="comfortable" | "compact"`. La valeur par défaut reste `comfortable` et conserve les espacements déjà livrés. Aucun module existant ne change d'apparence sans adoption explicite.

- `comfortable` : espacement standard des surfaces, adapté aux fiches et aux longs formulaires.
- `compact` : espacement réduit, utile aux tableaux de bord et opérations intensives ; aucun champ ou action n'est masqué.
- Les variantes n'affectent ni la charte, ni les dimensions tactiles, ni les droits métier.
- Le premier pilote utilise la variante compacte dans Finance Overview, à la racine et dans le contenu.

## E2E propriétaire avant fusion

1. Ouvrir la vue d'ensemble Finance sur 320, 390, 768 et 1440 px, puis vérifier la hauteur, le défilement et le lisible des sept indicateurs.
2. Ouvrir la configuration Finance et vérifier boutons, champs, dialogue, retour et confirmation, sans perte de données ni accès supplémentaire.
3. Tester FR/EN, mode clair/sombre, clavier, safe areas mobile et les sections plein écran.
4. Ouvrir un module autre que Finance Overview : vérifier que sa densité confortable initiale est inchangée.

## Validation

- `node scripts/qa-ux-947-compact-density.mjs` dans les Quality Gates.
- QA responsive, régression canonique, type-check, lint, build et E2E propriétaire.

## Risques / rollback

Pas de schéma Prisma, donnée, API, rôle, abonnement ni variable d'environnement modifié. Revert du lot si une densité compacte entraîne un chevauchement. Les tokens sémantiques, tableaux modulaires et préférences persistées sont hors scope et restent dans #942 et #939.
