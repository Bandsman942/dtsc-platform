# WF-02 — Sécurité des workflows, RBAC et entitlements (#815)

## Modèle d'autorité

L'autorisation ne provient jamais du seul affichage d'un bouton ni d'un rôle global DTSC.

1. La session doit être active dans le contexte ORGANIZATION et correspondre exactement au `organizationId` de la route.
2. Le membership client doit être actif, non retiré, et l'organisation CLIENT active/non supprimée.
3. Le module canonique **WORKFLOWS** doit être utilisable selon le registre, l'activation tenant, le secteur, l'abonnement et les restrictions de membre. Un OWNER ne contourne pas les entitlements.
4. Les permissions `enterprise.workflows.*` sont résolues à partir de la position active et des attributions de rôles d'organisation actives. Seul OWNER/ADMIN_ENTREPRISE/ADMIN_ENTERPRISE local possède des droits workflow administratifs implicites. **MANAGER n'est pas un administrateur implicite** ; sa capacité de lancement, de lecture de tous les runs, de publication, de reprise ou d'annulation doit être explicitement attribuée.
5. Le module ERP **source** est lui aussi vérifié via `resolveEnterpriseModuleAccess` et la correspondance canonique `workflowSourceModule`, avant toute création, lecture/mutation de définition, revue/publication, exécution manuelle, retry ou cancel.
6. Le moteur vérifie à nouveau le membership actif et le droit de lecture au module source à chaque résolution de l'acteur d'une mutation. Si un utilisateur de démarrage nommé perd ses droits, il **n'est jamais remplacé silencieusement** par un demandeur/créateur alternatif : le workflow est bloqué avec `WORKFLOW_EXECUTION_MANDATE_REVOKED`. Les runs sans initiateur explicite peuvent seulement sélectionner un acteur métier actif et autorisé. Les services ERP canoniques continuent à vérifier toutes les validations et les droits d'action métier.
7. Le propriétaire d'une exécution et les collaborateurs auxquels une étape a été confiée ne reçoivent que les runs visibles. Les métriques utilisent le **même prédicat** que la liste (tenant, visibilité, types sources autorisés et filtres), jamais un `groupBy` global du tenant. Une personne uniquement assignée à une étape ne voit pas toutes les tentatives, décisions et événements d'autres étapes.

## Matrice minimale

| Identité | Lire le module | Créer/modifier/publier | Démarrer | Voir tous les runs | Retry/cancel |
|---|---|---|---|---|---|
| OWNER client actif, module activé et abonnement admissible | Oui | Oui | Oui | Oui | Oui |
| ADMIN_ENTREPRISE actif et admis | Oui | Oui | Oui | Oui | Oui |
| MANAGER sans permission explicite | Sous condition d'accès au module | Non | Non | Non | Non |
| Collaborateur membre sans permission explicite | Sous condition d'accès au module | Non | Non | Non, uniquement les runs participants | Non |
| Membre avec permission par position ou rôle actif | Sous condition d'accès au module | Selon permission | Selon permission | Selon permission | Selon permission |
| Membre retiré / abonnement inéligible / tenant B / DTSC global sans membership local | Non | Non | Non | Non | Non |

L'accès aux objets métiers demeure distinct : une permission sur WORKFLOWS ne permet pas de démarrer un workflow dans FINANCE_PAYMENTS sans droit d'accès à FINANCE_PAYMENTS. Les décisions financières restent dans leurs services métier, sans autorisation de substitution.

## Contrat API / preuve

- **GET** : les collections de runs filtrent `sourceEntityType` par les modules canoniques lisibles, ainsi que l'identité du propriétaire ou l'assignation ; les métriques reprennent strictement le même `where`. Un détail non visible reçoit 404 sans divulguer son existence.
- **POST/PATCH/DELETE** : same-origin, rate limit asynchrone, schéma Zod, membership actif, permission workflow, module et droits source, service métier canonique, audit et réponse métier contrôlée. Aucun accès transversal depuis DTSC_INTERNAL.
- **Runtime** : révocation entre deux étapes → BLOCKED (catégorie BUSINESS), et non une nouvelle action sous l'identité d'un autre utilisateur. Les notifications et documents ne confèrent aucune permission supplémentaire.
- **QA** : `pnpm qa:workflow-security` vérifie les rôles, position et assignations, le rôle MANAGER sans bypass, les entitlements, la portée tenant, le garde de source, la visibilité des métriques et l'absence de fallback implicite ; le script est obligatoire dans la régression GitHub.
- **OWNER_E2E** : OWNER publie ; MANAGER muni de permission démarre ; MEMBER ne voit que ses runs/étapes ; approbateur valide via le service métier ; membre retiré est bloqué immédiatement ; autre tenant est refusé ; les métriques ne révèlent aucun run masqué.

## Compatibilité et rollback

Les anciennes permissions explicites restent valides. La suppression de l'autorisation implicite MANAGER et la restriction des métriques peuvent modifier les écrans précédemment trop permissifs : vérifier les profils réels avant production. Aucun changement de schéma ou migration. En cas de rollback, revenir à la version applicative précédente après avoir arrêté les nouveaux lancements ; ne pas désactiver le garde financier métier et ne pas effacer les événements/audits.

Pas de nouveau rôle global, pas de super-admin transverse, pas de mutation MCP, pas de bypass commercial. Cette livraison dépend de WF-01 (#814) déjà livré et doit recevoir son propre `OWNER_E2E #815` avant squash merge vers `main`.
