# Contrat API — Accounting #598

## `GET /api/enterprise/:organizationId/accounting-query`

### Accès

- session organisation active ;
- membership actif ;
- module `FINANCE_ACCOUNTING` accessible ;
- entitlement et permission `view` résolus par `authorizeFinanceRequest` ;
- toutes les lectures sont bornées au `organizationId` de la route et au contexte autorisé.

### Vues

`view` accepte uniquement :

- `general-ledger` — lignes du grand livre provenant uniquement d’écritures `POSTED` ;
- `trial-balance` — ouverture, mouvements et clôture par compte ;
- `entry-trace` — écriture et lignes ;
- `anomalies` — lots de posting en anomalie.

Toute autre valeur retourne une erreur de validation humaine.

### Filtres

Selon la vue : `page`, `pageSize`, `search`, `dateFrom`, `dateTo`, `fiscalPeriodId`, `ledgerAccountId`, `journalId`, `businessPartyId`, `projectId`, `departmentId`, `siteId`, `assetId`, `inventoryItemId`, `sourceModule`, `sourceEntityType`, `currencyCode` et `status` pour la vue anomalies.

- `pageSize` est plafonné à 100 ;
- `dateFrom > dateTo` est rejeté ;
- `fiscalPeriodId` est revalidé dans la même organisation ;
- `status` ne permet jamais de transformer `general-ledger` en lecture de brouillons : le grand livre reste `POSTED`.

### Trace et navigation source

`entry-trace` exige `entryId`. Le serveur recherche l’écriture dans la même organisation. Le champ `sourceLink` est `null` lorsque le module source est inconnu ou non autorisé pour l’utilisateur. La présence d’un `sourceEntityId` n’accorde aucun accès supplémentaire.

### Réponse

Les montants Prisma sont sérialisés avec le sérialiseur Finance canonique. Les listes retournent une pagination server-side. La balance expose aussi la devise fonctionnelle et les bornes de période retenues.

### Erreurs

- `400` — vue, période ou dates invalides ;
- `401/403` — session ou accès Finance insuffisant ;
- `404` — écriture de trace introuvable dans l’organisation ;
- erreurs Finance domaine — réponse client normalisée par `financeErrorResponse`.

Aucune stack trace, erreur Prisma brute, payload ou identifiant de tenant technique n’est présenté comme message utilisateur.

## `GET /api/enterprise/:organizationId/accounting-reference-options`

Cette route fournit les références canoniques recherchables nécessaires aux formulaires Finance. Pour `FINANCE_ACCOUNTING`, #598 ajoute tiers, projets, départements, sites, articles de stock et actifs en plus des références comptables existantes.

Chaque recherche :

- exige l’accès `view` au module Finance appelant ;
- est tenant-scoped ;
- filtre les objets archivés/inactifs selon leur domaine ;
- retourne au maximum 30 options ;
- ne transforme jamais une option UI en autorisation d’écriture.

Les écritures manuelles revalident donc encore toutes les dimensions côté serveur lors de la création et avant le posting.
