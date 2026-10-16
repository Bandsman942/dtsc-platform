# ADR WF-05 — Projection visuelle sans second moteur (#818)

**État : SPIKE / non activé pour les utilisateurs.** Dépend de WF-03 (#816) et WF-04 (#817), qui requièrent encore leurs validations propriétaires.

## Décision de base

L'unique contrat exécutable reste `WorkflowVersionInput` et `workflowVersionSchema` : 9 types de nœuds autorisés, DAG, branches typées, validation de readiness et édition/revue/publication serveur. Un canvas n'écrit jamais directement dans les tables ERP, ne publie pas et ne démarre aucune exécution.

La première fondation est `projectWorkflowVersion` et `applyWorkflowVisualPositions` : calcul pur, aucun appel API ni effet métier, projection des steps/transitions existants, coordonnées persistées comme clés numériques `visual.node.{stepCode}.x/y` dans **le même** `EnterpriseWorkflowVersion.configurationJson` canonique. La conversion n'écrase ni conditions, ni assignations, ni ordre, ni configurations de steps, ni outcomes. Les versions PUBLISHED restent immuables.

Le moteur ne lit jamais ces positions ; chaque position est bornée [0, 20 000] et ignorée si non numérique. L'ordre des nœuds sans position utilise `position` et le code comme déterminants, ce qui rend le résultat stable et permet de rouvrir des graphes anciens sans migration ni backfill.

## Décision d'interface en attente d'intégration

- **Candidat de bibliothèque** : @xyflow/react (React Flow / XYFlow) ; comparer accessibilité réelle du clavier et des ports, licence actuelle, bundle mobile, ARIA, performance, réconciliation React/Next et politique de dépendances avant tout ajout. **Aucune bibliothèque n'est ajoutée dans ce spike** ; les critères sont opposables mais non déclarés validés.
- Canvas desktop et tablette derrière permission canEditDraft ; fallback liste/formulaire existant sur mobile et en cas d'échec de rendu. Sans dépendance tierce validée, ne pas présenter une carte statique comme éditeur opérationnel.
- L'édition des branches/nœuds doit passer par les DTO contrôlés et la route PATCH actuelle, puis readiness/plan/RBAC/revue. Modification de la position seule marque le brouillon dirty.
- Zoom, déplacement, clavier, connecteurs lisibles, ARIA, mobile, dark mode, FR/EN et undo/redo doivent être certifiés par navigateur avant activation.
- Aucun nouveau type métier ni HTTP/script arbitraire n'est ajouté.

## QA réalisée dans cette tranche

`pnpm qa:workflow-visual-roundtrip` : **10 nœuds**, condition, outcomes, positions versionnées, round-trip sans perte de graphes et aucune exécution dans le module de projection. Test ciblé purement comportemental ; **pas** un E2E navigateur.

## Préconditions d'activation et rollback

- Merge et Production des #816 et #817 après OWNER_E2E respectifs.
- Implémenter et certifier le canvas complet contre le même moteur (création, connexion, sauvegarde, réouverture, branches, revue, mobile/clavier) ; OWNER_E2E #818 explicite.
- Ne pas exposer de contrôles non fonctionnels ou de promesse d'actions non certifiées.
- Rollback : désactiver le canvas et revenir à l'éditeur formulaires ; positions dans configurationJson sans effet sur les définitions canoniques. Aucune migration ou suppression destructive.
