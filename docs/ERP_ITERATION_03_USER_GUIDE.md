# Guide utilisateur — ERP professionnel — Itération 03

## Principe général

Les modules de cette itération utilisent les mêmes référentiels : tiers, catalogue, sites, entrepôts, collaborateurs et relations DTSC. Les formulaires proposent des sélecteurs métier ; aucun identifiant technique ne doit être saisi.

## Relations avec les entreprises

Le module global est accessible depuis la navigation desktop, la navigation mobile, le menu du compte et les notifications, même sans entreprise active.

1. Ouvrir **Relations avec les entreprises**.
2. Consulter **À traiter** pour les invitations et consentements.
3. Consulter **Relations actives** pour les entreprises déjà liées.
4. Consulter **Mes demandes** pour suivre ou annuler une demande.
5. Consulter **Historique** pour les relations refusées, expirées, révoquées ou annulées.

Une relation active n’accorde que les accès explicitement résolus côté serveur.

## Créer un devis et le convertir en commande

1. Vérifier que le client/prospect existe dans **Tiers, clients et prospects**.
2. Vérifier que les produits/services existent dans le catalogue.
3. Ouvrir **Devis, commandes et livraisons**.
4. Cliquer **Nouveau devis**.
5. Sélectionner le tiers, la devise et la validité.
6. Ajouter les lignes du catalogue, quantités, prix, remises et taxes.
7. Enregistrer le brouillon.
8. Envoyer le devis, puis enregistrer son acceptation.
9. Convertir le devis accepté en commande.

Les calculs définitifs sont réalisés côté serveur.

## Enregistrer une livraison

1. Ouvrir la commande confirmée.
2. Cliquer **Enregistrer une livraison**.
3. Choisir l’entrepôt lorsque la commande contient des produits physiques.
4. Saisir les quantités réellement livrées.
5. Ajouter la confirmation ou les observations du destinataire.
6. Enregistrer.

Le serveur refuse toute quantité supérieure au reliquat et empêche un double traitement par clé idempotente.

## Créer une demande d’achat et réceptionner

1. Ouvrir **Fournisseurs, commandes et réceptions**.
2. Créer ou sélectionner le fournisseur.
3. Créer une demande d’achat avec motif, priorité, département et approbateur.
4. Faire approuver la demande par une personne autorisée.
5. Créer la commande fournisseur.
6. Enregistrer une réception partielle ou complète.
7. Vérifier le stock et les écarts.

La réception prépare le rapprochement futur commande-réception-facture.

## Transférer du stock

1. Ouvrir **Stock, transferts et inventaires**.
2. Cliquer **Nouveau transfert**.
3. Sélectionner un entrepôt source et un entrepôt cible distincts.
4. Sélectionner l’article, les emplacements et la quantité.
5. Choisir un approbateur.
6. Soumettre et faire valider.

## Effectuer un inventaire

1. Cliquer **Nouvel inventaire**.
2. Définir l’entrepôt et le type de comptage.
3. Sélectionner l’approbateur.
4. Saisir les quantités comptées.
5. Comparer le théorique et le réel.
6. Faire valider les écarts.

Les ajustements créent des mouvements traçables ; ils ne modifient jamais silencieusement l’historique.

## Créer un collaborateur et lier son compte DTSC

1. Ouvrir **Ressources humaines**.
2. Cliquer **Nouveau collaborateur**.
3. Créer le dossier manuellement sans compte DTSC, ou choisir une option de liaison.
4. Ajouter poste, département, responsable, site et date d’entrée.
5. Créer le contrat de travail.
6. Si nécessaire, envoyer l’invitation de liaison.
7. Le collaborateur accepte depuis son module global **Relations avec les entreprises**.

La révocation retire les accès dérivés mais ne supprime pas le dossier RH.

## Demander un congé

1. Ouvrir **Congés, présence et feuilles de temps**.
2. Cliquer **Demander un congé**.
3. Choisir le type, la période et l’approbateur.
4. Préciser une demi-journée si nécessaire.
5. Soumettre.

Les chevauchements sont contrôlés côté serveur.

## Déclarer du temps

1. Cliquer **Déclarer du temps**.
2. Choisir le collaborateur, la période et l’approbateur.
3. Ajouter la date, la durée, le projet éventuel et la description.
4. Indiquer si le temps est facturable.
5. Soumettre.

Le temps déclaré n’est utilisable par la paie qu’après approbation.

## Préparer une paie

1. Créer une période de paie ouverte.
2. Cliquer **Préparer une paie**.
3. Choisir la période et la devise.
4. Sélectionner les collaborateurs éligibles.
5. Ajouter primes et retenues justifiées.
6. Lancer le calcul.
7. Examiner les anomalies.
8. Soumettre à un approbateur distinct.
9. Faire approuver.
10. Consulter les bulletins privés.

Une paie annulée peut être recréée pour la même période. Une paie approuvée ne crée pas automatiquement un paiement financier.

## Gérer un projet et un livrable

1. Créer un projet avec client, chef de projet, période et budget indicatif.
2. Ajouter l’équipe et les rôles.
3. Ajouter les jalons et les risques.
4. Ajouter un livrable.
5. Soumettre le livrable.
6. Le réviseur peut accepter, rejeter ou demander des corrections.
7. Une nouvelle version ou correction reste identifiable dans l’historique.

## Affecter un actif

1. Créer ou sélectionner une catégorie.
2. Enregistrer l’actif avec sa référence, son fournisseur, sa localisation et sa valeur indicative.
3. Ouvrir l’actif et cliquer **Affecter**.
4. Choisir le bénéficiaire ou le département.
5. Enregistrer l’état au départ et le retour attendu.
6. Déclarer les incidents et maintenances depuis le détail.
7. Au retour, renseigner l’état réel.

## Aide et support

Chaque workspace comporte un bloc d’aide. En cas de problème persistant, créer un ticket Support en précisant : entreprise, module, objet, étapes, résultat attendu, résultat obtenu et capture d’écran.
