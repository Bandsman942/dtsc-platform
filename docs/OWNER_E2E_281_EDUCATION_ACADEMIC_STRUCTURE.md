# OWNER_E2E — EDU-1 Structure académique

Statut initial : **NOT_EXECUTED**.

Tester uniquement le SHA final de la PR #679 après réussite complète des gates CI.

## Préparation

Créer ou utiliser une organisation cliente active avec secteur `EDUCATION`, abonnement permettant les modules Education et au moins :

- un utilisateur administrateur Education ;
- un responsable académique avec permissions Structure/Calendrier ;
- un utilisateur sans permission Education pour les contrôles négatifs.

## Scénario fonctionnel

1. **Navigation** : ouvrir Paramètres Education, Structure académique et Calendrier académique depuis la navigation entreprise. Vérifier qu’aucun ancien module v1 générique (TEACHERS, CLASSES, EXAMS_GRADES, etc.) n’est proposé comme module actif après application du template v2.
2. **Assistant** : sur une entreprise vide, vérifier les quatre étapes Paramètres → Campus → Année → Niveaux/matières. Chaque étape se coche après création et actualisation.
3. **Paramètres** : renseigner type d’établissement, nom officiel, fuseau horaire et premier jour de semaine. Modifier ensuite la fiche et vérifier la révision.
4. **Campus** : créer un premier campus puis un second. Vérifier que le premier peut être choisi comme campus principal et que les listes restent simples avec un seul campus.
5. **Année** : créer une année académique puis une période située dans ses bornes.
6. **Validation dates** : tenter une période hors de l’année ; vérifier un message humain et l’absence d’écriture partielle.
7. **Niveaux / départements / programmes** : créer les références de structure puis vérifier recherche, statut et pagination.
8. **Classes** : créer une classe avec année, campus, niveau et programme.
9. **Matières** : créer une matière puis une offre de cours reliée à l’année, la période, le campus, la matière et la classe.
10. **Cohérence offre** : tenter de relier l’offre à une classe d’un autre campus ou d’une autre année ; l’opération doit être refusée.
11. **Calendrier** : créer un événement dans les bornes année/période ; tenter ensuite des dates hors bornes et vérifier le refus.
12. **Clôture** : clôturer une période puis une année utilisée. Vérifier que les données historiques et relations restent consultables.
13. **Archivage contrôlé** : tenter d’archiver une année/période déjà utilisée ; vérifier que l’application demande de conserver l’historique au lieu de supprimer brutalement.
14. **Concurrence** : ouvrir la même fiche dans deux sessions, enregistrer depuis la première puis tenter d’enregistrer l’ancienne révision depuis la seconde ; vérifier `REVISION_CONFLICT`.
15. **Tenant isolation** : avec deux organisations Education, copier un identifiant campus/année/période de l’autre organisation et tenter de l’utiliser via une mutation ; vérifier le refus.
16. **Permissions** : l’utilisateur sans permission ne peut ni lire ni écrire le module ; le responsable académique ne peut pas contourner les actions `manage`.
17. **Aucune suppression physique** : vérifier qu’aucune action utilisateur ne déclenche un DELETE ; archivage/clôture utilisent uniquement les transitions prévues.

## UI / mobile / i18n

18. Vérifier **FR puis EN** : titres, assistant, ressources, boutons, erreurs et états vides.
19. Vérifier les largeurs **320, 360, 375, 390, 414, 768 et 1024 px** : aucun scroll horizontal global, rails horizontaux uniquement là où prévu.
20. Ouvrir chaque formulaire sur mobile, faire apparaître le clavier et atteindre les derniers champs/boutons sans blocage de scroll.
21. Vérifier thème clair/sombre, focus clavier, boutons désactivés pendant sauvegarde et absence de libellés techniques bruts.
22. Vérifier recherche, filtre de statut, navigation précédente/suivante et états vides.

## Non-régression

23. Ouvrir au minimum un module ERP commun Finance et un module RH/Core de la même organisation ; EDU-1 ne doit pas modifier leur comportement.
24. Vérifier le centre d’aide pour `EDUCATION_SETTINGS`, `ACADEMIC_STRUCTURE` et `ACADEMIC_CALENDAR`.

Après validation sur le SHA final, confirmer explicitement : **`E2E #281 bon`**.
