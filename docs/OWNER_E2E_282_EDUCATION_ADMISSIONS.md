# OWNER_E2E — EDU-2 Admissions, étudiants et tuteurs

Statut initial : **NOT_EXECUTED**.

Tester uniquement le SHA final de la PR EDU-2 après réussite complète de la CI.

## Préparation

Utiliser une organisation Education avec EDU-1 configuré :

- une année académique ;
- deux campus si possible ;
- au moins un niveau, un programme et une classe ;
- un administrateur Education ;
- un responsable académique ;
- un utilisateur sans permission Education ;
- une seconde organisation Education pour les contrôles d’isolation.

## Parcours Admissions

1. Ouvrir **Admissions** depuis la navigation Education.
2. Créer un candidat sans compte DTSC avec année, campus, programme/niveau/classe.
3. Vérifier que le dossier reste en brouillon et que recherche/statut/pagination fonctionnent.
4. Soumettre le dossier puis démarrer l’étude.
5. Avec un utilisateur sans permission d’approbation, vérifier que la décision n’est pas disponible/refusée côté serveur.
6. Avec un décideur autorisé, placer un dossier en liste d’attente puis le remettre en étude.
7. Accepter le dossier avec un motif.
8. Inscrire le candidat ; vérifier qu’un étudiant, une inscription et un placement initial sont créés.
9. Relancer l’action d’inscription sur le même dossier ; vérifier qu’aucun doublon étudiant/inscription n’est créé.
10. Créer un second dossier et le refuser ; vérifier qu’il ne peut pas être inscrit.
11. Créer un troisième dossier et le retirer ; vérifier que l’historique reste consultable.

## Registre étudiant

12. Ouvrir **Étudiants** et retrouver l’étudiant créé par nom et numéro.
13. Vérifier l’année, le campus, le programme, le niveau, la classe et le statut d’inscription.
14. Transférer l’étudiant vers une autre classe/campus compatible.
15. Vérifier que l’ancien placement possède une date de fin et que le nouveau placement existe ; aucune réécriture de l’ancien placement.
16. Retirer l’inscription avec motif puis la réactiver avec une nouvelle affectation.
17. Terminer une inscription active et vérifier que son historique reste visible.
18. Tenter une classe d’une autre année ou d’un autre campus ; vérifier le refus.
19. Tester une modification concurrente depuis deux sessions et vérifier `REVISION_CONFLICT`.

## Parents & tuteurs

20. Ouvrir **Parents & tuteurs** et créer un tuteur sans compte DTSC.
21. Lier le tuteur à l’étudiant comme contact principal et tuteur légal.
22. Vérifier l’affichage de la relation côté étudiant/tuteur.
23. Si un compte DTSC est relié, vérifier qu’aucun nouveau membership n’est créé.
24. Si un tiers canonique est relié, vérifier qu’un tiers d’une autre organisation est refusé.

## Documents / isolation / sécurité

25. Relier une pièce privée via Documents commun au dossier d’admission et vérifier que le fichier reste privé.
26. Essayer d’utiliser un identifiant année/campus/classe/étudiant/tuteur d’une autre organisation : refus serveur.
27. Vérifier qu’aucun bouton ou endpoint utilisateur ne réalise un DELETE physique d’étudiant/inscription.
28. Vérifier que les logs/audits ne contiennent ni fichier, URL signée, cookie ni données sensibles inutiles.

## UI / mobile / i18n

29. Tester FR puis EN sur Admissions, Étudiants et Parents & tuteurs.
30. Tester 320, 360, 375, 390, 414, 768 et 1024 px : aucun scroll horizontal global.
31. Ouvrir les formulaires sur mobile avec clavier visible et atteindre les derniers champs/boutons.
32. Vérifier toasts succès/erreur, états loading/empty, boutons désactivés pendant sauvegarde et messages humains.
33. Vérifier thème clair/sombre et navigation clavier.

## Non-régression

34. Ouvrir Structure académique, Calendrier académique, un module Finance et un module RH/Core.
35. Vérifier le centre d’aide pour ADMISSIONS, STUDENTS et GUARDIANS.

Après validation sur le SHA final, confirmer explicitement : **`E2E #282 bon`**.
