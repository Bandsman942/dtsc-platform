# Règles locales — `app/api/enterprise/`

Ces règles complètent le `AGENTS.md` racine pour toutes les API ERP des organisations clientes.

- Toute lecture ou mutation doit vérifier la session, `organizationId`, `OrganizationMember.status = ACTIVE`, `removedAt = null`, l'organisation active, le module activé, l'entitlement et la permission métier.
- Un rôle DTSC global, y compris `ADMIN`, ne remplace jamais le membership actif de l'organisation cliente.
- Les mutations doivent conserver `isSameOriginRequest()` ou une protection équivalente, un schéma Zod métier dédié et `await rateLimit(...)`.
- Les listes Sprint 6 doivent être paginées et filtrées côté serveur. Ne pas charger tout le dataset pour filtrer uniquement dans React.
- Les routes Tasks, Requests, Approvals et Meetings utilisent leurs modèles dédiés Sprint 6. La Core API générique ne doit plus créer ni modifier de nouveaux `TASK`, `OPERATION`, `INTERNAL_REQUEST`, `VALIDATION`, `MEETING` ou `MINUTES`.
- Les transitions sensibles passent par des commandes explicites et des gardes atomiques sur l'état attendu et/ou `revision`. Une concurrence doit retourner `409 Conflict`, jamais écraser silencieusement une décision récente.
- Une décision d'approbation vérifie l'approbateur désigné côté serveur, interdit l'auto-approbation par défaut, impose un motif au rejet et refuse toute cible hors organisation.
- Sprint 6 utilise au maximum une validation `PENDING` par cible. Les politiques multi-étapes appartiennent au Workflow Engine futur.
- Les participants d'une réunion doivent être membres actifs de la même organisation. Une décision de réunion ne peut produire qu'une seule tâche liée.
- Les `EnterpriseEntityLink` sont créés uniquement après validation que source et cible appartiennent à la même organisation.
- Les commentaires et timelines opérationnels doivent rester paginés/bornés et respecter la visibilité métier de l'objet cible.
- Les routes sensibles continuent d'écrire `ApiLog` et `AuditLog` selon les conventions du repository.

## Professionnalisation ERP — opérations, RH, projets et actifs

- Toute clé étrangère fournie par le client est revalidée dans le même `organizationId`.
- Une opération métier ou financière ne peut être créée deux fois ; utiliser une clé idempotente ou une contrainte unique lorsque nécessaire.
- Une livraison ne dépasse jamais le reliquat commandé.
- Une réception n’alimente le stock qu’une seule fois.
- Un transfert ou ajustement ne contourne jamais la protection contre le stock négatif.
- Une période verrouillée ne peut plus être modifiée.
- Une paie annulée peut être recréée, mais deux paies actives ne peuvent couvrir la même population et la même période.
- L’auto-approbation est interdite lorsque la politique exige une séparation des responsabilités.
- Les bulletins, rémunérations, comptes bancaires, contrats complets et documents RH ne sont pas inscrits dans les logs.
- L’accès projet après révocation d’une relation externe est refusé.
- Un actif ne peut avoir deux affectations actives.
- Une annulation conserve l’historique ; elle ne supprime ni mouvement, réception, livraison, paie, bulletin, temps approuvé, affectation ou livrable validé.
- Les erreurs retournées à l’utilisateur expliquent ce qui s’est passé et comment corriger sans exposer de détail sensible.
- Les migrations sont additives ; aucune migration historique n’est modifiée.
