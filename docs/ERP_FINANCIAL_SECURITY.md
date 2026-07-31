# Sécurité financière ERP

## Contrôle d’accès

Toute mutation suit : session -> contexte organisation -> membre actif -> organisation CLIENT -> module actif -> entitlement -> permission -> visibilité -> same-origin -> Zod -> `await rateLimit` -> transaction -> concurrence optimiste -> `ApiLog` -> `AuditLog`.

Les permissions Finance sont décomposées par domaine et action : view, create, update, submit, review, approve, post, reverse, pay, reconcile, close, reopen, export, manage et view_sensitive.

## Séparation des responsabilités

Les services interdisent l’auto-approbation pour factures, paiements, caisse, écritures, paie et clôture lorsque le flux exige un acteur indépendant. Les workflows appellent les mêmes services et ne modifient jamais directement un statut financier.

## Intégrité

- Tous les montants utilisent `Prisma.Decimal`.
- Toute écriture est équilibrée.
- Une période fermée bloque la comptabilisation.
- Une écriture `POSTED` est immuable.
- Une correction utilise une contrepassation.
- Toute comptabilisation métier possède une clé d’idempotence et un verrou transactionnel.
- Les allocations déterminent les soldes ouverts.

## Confidentialité

Sont sensibles : salaires, comptes et références bancaires, identifiants fiscaux, pièces justificatives, écritures manuelles et rapports non publiés. Les Push et notifications verrouillées restent génériques. Aucun secret bancaire, token, clé API ou numéro complet n’est exposé côté client.

## Isolation

Toutes les requêtes utilisent `organizationId` et des clés/contraintes tenant-aware. Aucun rôle global DTSC ne reçoit automatiquement accès à la finance d’une entreprise cliente. Les finances internes DTSC, Pharmacy et Health restent séparées.

## Règles côté client

Le navigateur ne fournit jamais SQL, JavaScript, nom de modèle Prisma, formule libre ou compte arbitraire à comptabiliser. Le registre d’événements et les mappings sont statiques et validés côté serveur.

## Incident et rollback

Un feature flag peut arrêter le posting automatique tout en permettant les brouillons. Les écritures existantes restent consultables. Les migrations, factures, paiements et écritures ne sont jamais supprimés par rollback.
