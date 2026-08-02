# Changelog — Professionnalisation ERP — Itération 03

## Base initiale

- SHA de départ : `b4760929aa4ff5531f6bb819481c190ef7804171`
- Branche initiale : `feat/erp-professionalization-iteration-03-operations-hr-projects`
- Pull Request initiale : `#41`
- Fusion initiale Production : `b9304f22a44be19329abbbf643cf69fd4bc176bb`

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

---

## Durcissement après validation manuelle — PR #42

Le propriétaire a exécuté les scénarios manuels initiaux sur Production et a remonté des défauts de présentation et de workflow. Ces constats ont été transformés en contrôles automatiques opposables avant la promotion commerciale.

### Rails, filtres et densité mobile

- Séparation des filtres et onglets des grilles réservées aux boutons d’action.
- Défilement horizontal tactile natif avec `touch-action: pan-x`, inertie mobile, snap et recentrage de l’onglet actif.
- Correction des chevauchements dans les toolbars.
- Correction des titres réduits à une lettre par ligne lorsque des actions étaient affichées.
- Présentation compacte des données, statut et actions sur téléphone.
- Conservation d’une disposition enrichie sur tablette et desktop.

### Relations avec les entreprises

- Les quatre vues restent visibles dans un rail horizontal manipulable : À traiter, Relations actives, Mes demandes et Historique.
- Le formulaire de demande utilisateur est accessible dans **Mes demandes**.
- La demande utilise le code de l’entreprise, le type de relation et un message facultatif.
- L’absence d’annuaire public et le consentement explicite restent obligatoires.

### Contrats et validations

- Le validateur sélectionné reçoit une capacité ponctuelle liée à l’approbation, sans obtenir le droit de gérer tous les contrats.
- Actions ajoutées dans le détail : Approuver, Demander une correction et Refuser.
- Une correction renvoie le contrat en brouillon et conserve le motif dans l’historique d’approbation.
- Notifications profondes vers le contrat et la section de validation.
- Fil de commentaires contractuels visible par les participants du workflow.
- Création, modification et suppression logique d’un commentaire par son auteur.
- Audit des décisions et des commentaires.

### Documents contractuels

- Le lien depuis le contrat ouvre Documents avec le contrat, sa référence et l’action de téléversement préremplis.
- Création des métadonnées documentaires puis ouverture immédiate du sélecteur de fichier réel.
- Téléversement d’une version privée dans le stockage existant.
- Liaison contrôlée au contrat après validation de l’appartenance à la même entreprise.
- Extension du contrôle des liens documentaires aux projets et actifs.

### Formulaires et guides

- Distinction explicite entre droit de lecture, droit d’écriture opérationnelle et administration du module.
- Les boutons de création et formulaires sont affichés aux utilisateurs disposant réellement du droit d’écriture.
- Guide utilisateur dédié à chaque module professionnel : prérequis, procédure, statuts, contrôles et dépannage.
- Aucun lien de guide ne redirige silencieusement vers un module différent.

### Support mobile

- Normalisation des URL absolues avant comparaison avec le chemin courant.
- Surbrillance du module Support lorsqu’il est sélectionné.
- Recentrage automatique de Support dans le rail secondaire mobile.

### Messages vocaux et accusés

- Vérification du contexte HTTPS et de la permission microphone.
- Messages distincts pour permission refusée, microphone absent, microphone occupé, format incompatible, stockage non configuré et panne réseau.
- Support des formats mobiles WEBM, OGG, M4A, MP4, AAC, WAV et 3GP.
- Arrêt et libération fiables des pistes du microphone.
- Un trait : message persisté sur le serveur.
- Deux traits : message reçu par tous les membres actifs.
- Deux traits verts : message lu par tous les membres actifs.
- Les détails individuels de lecture restent disponibles dans Infos du message.

### Promotion commerciale

Après fermeture des défauts rapportés, ajout des preuves et validation des Quality Gates, les modules suivants sont déclarés `COMMERCIAL_READY` et `commercializable: true` :

- `SALES_QUOTES_ORDERS` ;
- `SUPPLIERS_PURCHASES` ;
- `INVENTORY_LOGISTICS` ;
- `HUMAN_RESOURCES` ;
- `TIME_ATTENDANCE` ;
- `PAYROLL_OPERATIONS` ;
- `PROJECTS_SERVICES` ;
- `TIME_DELIVERABLES` ;
- `ASSETS_MAINTENANCE`.

Cette promotion correspond à la décision explicite du propriétaire après sa campagne manuelle initiale et à la fermeture technique des défauts observés. Elle ne constitue pas une affirmation selon laquelle une nouvelle campagne manuelle post-correctif aurait déjà été exécutée.

## QA et E2E

- Quality Gate transversal de l’itération 03 enrichi avec les défauts remontés par le propriétaire.
- Contrôles explicites des rails tactiles, formulaires, densité mobile, workflow contrat, commentaires CRUD, téléversement, guides, Support, microphone, formats audio et accusés de lecture.
- Plan E2E manuel post-correctif conservé.
- Statut post-correctif : **Tests E2E manuels préparés — validation du propriétaire en attente**.
