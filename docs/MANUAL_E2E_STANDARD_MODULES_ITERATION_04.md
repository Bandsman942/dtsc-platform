# E2E manuel — modules standards — Itération 04

**Statut : NON_EXÉCUTÉ**

## Préconditions

- utiliser une organisation cliente de test et plusieurs membres actifs ;
- disposer d'un administrateur, d'un responsable, d'un demandeur, d'un validateur et d'un membre sans permission ;
- conserver les identifiants des objets créés et les captures utiles ;
- ne pas utiliser de données médicales, financières ou personnelles réelles.

## 1. Calendrier personnel et navigation

- Ouvrir `/calendar`, changer les vues existantes, rechercher et filtrer.
- Créer un événement direct, le modifier par formulaire puis l'annuler.
- Vérifier le fuseau utilisateur et `/calendar?event={id}`.
- Résultat : l'objet exact s'ouvre, sans fuite de contexte.

## 2. Calendrier multi-sources

- Créer une tâche avec échéance, une réunion et une demande datée.
- Actualiser l'agenda unifié et ouvrir chaque source.
- Terminer la tâche puis actualiser.
- Résultat : une seule projection par objet canonique et état actualisé.

## 3. Conflits

- Créer deux événements incompatibles pour un même participant.
- Vérifier le message de conflit, corriger le créneau ou utiliser l'exception autorisée.
- Résultat : conflit évalué côté serveur et participant identifié sans donnée interdite.

## 4. Activité DTSC

- Créer une activité interne, assigner, commenter et joindre un document selon les capacités existantes.
- Soumettre, demander une correction puis terminer.
- Résultat : historique conservé et notifications actionnables.

## 5. Activité entreprise

- Créer une activité dans une organisation cliente, assigner un membre et ouvrir depuis la notification.
- Résultat : contexte correct, accès refusé hors organisation.

## 6. Tâche, checklist et blocage

- Créer et assigner une tâche.
- Ajouter plusieurs éléments de checklist, les cocher et vérifier la progression calculée.
- Déclarer un blocage, le résoudre puis terminer et archiver la tâche.
- Résultat : progression non arbitraire et historique complet.

## 7. Dépendance cyclique

- Créer A, B et C ; ajouter A → B puis B → C.
- Tenter C → A.
- Résultat : refus `DEPENDENCY_CYCLE`, sans relation partielle.

## 8. Filtres personnels

- Créer un filtre pour un module pris en charge, le définir par défaut, recharger, modifier puis supprimer.
- Résultat : persistance privée, aucun élargissement des objets visibles.

## 9. Demande interne

- Créer un brouillon, renseigner catégorie/type, priorité, destinataire et échéance.
- Soumettre, assigner, demander une information, répondre, résoudre, clôturer et rouvrir lorsque permis.
- Résultat : statuts valides, historique et notifications cohérents.

## 10. Validation avec correction

- Soumettre un objet avec un validateur distinct.
- Ouvrir comme validateur, consulter la source, commenter et demander une correction motivée.
- Corriger comme demandeur, soumettre à nouveau et approuver.
- Résultat : versions 1 et 2 conservées, décision liée à la version 2, source actualisée.

## 11. Refus et double décision

- Soumettre un second objet et le refuser avec motif.
- Réessayer une décision ou rejouer la requête.
- Résultat : refus historisé et seconde décision empêchée/idempotente.

## 12. Réunion

- Créer une réunion avec plusieurs participants et vérifier les conflits.
- Accepter/refuser selon les actions disponibles, modifier le créneau, ajouter l'ordre du jour.
- Rédiger et publier un compte rendu, enregistrer une décision et créer une action de suivi.
- Résultat : l'action référence une vraie tâche et reste liée à la réunion.

## 13. Workflow

- Créer ou sélectionner un modèle, publier une version et démarrer une instance.
- Agir avec les acteurs prévus, demander une correction, suspendre/reprendre et terminer selon les capacités déployées.
- Résultat : acteurs serveur déterministes, transitions et retries sans doublon.

## 14. Versionnement de workflow

- Démarrer une instance avec une version active.
- Publier une nouvelle version du modèle puis démarrer une seconde instance.
- Résultat : l'ancienne instance conserve sa version ; la nouvelle utilise la nouvelle version.

## 15. Documents

- Uploader un vrai fichier autorisé, ouvrir l'aperçu si le format le permet et télécharger.
- Lier le document à une tâche, créer une nouvelle version, restaurer/activer une version antérieure selon les actions disponibles, archiver puis restaurer.
- Résultat : versions conservées, un seul binaire par version et liens persistants.

## 16. Permissions documentaires

- Ouvrir le document avec un utilisateur autorisé puis avec un utilisateur non autorisé, y compris par URL directe.
- Résultat : téléchargement et aperçu refusés sans révéler les métadonnées privées.

## 17. Intégration ERP

- Utiliser un achat, budget, dépense ou autre objet ERP disposant d'une validation/échéance commune.
- Ouvrir depuis la file standard, décider avec l'acteur autorisé et vérifier l'état ERP.
- Résultat : état source synchronisé et aucun moteur ou objet métier dupliqué.

## 18. Accès révoqué

- Ouvrir une tâche, une réunion et un document d'organisation.
- Révoquer le membership dans une autre session puis actualiser les liens directs.
- Résultat : objets filtrés et accès refusés de manière sûre.

## 19. Mobile

Tester 320, 360, 375, 390, 414 et 768 px :

- agenda, filtres horizontaux, listes, formulaires, validations, réunions, workflows, documents, aperçus, commentaires et dialogues ;
- navigation clavier et clavier mobile ;
- absence de débordement global et actions principales accessibles.

## 20. PWA et reprise

- Installer la PWA, recevoir une notification ou un rappel de test et ouvrir l'objet.
- Couper le réseau pendant une consultation, rétablir la connexion puis rejouer une mutation idempotente.
- Résultat : aucune donnée privée mise en cache hors politique, aucune double transition.

## Rapport du propriétaire

Pour chaque scénario, renseigner : exécutant, date, environnement, résultat, anomalies, captures et identifiants de test.

**Tests E2E manuels préparés — validation du propriétaire en attente**
