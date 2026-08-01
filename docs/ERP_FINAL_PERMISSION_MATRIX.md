# ERP — Matrice finale des permissions

| Domaine | Lecture | Écriture | Validation / approbation | Interdictions |
|---|---|---|---|---|
| Administration entreprise | membre autorisé selon module | Owner/Admin entreprise + permission canonique | selon action | Manager n’est jamais administrateur automatiquement |
| Core ERP | membre + entitlement + visibilité objet | permission du module dédié | séparation demandeur/validateur | aucun CRUD `EnterpriseCoreRecord` |
| Finance | finance autorisée | permissions financières côté serveur | approbation indépendante | aucune donnée clinique, aucune modification d’écriture POSTED |
| Pharmacy opérationnel | rôles Pharmacy autorisés | permissions Pharmacy dédiées | pharmacien/qualité selon workflow | aucun accès global Finance implicite |
| Health clinique | professionnels et affectations autorisés | permissions Health dédiées | règles médicales explicites | personnel Finance exclu des données cliniques |
| Workflow Engine v2 | participants/administrateurs autorisés | éditeur v2 autorisé | version publiée selon permission | aucun nouvel `EnterpriseWorkflow` legacy |
| Archives Core/Sector/Workflow | utilisateurs qui auraient accès à l’objet | aucune | aucune | création, modification et suppression refusées |
| Documents | permission objet + confidentialité | permission dédiée | validation/versionnement | téléchargement inter-tenant interdit |
| Rapports | permission du domaine source | génération contrôlée | publication autorisée | double comptage et addition de devises incompatibles interdits |

## Résolution d’accès

Chaque route applique : session → `activeOrganizationId` → membre actif → organisation CLIENT → module actif → entitlement → permission → visibilité objet → same-origin → Zod → `await rateLimit` → transaction → `ApiLog` → `AuditLog`.

## Aliases

Les aliases de codes administratifs ou de permissions ne sont pas des modules métier. Ils sont documentés, testés, dépréciés et ne peuvent jamais élargir le périmètre d’un utilisateur.
