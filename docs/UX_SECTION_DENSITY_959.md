# UX-07B — Densité compacte des sections et barres ERP (#959)

## Constat
Depuis le pilote #947, `ModuleWorkspace` et `ModuleContent` proposent `density="compact"`, mais les bandeaux de `ModuleSection` et `ModuleToolbar` conservent une marge trop importante même dans une page compacte. Des écrans de pilotage financier affichent alors une hiérarchie incohérente.

## Contrat
Les deux primitives existantes acceptent `density?: "comfortable" | "compact"`, avec **comfortable par défaut** comme avant.
- `ModuleToolbar` : seule la marge intérieure du conteneur change en opt-in compact ; recherche, filtres, résumé, permissions et navigation ne changent pas.
- `ModuleSection` : la carte *fermée* réduit les espacements du bandeau lorsqu'elle reçoit compact ; elle garde `min-h-11` pour les cibles tactiles, le focus visible, le bouton et les actions.
- La fiche/section ouverte en plein écran conserve ses dimensions et le focus trap ; l'attribut `data-workspace-density` facilite les tests dans les deux états.
- Finance Overview applique `density="compact"` à ses trois sections ; les autres modules restent inchangés sans opt-in.

## QA
`node scripts/qa-ux-959-workspace-section-density.mjs` dans Quality Gates. Compléter avec lint, type-check, régression et build.

## OWNER_E2E avant fusion
1. Dans Finance Overview, contrôler les trois sections en mode fermé sur 320, 360, 390, 414, 768 et 1440 px ; pas de chevauchement des titres, compteurs et actions.
2. Ouvrir chaque section en plein écran ; tester le bouton retour, Tab/Shift+Tab, Escape et restauration du focus.
3. Contrôler FR/EN, thèmes clair/sombre, libellés longs, zoom 200 % et VoiceOver/TalkBack lorsque disponible.
4. Ouvrir d'autres modules ERP : le mode confortable et toutes les actions doivent rester inchangés.
5. Vérifier les KPI Finance et l'assistant de configuration sans changer les droits ni les chiffres.

## Hors scope / rollback
Tokens/couleurs avancés, tables de masse et personnalisation persistée restent #942/#939. Aucun schéma Prisma, endpoint, mutation, entitlement ou permission ne change. Revert du commit UI si une régression est détectée. Production seulement depuis main après CI et E2E propriétaire.
