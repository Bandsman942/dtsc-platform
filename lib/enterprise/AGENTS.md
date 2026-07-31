# Règles durables — architecture des modules entreprise

Ces règles complètent le `AGENTS.md` racine pour tout travail dans `lib/enterprise` et pour les consommateurs du registre canonique.

1. Tout nouveau module entreprise doit être déclaré dans `module-registry-data.json` et exposé par `module-registry.ts`.
2. Ne pas créer un nouveau tableau, `Set` ou mapping local de codes modules sans justification documentée et QA empêchant sa divergence.
3. Un module `ACTIVE` doit posséder une route ou redirection valide, un workspace allow-listé, une politique d’accès, des permissions explicites, un entitlement et un contrat QA.
4. Un module `PLANNED`, `HIDDEN` ou `RETIRED` ne doit jamais apparaître dans la navigation, les raccourcis ou les cartes actives.
5. Les fonctions administratives restent des sections de `/enterprise-admin`, jamais des domaines ERP autonomes.
6. Les templates sectoriels doivent référencer des codes canoniques. Les codes historiques restent des aliases explicites et testés.
7. Core, Health et Pharmacy utilisent le même résolveur de navigation, d’entitlement et d’accès.
8. Aucun composant React, modèle Prisma ou import ne peut être choisi dynamiquement depuis une valeur arbitraire de base de données.
9. Les anciennes migrations de templates sont immuables. Toute correction persistante future doit être additive et non destructive.
10. Aucune itération future ne doit recréer un registre concurrent.
11. Toute requête métier reste isolée par `organizationId`, membership actif, secteur, entitlement et permissions serveur.
12. Le rôle `MANAGER` ne reçoit jamais `manage` automatiquement.
13. Les workspaces dédiés restent prioritaires; ne pas réintroduire un CRUD générique pour un domaine déjà spécialisé.
14. Les nouveaux composants respectent le contrat workspace, le rail KPI mobile, l’absence de débordement global, iOS/PWA, FR/EN et les thèmes clair/sombre.
15. Exécuter `pnpm qa:enterprise-module-registry` puis `pnpm qa:regression` avant tout push concernant cette architecture.
16. Les domaines communs utilisent des routes et services dédiés; ne jamais introduire un CRUD générique piloté par `entityType`, un nom de modèle ou du SQL fourni par le client.
17. Toute clé étrangère reçue par une API commune doit être rechargée avec le même `organizationId`; un identifiant valide d’un autre tenant doit être traité comme introuvable.
18. Les agrégats modifiables utilisent `revision` et les transitions métier utilisent le statut attendu. Ne pas remplacer une transition contrôlée par un `update` libre.
19. Les opérations rejouables qui produisent plusieurs écritures utilisent une clé d’idempotence persistée. Les retries ne doivent jamais dupliquer une conversion, une livraison, un mouvement de stock ou une réception.
20. `EnterpriseStockMovement` est un journal immuable et `EnterpriseInventoryBalance` une projection transactionnelle. Les transferts et inventaires passent par validation indépendante et le stock négatif reste interdit.
21. Les services reçus ne créent jamais de mouvement physique de stock. Les biens reçus exigent un lien catalogue, un article suivi en stock et une destination valide.
22. La RH des entreprises clientes reste dans les modèles `EnterpriseEmployee*`; ne jamais la mélanger avec les tables internes DTSC `Hrcfo*`.
23. La paie commune s’arrête à la préparation, l’approbation et la génération du bulletin. Ne jamais créer un paiement, un mouvement bancaire, une écriture comptable ou un statut `PAID` dans ce domaine.
24. Une paie rejetée ou annulée ne bloque pas définitivement sa période. La préparation suivante doit ignorer les runs `REJECTED` et `CANCELLED` tout en conservant leur historique.
25. Un demandeur ne valide jamais sa propre demande, son transfert, son inventaire, son contrat, son timesheet, sa paie ou son livrable soumis.
26. Les modèles Health et Pharmacy restent sectoriels. Toute future convergence doit utiliser un adapter explicite et une migration dédiée, jamais une lecture croisée implicite.
27. Les backfills communs sont dry-run par défaut, filtrables par organisation, idempotents et fondés sur des migration keys stables.
28. Les cinq QA communes (`master-data`, `crm-sales`, `inventory`, `hr-payroll`, `projects-assets`) restent en tête de `qa:regression`.
