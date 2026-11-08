# Hotfix B #1068 — Conversations IA DS 2.0, navigation déterministe

**Date** : 8 novembre 2026. **Version candidate : v1.6.3 sur la base main v1.6.2 ; incrément séquentiel après fusion précédente.** Base : main v1.6.2, Hotfix A complémentaire #1067.

## Couverture
Le chatbot général `/chat` et l'Assistant entreprise `/enterprise-modules/AI_ASSISTANT` partagent déjà `AssistantConversationUI` (messages, composer multiligne, préférences). Le présent hotfix ajoute une seule convention d'interaction : **rail DTSC rétractable du shell + colonne Conversations (260–320 px) + fil de messages flexible**. Listes épinglées, archives, projets, recherche et menus existants restent conservés. Le contenu ne sort pas du viewport ni du périmètre autorisé.

## Desktop
- Suppression du bouton de retour contextuel global dans les deux vues et activation du `desktopWorkspaceMode="conversation"` existant, déjà compatible avec le rail réduit façon Neon.
- Deux panneaux internes indépendants : historique toujours visible à gauche, message/composer à droite ; le menu global DTSC constitue la troisième zone.
- `AssistantImmersiveWorkspaceShell` et le composant partagé utilisent 100 % de la hauteur utile ; les scrolls de la liste et du fil sont séparés, le composer reste visible.
- Thread sélectionné reflété dans `?conversationId=`, navigation browser back/forward traitée, liens copiés ouvrables; pas de reload nécessaire.
- Design System 2.0 : surfaces, contrastes, formes arrondies, surbrillance au focus, light/dark, typographie responsive et prise en charge de `prefers-reduced-motion`.
- Les confirmations d'actions, citations réelles, feedback et outils existants restent dans leur vrai contexte autorisé, aucune recherche Web fantôme.

## Mobile / PWA
- En dessous de 1024 px, retour visible vers **Conversations**, jamais `router.back()` vers une page étrangère; l'historique reste un panneau dédié fermé à la sélection.
- Le composer canonique préserve Entrée pour envoyer, Maj+Entrée pour la ligne suivante, composition IME et les safe areas.
- Le rail global DTSC et le contrôleur VisualViewport iOS restent inchangés. Aucune interaction avec les cookies de sous-domaines.

## QA et parcours E2E
```bash
node scripts/qa-hotfix-1068-ai-conversation-design2.mjs
pnpm qa:assistant-ux
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
npx playwright test tests/e2e/issue-1068-ai-conversations.spec.mjs
```
Scénarios E2E propriétaires A+B+C : choisir conversation A, conversation B, navigateur précédent/suivant; vérifier recherche, favoris, archives, projets, nouvelles discussions, composer, sources, confirmations, édition/suppression, streaming et citations en IA entreprise. Vérifier retour mobile vers la liste; vérifier absence scroll horizontal et titre tronqué selon 320/360/390/414/768/1024/1440 px; FR/EN et clair/sombre; basculer utilisateur/entreprise pour vérifier absence de fuite tenant. Les tests navigateur synthétiques se désactivent lorsque les fixtures ne sont pas présentes : ne jamais confondre leur absence avec un E2E humain réussi.

Aucune migration ni modification des données et modèles. Pas de Preview, Production via main uniquement après validation E2E finale A+B+C. Rollback : revert de la PR. Aucun droit ajouté. Ne pas copier une marque tierce, conserver l'identité DTSC.
