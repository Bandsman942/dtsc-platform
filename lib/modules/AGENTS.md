# AGENTS.md — Modules standards DTSC

Ces règles s’appliquent au registre, à la navigation, aux accès, aux liens profonds et à toute nouvelle surface non ERP.

1. Tout module standard doit être enregistré dans `standard-module-registry-data.json` avant d’être visible.
2. Le statut technique et la maturité commerciale restent deux décisions distinctes.
3. `COMMERCIAL_READY` exige une validation explicite du propriétaire après Production et E2E manuels.
4. Aucune route canonique ne peut être dupliquée, sauf shell partagé explicitement documenté et audité.
5. Aucun module `ACTIVE` ou `BETA` ne peut exposer un bouton mort ou une route inexistante.
6. Les URL multidomaines utilisent exclusivement les résolveurs centraux de `lib/domains.ts`.
7. Les permissions et capacités sont vérifiées côté serveur avant toute lecture ou mutation sensible.
8. Le frontend utilise les capacités comme indications d’affichage, jamais comme autorité de sécurité.
9. Un module standard ne recrée aucune source ERP ; il consomme les interfaces publiques et déclare `erpDependencies`.
10. Chaque module professionnel possède un guide exact, accessible et relié dans le registre.
11. Les KPIs, tabs, filtres et actions secondaires restent scrollables horizontalement sur mobile.
12. Les notifications et liens ouvrent l’objet précis et la section pertinente après contrôle d’accès.
13. Les fonctions PWA et Web Push reflètent la configuration serveur réelle ; aucun état fictivement « configuré ».
14. Les migrations restent additives, non destructives et compatibles base vide/base existante.
15. Les QA historiques ne sont jamais supprimées, affaiblies ou contournées pour obtenir un résultat vert.
16. Les E2E manuels ne sont jamais déclarés réussis sans confirmation explicite du propriétaire.
17. Seul `main` déclenche la Production ; aucun déploiement manuel d’une branche feature.
18. Chaque itération produit un rapport de clôture, une checklist E2E et un changelog honnêtes.
19. Les modules `PLANNED`, `HIDDEN` et `RETIRED` ne sont jamais présentés comme utilisables.
20. Une promotion de maturité doit modifier le registre, les preuves QA, la documentation et les tests dans la même PR.
21. Les aliases ne doivent jamais entrer en conflit avec un code canonique ou un autre alias.
22. Toute dépendance standard ou ERP est explicite, stable et vérifiée avant activation.
23. Les reason codes d’accès sont stables, documentés et n’exposent aucune donnée protégée.
24. Une surface Console, Support, Account ou Public conserve sa frontière de host et son contrat de retour sécurisé.
