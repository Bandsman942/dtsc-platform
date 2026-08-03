# Règles durables — coordination du travail

Ces règles s'appliquent à `lib/standard-work-coordination`, aux routes API et aux interfaces qui consomment ces services.

1. Le Calendrier agrège des projections autorisées ; il ne devient jamais une seconde source métier.
2. Tout élément agrégé conserve un `sourceType`, un `sourceId` et un lien profond contrôlé.
3. Une projection calendrier liée à un objet canonique doit être dédupliquée par le couple source type/identifiant.
4. Les périodes chargées sont bornées ; aucun historique complet ne doit être chargé par défaut.
5. Les dates sont stockées en UTC et affichées dans le fuseau utilisateur résolu côté serveur.
6. Les conflits de planification, memberships, participants et droits sont contrôlés côté serveur.
7. La progression d'une tâche provient d'une checklist, de sous-tâches, d'étapes ou d'une saisie explicitement autorisée ; elle n'est jamais inventée.
8. Les dépendances de tâches sont tenant-scoped et ne forment aucun cycle.
9. Un blocage possède un motif, un auteur, un état et une résolution historisée.
10. Les filtres enregistrés restent privés par défaut, tenant-scoped et ne peuvent élargir la visibilité métier.
11. Une validation reste liée à son objet source et à la version soumise.
12. Le validateur désigné dispose d'actions serveur réelles ; une notification sans écran d'action est interdite.
13. Une correction exige un motif et conserve la version précédente.
14. Une décision est idempotente, atomique et auditée ; une seconde décision sur la même version est refusée.
15. Une réunion possède un organisateur, des participants persistés et des dates explicites.
16. Une action de suivi de réunion crée ou lie une véritable tâche canonique.
17. Les appels de réunion réutilisent l'infrastructure Collaboration ; aucun second moteur d'appel n'est créé.
18. Les modèles de workflow actifs sont versionnés et les instances restent liées à leur version d'origine.
19. Les conditions de workflow sont allow-listées et exécutées côté serveur ; aucun code arbitraire n'est accepté.
20. Les transitions et retries de workflow utilisent des clés d'idempotence stables.
21. Les documents réutilisent le stockage privé canonique et les routes d'accès contrôlées.
22. Une nouvelle version documentaire ne remplace jamais silencieusement la précédente.
23. Un fichier peut être lié à plusieurs objets via des liens tenant-scoped sans duplication du binaire.
24. Les commentaires et mentions réutilisent les primitives collaboratives communes.
25. Les notifications et rappels utilisent le moteur canonique, sont dédupliqués et ouvrent l'objet précis.
26. Toutes les listes sont paginées ou bornées et les filtres mobiles restent réellement scrollables.
27. Les guides décrivent uniquement les capacités réellement déployées.
28. Les tests automatisés peuvent promouvoir au maximum vers `PROFESSIONAL_READY` ; `COMMERCIAL_READY` exige la validation E2E explicite du propriétaire.
