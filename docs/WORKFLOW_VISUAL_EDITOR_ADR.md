# ADR WF-05 — Projection visuelle sans second moteur (#818)

**État : implémentation candidate sur branche PR #836 DRAFT, non déployée.** WF-03 (#816) et WF-04 (#817) sont fusionnés et validés. Le studio exige encore la certification navigateur, la QA finale et OWNER_E2E #818.

## Décision de base

L'unique contrat exécutable reste `WorkflowVersionInput` et `workflowVersionSchema` : 9 types de nœuds autorisés, DAG, branches typées, validation de readiness et édition/revue/publication serveur. Un canvas n'écrit jamais directement dans les tables ERP, ne publie pas et ne démarre aucune exécution.

La première fondation est `projectWorkflowVersion` et `applyWorkflowVisualPositions` : calcul pur, aucun appel API ni effet métier, projection des steps/transitions existants, coordonnées persistées comme clés numériques `visual.node.{stepCode}.x/y` dans **le même** `EnterpriseWorkflowVersion.configurationJson` canonique. La conversion n'écrase ni conditions, ni assignations, ni ordre, ni configurations de steps, ni outcomes. Les versions PUBLISHED restent immuables.

Le moteur ne lit jamais ces positions ; chaque position est bornée [0, 20 000] et ignorée si non numérique. L'ordre des nœuds sans position utilise `position` et le code comme déterminants, ce qui rend le résultat stable et permet de rouvrir des graphes anciens sans migration ni backfill.

## Studio intégré sur branche candidate

- **Choix d'implémentation initial** : canevas natif React/SVG, aucun poids de bibliothèque externe ni moteur d'exécution parallèle. Un spike ultérieur pourra comparer XYFlow selon accessibilité réelle, licence, performance et maintenance avant adoption ; aucun avantage non mesuré n'est revendiqué.
- Canvas desktop à partir de lg avec arêtes typées, zoom, déplacement par pointeur/clic-clavier et liste accessible à tous les écrans. L'édition des noms/descriptions et la connexion des étapes via champs structurés sont implémentées sur la branche. La liste/formulaires hérités reste l'alternative mobile.
- L'édition des branches, noms et positions traverse les DTO contrôlés et la route PATCH actuelle, avec persistance de configurationJson, puis readiness/plan/RBAC/revue. Déplacement marque le brouillon dirty et n'exécute aucune étape.
- Zoom 50–150 %, déplacement, navigation au clavier, liste mobile, labels ARIA, libellés FR/EN et undo/redo (20 snapshots maximum) sont intégrés ; **la certification navigateur responsive/contrastes/focus reste à exécuter**. Le canevas ne propose pas encore de minimap ni de configuration métier profonde depuis le panneau propriétés : les formulaires structurés restent disponibles.
- Aucun nouveau type métier ni HTTP/script arbitraire n'est ajouté.

## QA réalisée et limites de couverture

`pnpm qa:workflow-visual-roundtrip` : **10 nœuds**, condition, outcomes, positions versionnées, round-trip sans perte de graphes et aucune exécution dans le module de projection. Test ciblé + contrôles structurels du studio intégré ; **pas** un E2E navigateur ni validation de graphes complexes simulant plusieurs utilisateurs concurrents.

## Préconditions d'activation et rollback

- #816 et #817 ont été fusionnés et déployés après OWNER_E2E respectifs. La PR #836 est réconciliée sur main@8490cf55.
- Certifier par navigateur les parcours réels : création depuis palette/formulaire, connexions, position, enregistrement/rechargement des coordonnées, revue/publication, 10+ nœuds, contraste/focus/mobile, contrôle de concurrence. Ajouter les fonctions non couvertes par le canevas si nécessaire. OWNER_E2E #818 explicite.
- Les positions, branches et libellés sont fonctionnels ; les propriétés métier avancées restent dans les formulaires existants et aucun clic sur canevas ne déclenche l'exécution.
- Rollback : désactiver le canvas et revenir à l'éditeur formulaires ; positions dans configurationJson sans effet sur les définitions canoniques. Aucune migration ou suppression destructive.
