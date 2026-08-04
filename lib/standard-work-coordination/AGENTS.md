# Règles durables — coordination du travail

Ces règles s'appliquent à `lib/standard-work-coordination`, aux routes API et aux interfaces qui consomment ces services.

1. Le Calendrier agrège des projections autorisées ; il ne devient jamais une seconde source métier.
2. Tout élément agrégé conserve un `sourceType`, un `sourceId` et un lien profond contrôlé.
3. Une projection calendrier liée à un objet canonique doit être dédupliquée par le couple source type/identifiant.
4. Les périodes chargées sont bornées ; aucun historique complet ne doit être chargé par défaut.
5. Les dates sont stockées en UTC et affichées dans le fuseau utilisateur résolu côté serveur.
6. Les conflits de planification, memberships, participants et droits sont contrôlés côté serveur.
7. Le créateur d'un événement calendrier en reste le responsable ; aucun rôle hiérarchique ne peut imposer silencieusement un autre responsable.
8. Tout autre collaborateur est un participant invité avec un état explicite `En attente`, `Accepté` ou `Refusé`.
9. Une invitation en attente ou refusée ne doit jamais apparaître comme événement accepté dans le calendrier personnel du participant.
10. L'acceptation revérifie les conflits et le membership au moment de la réponse.
11. Les vues de disponibilité utilisent de vrais filtres de période, date précise, département, statut et collaborateur.
12. Une réservation de ressource est tenant-scoped et refuse tout chevauchement confirmé.
13. Une intégration externe non configurée répond par un état contrôlé et ne produit ni faux succès ni erreur Production non gérée.
14. La progression d'une tâche ou opération provient d'une checklist, de sous-tâches ou d'étapes persistées ; une saisie libre de pourcentage est interdite dans les parcours professionnalisés.
15. Les dépendances de tâches sont tenant-scoped et ne forment aucun cycle.
16. Un blocage possède un motif, un auteur, un état et une résolution historisée.
17. Les filtres enregistrés restent privés par défaut, tenant-scoped et ne peuvent élargir la visibilité métier.
18. Une transition de statut opérationnel est réservée au destinataire, à l'assigné ou au responsable explicite. Une permission individuelle de dérogation est nominative, auditée et fermée par catalogue.
19. Toute transition conserve l'ancien statut, le nouveau statut, l'acteur, la date, le motif et la progression calculée.
20. Une validation reste liée à son objet source et à la version soumise.
21. Le validateur désigné dispose d'actions serveur réelles ; une notification sans écran d'action est interdite.
22. Une correction exige un motif et conserve la version précédente.
23. Une décision est idempotente, atomique et auditée ; une seconde décision sur la même version est refusée.
24. Une réunion possède un organisateur, des participants persistés et des dates explicites.
25. Une action de suivi de réunion crée ou lie une véritable tâche canonique.
26. Les appels de réunion réutilisent l'infrastructure Collaboration ; aucun second moteur d'appel n'est créé.
27. Les modèles de workflow actifs sont versionnés et les instances restent liées à leur version d'origine.
28. Les conditions de workflow sont allow-listées et exécutées côté serveur ; aucun code arbitraire n'est accepté.
29. Les transitions et retries de workflow utilisent des clés d'idempotence stables.
30. Les documents réutilisent le stockage privé canonique et les routes d'accès contrôlées.
31. Une nouvelle version documentaire ne remplace jamais silencieusement la précédente.
32. Un fichier peut être lié à plusieurs objets via des liens tenant-scoped sans duplication du binaire.
33. L'indexation avancée et la comparaison visuelle utilisent des URLs signées courtes et des clés exclusivement serveur ; sans fournisseur configuré, elles restent `NOT_CONFIGURED`.
34. Les commentaires et mentions réutilisent les primitives collaboratives communes. Une mention cliquable ne contourne jamais la permission du module de destination.
35. Les notifications et rappels utilisent le moteur canonique, sont dédupliqués et ouvrent l'objet précis.
36. Une permission individuelle DTSC possède un code allow-listé, un motif, une durée, un effet ALLOW ou DENY et une révocation auditée ; DENY prévaut.
37. Une prestation passée ne peut être soumise qu'avec `work.past_period.submit`, vérifié côté interface et côté serveur.
38. Un SLA avancé mesure un délai et un dépassement sans modifier automatiquement le statut métier de l'objet.
39. Toutes les listes sont paginées ou bornées et les filtres mobiles restent réellement scrollables.
40. Les guides Markdown et les guides contextuels de l'application décrivent uniquement les capacités réellement déployées et sont actualisés dans la même branche.
41. Les tests automatisés peuvent promouvoir au maximum vers `PROFESSIONAL_READY` ; `COMMERCIAL_READY` exige la validation E2E explicite du propriétaire.
