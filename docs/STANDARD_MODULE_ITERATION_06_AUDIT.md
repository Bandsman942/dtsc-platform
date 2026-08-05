# Audit d’implémentation — Modules standards — Itération 06

## Périmètre livré

- budgets versionnés, scénarios, gel, prévisions, sources, alertes et formules communes ;
- catalogue de rapports, métriques, fraîcheur, vues enregistrées et exports cohérents ;
- administration entreprise : checklist réelle, rôles personnalisés, simulation, sécurité et audit ;
- hiérarchie des départements et protection du dernier administrateur ;
- i18n français/anglais et guides natifs ;
- registre et Kanban de maturité mis à jour sans promotion commerciale ;
- migration additive et audits automatisés intégrés à la régression.

## Vérifications CI

- le dataset de l’administration transmet l’ensemble des rôles, politiques de sécurité, événements d’audit et contrôles de configuration au composant natif ;
- les lignes budgétaires utilisent des entrées Prisma distinctes et cohérentes pour la création imbriquée et le remplacement transactionnel par `createMany` ;
- les montants budgétaires restent des `Decimal` Prisma ;
- le PATCH budgétaire normal reste limité au statut `DRAFT`, tandis que les corrections utilisent la transition contrôlée `CORRECTION_REQUESTED → REOPEN → DRAFT` ;
- les codes historiques `SELF_APPROVAL_DENIED` et `REVISION_CONFLICT` sont conservés pour la compatibilité des clients et des audits ;
- les références `native://...` sont résolues uniquement lorsqu’un code de guide correspondant existe réellement dans le registre natif `lib/user-guides`.

## Limites honnêtes

- les programmations de rapports ne sont pas exposées tant qu’un ordonnanceur de diffusion complet n’est pas prouvé ;
- les imports budgétaires ne sont pas annoncés si le pipeline de simulation/idempotence n’est pas disponible dans l’environnement ;
- une prévision IA reste un brouillon ;
- les exports volumineux restent soumis aux limites de la plateforme et aux politiques d’approbation ;
- les E2E authentifiés Production restent à réaliser par le propriétaire.

## Statut de maturité

Les modules concernés peuvent atteindre `PROFESSIONAL_READY` après Quality Gates, fusion et preuve Production. `COMMERCIAL_READY` reste bloqué.
