# Règles locales — `components/enterprise/`

Ces règles complètent le `AGENTS.md` racine pour les interfaces des organisations clientes.

- Les modules Sprint 6 `TASKS_OPERATIONS`, `INTERNAL_REQUESTS`, `VALIDATIONS` et `MEETINGS` utilisent des workspaces dédiés, pas le workspace générique `EnterpriseCoreWorkspace`.
- Conserver le design system `ModuleWorkspace -> Header -> Metrics -> Toolbar -> BusinessList -> Detail -> Context actions`; ne pas réintroduire de conteneurs imbriqués volumineux.
- Les filtres et la pagination des nouveaux domaines doivent être pilotés par les API serveur. React ne doit pas devenir la source de filtrage de gros datasets.
- Ne jamais afficher directement les codes de statut métier (`IN_PROGRESS`, `PENDING`, `FULFILLED`, etc.). Utiliser des libellés FR/EN traduits.
- Les menus `...` n'affichent que les transitions métier plausibles, mais le backend reste autoritatif et doit toujours revalider l'action.
- Sur mobile, privilégier liste -> détail haut/plein écran -> action/formulaire. Les longs formulaires utilisent une vue ou un dialog haut compatible VisualViewport/safe-area/iOS.
- Préserver les corrections iOS existantes : contrôles natifs quand ils sont plus fiables, clavier accessible, scroll interne borné et absence de double scroll.
- Les anciens `EnterpriseCoreRecord` Sprint 6 peuvent apparaître avec un libellé métier discret `Historique`, mais restent read-only et ne doivent pas exposer de jargon de migration aux utilisateurs métier.
- Les données sectorielles sensibles ne doivent pas être recopiées automatiquement dans le résumé d'une tâche ou demande transversale.
- Aucun bouton ou menu visible ne doit être un placeholder : toute action affichée appelle une route réelle et gère succès, erreur et concurrence.
