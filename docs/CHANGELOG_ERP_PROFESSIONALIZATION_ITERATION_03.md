# Changelog — Professionnalisation ERP — Itération 03

## Base

- SHA de départ : `b4760929aa4ff5531f6bb819481c190ef7804171`
- Branche : `feat/erp-professionalization-iteration-03-operations-hr-projects`
- Pull Request : `#41`

## Navigation globale

- Ajout d’une source canonique pour **Relations avec les entreprises**.
- Affichage dans la navigation desktop et mobile.
- Accès sans organisation active.
- État actif et `aria-current="page"` sur les sous-routes.
- Badge borné aux invitations et consentements nécessitant une action.
- Réorganisation du workspace en : À traiter, Relations actives, Mes demandes, Historique.
- Ajout de l’annulation sécurisée d’une demande initiée par l’utilisateur.

## Ventes

- Nouveau workspace dédié aux devis, commandes et livraisons.
- Formulaire de devis relié au référentiel des tiers et au catalogue.
- Calculs définitifs côté serveur.
- Transitions : brouillon, envoi, acceptation, refus, annulation et conversion.
- Détail commande avec quantités commandées, livrées et reliquats.
- Livraison partielle ou complète avec clé idempotente.

## Achats

- Enveloppe professionnelle autour des workspaces fournisseurs et achats existants.
- Sélecteurs de membres et départements.
- Conservation des workflows de demande, approbation, commande et réception.
- Préparation explicite du rapprochement commande-réception-facture.

## Stock

- Nouveau workspace dédié au stock commun.
- Stock par article et emplacement.
- Transferts avec approbateur indépendant.
- Inventaires complets, cycliques ou ciblés.
- Ajustements contrôlés et idempotents.
- Détails des soldes, lots, emplacements et écarts.

## Ressources humaines

- Conservation du workspace professionnel des collaborateurs et de l’identité relationnelle.
- Ajout des contrats de travail professionnels.
- Approbation indépendante des contrats.
- Ajout d’une vue organigramme mobile par département.
- Aucun compte DTSC obligatoire pour créer un dossier RH.

## Temps et congés

- Nouveau workspace pour demandes de congé et feuilles de temps.
- Congés complets ou demi-journées.
- Contrôle des chevauchements côté serveur.
- Déclaration de temps par période, activité et projet.
- Approbation indépendante avant consommation par la paie.

## Paie

- Nouveau workspace de périodes et traitements de paie.
- Assistant de préparation de la population et des variables.
- Contrôles serveur : contrats, devise, doublons, temps approuvé et retenues.
- Soumission à un approbateur distinct.
- Bulletins privés générés après approbation.
- Annulation conservant l’historique et autorisant la recréation de la même période.
- Aucun paiement financier créé automatiquement.

## Projets et livrables

- Nouveau workspace projets, équipes, jalons, risques et livrables.
- Nouveau détail serveur isolé par entreprise.
- Ajout et retrait logique des membres du projet.
- Soumission, correction, validation ou rejet des livrables.
- Aucun accès client automatique.

## Actifs

- Nouveau workspace des actifs, affectations, retours, incidents et maintenances.
- Détail serveur isolé par entreprise.
- Historique des affectations conservé.
- Maintenance préventive et corrective.
- Résolution des incidents sans suppression.
- Distinction entre actif opérationnel et immobilisation comptable.

## QA et E2E

- Ajout d’un Quality Gate transversal pour l’itération 03.
- Ajout du guide utilisateur.
- Ajout du plan E2E manuel détaillé.
- Statut fonctionnel : **Tests E2E manuels préparés — validation du propriétaire en attente**.
