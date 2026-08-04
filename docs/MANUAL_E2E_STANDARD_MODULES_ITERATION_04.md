# E2E manuel — modules standards — Itération 04 — Remédiation propriétaire

**Statut : NON_EXÉCUTÉ — NOUVEAU CYCLE APRÈS REMÉDIATION**

Les tests initiaux du propriétaire ont produit les améliorations de cette branche. Les scénarios ci-dessous doivent être exécutés sur le nouveau déploiement Production avant toute promotion commerciale.

## Préconditions

- une organisation DTSC interne avec plusieurs collaborateurs actifs et plusieurs départements ;
- une entreprise cliente avec plusieurs membres actifs ;
- un administrateur DTSC, un responsable, un SUPPORT, un collaborateur standard et un utilisateur sans permission ;
- deux sessions ou navigateurs pour tester les invitations ;
- uniquement des données fictives ;
- conservation des identifiants, captures, rôles et résultats.

## 1. Disponibilités — rails de période

- Ouvrir Calendrier → Disponibilités.
- Tester Aujourd’hui, Cette semaine, Ce mois, Cette année et Date précise.
- Vérifier que les résultats changent réellement selon la période.
- Résultat attendu : aucun filtre décoratif, aucun blocage du rail horizontal sur mobile.

## 2. Disponibilités — départements et vues

- Tester Tous les départements puis chaque département.
- Tester Liste, Par collaborateur et Par statut.
- Combiner période, département et statut.
- Résultat attendu : décompte, contenu et synthèses cohérents.

## 3. Créateur responsable

- Comme collaborateur A, créer un événement en sélectionnant B et C.
- Vérifier que A reste responsable et que le formulaire ne permet pas de choisir B comme responsable.
- Tenter une requête directe avec `ownerCollaboratorId=B`.
- Résultat attendu : refus `OWNER_IMMUTABLE` côté serveur.

## 4. Invitation depuis un collaborateur

- Ouvrir la liste ou disponibilité de B et choisir l’action de création.
- Résultat attendu : B est pré-sélectionné comme participant ; A reste responsable.

## 5. Invitation en attente

- Vérifier que B reçoit une notification et retrouve l’événement dans Invitations.
- Avant réponse, ouvrir Mon calendrier de B.
- Résultat attendu : l’événement n’y apparaît pas.

## 6. Acceptation

- Comme B, accepter l’invitation.
- Résultat attendu : le serveur revérifie les conflits et l’événement rejoint Mon calendrier de B.

## 7. Refus

- Inviter C puis refuser comme C.
- Résultat attendu : le créateur est notifié ; l’événement ne rejoint pas le calendrier de C.

## 8. Conflit participant

- Créer un événement qui chevauche l’agenda ou l’absence de B.
- Résultat attendu : le conflit de B est détecté avant création et avant acceptation.

## 9. Calendrier personnel et équipe

- Comparer Mon calendrier et Calendrier équipe avec un responsable autorisé.
- Résultat attendu : Mon calendrier n’affiche que les objets créés, dirigés ou acceptés ; la vue équipe respecte les droits.

## 10. CRUD de ses événements

- Créer, ouvrir, modifier puis annuler son événement.
- Vérifier la date de création et la date de dernière modification.
- Tenter les mêmes actions comme simple participant.
- Résultat attendu : participant en lecture ; créateur responsable en écriture.

## 11. Checklist d’événement

- Ajouter plusieurs résultats à réaliser, cocher progressivement et vérifier la progression.
- Résultat attendu : progression calculée, aucune saisie manuelle de pourcentage.

## 12. Suggestions de créneaux

- Sélectionner plusieurs participants, une durée et une période.
- Résultat attendu : propositions locales sans conflit bloquant ; période supérieure à quatorze jours refusée.

## 13. Ressources

- Créer une salle, la réserver pour un événement, puis tenter un chevauchement.
- Résultat attendu : première réservation confirmée, seconde refusée avec `RESOURCE_CONFLICT`.

## 14. Synchronisation externe non configurée

- En Production sans variables OAuth, ouvrir Outils avancés.
- Résultat attendu : boutons désactivés, message humain, aucune erreur serveur ou client.

## 15. Vue Kanban Activités DTSC

- Basculer Liste/Kanban et ouvrir des cartes de chaque colonne.
- Résultat attendu : objets regroupés selon leurs statuts réels et détails ouvrables.

## 16. Autorité de transition

- Comme superviseur non responsable, tenter de changer le statut d’une tâche assignée à un autre collaborateur.
- Comme assigné, effectuer la même transition.
- Résultat attendu : superviseur refusé, assigné autorisé.

## 17. Checklist de tâche

- Tenter de terminer une tâche sans checklist, puis avec checklist incomplète, puis complète.
- Résultat attendu : `CHECKLIST_REQUIRED`, puis `CHECKLIST_INCOMPLETE`, puis réussite à 100 %.

## 18. Blocage

- Déclarer un blocage sans motif puis avec motif.
- Résultat attendu : motif obligatoire et objet Blocage lié créé une seule fois.

## 19. Commentaires CRUD

- Ajouter, répondre, modifier et supprimer un commentaire.
- Charger les commentaires précédents.
- Résultat attendu : structure du fil conservée et permissions appliquées.

## 20. Mention professionnelle

- Mentionner un collaborateur dans une tâche ou opération.
- Cliquer sur la mention.
- Résultat attendu : profil, conversation, préparation d’invitation calendrier et copie du nom sont proposés ; les destinations revérifient l’accès.

## 21. Historique des prestations

- Ouvrir plusieurs semaines de l’historique.
- Résultat attendu : entrées, durées, décisions, révisions, dates de création et modification visibles.

## 22. Semaine passée sans permission

- Comme collaborateur standard, ouvrir une semaine passée encore modifiable.
- Tenter aussi une requête directe de soumission.
- Résultat attendu : bouton absent et refus `PAST_PERIOD_PERMISSION_REQUIRED`.

## 23. Permission individuelle

- Comme ADMIN, accorder `work.past_period.submit` avec motif et expiration.
- Recharger comme collaborateur et soumettre la semaine passée.
- Révoquer la permission puis recommencer.
- Résultat attendu : autorisé avant révocation, refusé après révocation, audit complet.

## 24. Accès Administration ciblé

- Accorder à un SUPPORT une permission `admin.section.<section>.read`.
- Vérifier qu’il voit cette section sans obtenir le poste métier correspondant.
- Tenter de modifier un objet dont il n’est pas responsable.
- Résultat attendu : lecture ciblée seulement ; mutation refusée.

## 25. DENY prioritaire

- Enregistrer un ALLOW puis un DENY actif sur le même code.
- Résultat attendu : le DENY prévaut.

## 26. SLA

- Créer une politique, la rattacher à un objet, déclencher l’évaluation avant avertissement, pendant l’avertissement et après échéance.
- Résultat attendu : RUNNING, WARNING puis BREACHED sans changement automatique du statut métier.

## 27. Documents avancés non configurés

- Demander une indexation et une comparaison visuelle sans variables fournisseur.
- Résultat attendu : état `NOT_CONFIGURED`, réponse 503 contrôlée, aucune clé exposée, aucun faux résultat.

## 28. Documents avancés configurés — environnement de test uniquement

- Configurer un fournisseur fictif ou de test.
- Indexer une version et comparer deux versions différentes.
- Résultat attendu : URLs signées courtes, statut READY ou FAILED contrôlé, résultat et audit sans secret.

## 29. Guides intégrés

Ouvrir les guides depuis :

- Calendrier ;
- Activités DTSC ;
- Activités entreprise ;
- Tâches ;
- Demandes ;
- Validations ;
- Réunions ;
- Workflows ;
- Documents ;
- Administration RBAC.

Résultat attendu : guide recherchable, mobile, actualisé et conforme aux fonctions visibles.

## 30. Mobile

Tester 320, 360, 375, 390, 414 et 768 px : rails, Kanban, dialogues, formulaires, guides, invitations, commentaires, ressources et prestations.

Résultat attendu : aucun débordement global, actions tactiles accessibles et scroll local fonctionnel.

## 31. Accès révoqué

Révoquer le membership ou le dossier collaborateur dans une autre session, puis réessayer les liens directs.

Résultat attendu : accès refusé sans fuite de métadonnées.

## 32. Régression des scénarios initiaux

Rejouer les scénarios de l’itération 04 : agenda unifié, demandes, validations avec correction, réunions, workflows, documents, intégration ERP, PWA et notifications.

## Rapport du propriétaire

Pour chaque scénario, renseigner : exécutant, date, environnement, compte, rôle/poste, données de test, résultat, anomalie, capture et identifiant.

**Tests E2E manuels préparés — validation du propriétaire en attente**
