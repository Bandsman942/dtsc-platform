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
