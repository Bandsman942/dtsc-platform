# UX-03 — Feedback métier et commandes de liste bilingues

Statut : correctif de fondation en branche, non déployé ; davantage de modules restent à migrer.

- Les nouveaux retours métier portent explicitement leur type (`success`, `error`, `warning`, `info`) ; un échec HTTP ne peut plus produire un toast vert en raison de son texte.
- Les parcours patients Health et ventes Pharmacie sont migrés vers le feedback typé. Les messages du serveur restent utilisés pour les erreurs ; les succès sont déclarés par le résultat HTTP.
- Le composant de liste partagé expose les commandes de recherche et de pagination en français et anglais, avec labels d'accessibilité et totaux localisés.
- Les anciens appels à `useToastMessage` avec une chaîne restent compatibles : cette migration est volontairement progressive, sans changement massif des autres domaines.

## À poursuivre

- Migrer les mutations et erreurs restantes vers `actionFeedback` avec tests métier (#926) ; supprimer ensuite l'inférence legacy fondée sur regex.
- E2E vérifiant réponses 400/403/409/500, succès, FR/EN, re-clic sur le même bouton, écrans iOS ; audit d'accessibilité.

Pas de changement Prisma ou RBAC. Aucun déploiement depuis cette branche. Rollback par revert sans données.
