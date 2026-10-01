# OWNER E2E — Hotfix #758

Statut initial : **NOT_EXECUTED**.

## 1. Trésorerie > Financements mobile

Sur 320, 360, 375, 390 et 414 px :
- ouvrir Trésorerie > Financements ;
- vérifier que le texte d’information occupe une largeur normale et ne casse plus mot par mot ;
- vérifier que « Nouvelle entrée de fonds » est sous le texte et tient dans l’écran ;
- à 768/1024 px, vérifier le retour à la disposition texte + bouton.

Tester FR/EN, clair/sombre et focus clavier.

## 2. Comptabilité — Plan

Créer un plan personnalisé :
- formulaire : Code + libellés FR/EN, aucun faux champ Type ;
- fiche : Code, Libellé, Origine « Plan personnalisé », Statut ;
- plein écran : mêmes données ;
- `…` : Modifier si autorisé, Supprimer uniquement si le plan est DRAFT et vide.

Sur le plan OHADA par défaut :
- Origine doit identifier le template ;
- les comptes réglementaires ne doivent pas proposer de modification/suppression directe.

## 3. Comptabilité — Compte

Sur plan personnalisé :
- créer un compte avec Type de compte ;
- vérifier le même type dans carte et détail ;
- modifier ses libellés/type avant utilisation ;
- après utilisation, vérifier que les changements structurels non sûrs sont refusés.

Sur plan OHADA :
- créer un sous-compte personnalisé en choisissant un compte parent ;
- vérifier que le type est hérité ;
- vérifier qu’un compte officiel du template n’expose pas de faux CRUD.

## 4. Exercice

Créer un exercice avec Code + Libellé + dates.
Vérifier :
- carte : Code, Libellé, Dates, Statut ;
- détail : mêmes données ;
- `…` : Modifier/Supprimer/Ouvrir uniquement selon état et permission.

## 5. Période

Créer une période avec Exercice + Code + Libellé + dates.
Vérifier :
- carte et détail cohérents ;
- une période inutilisée peut être modifiée/supprimée ;
- après écritures/imports/clôture, les actions destructives disparaissent ou sont bloquées.

## 6. Règles OHADA

Dans Comptabilité > Règles :
- vérifier une couverture riche (clients, fournisseurs, ventes, TVA, stock, COGS, caisse, banque, emprunts, capital…) ;
- liste : Règle, Plan, Compte cible, Origine, Statut ;
- détail : mêmes informations principales + clé sémantique et dates d’effet ;
- une règle OHADA affiche une origine template et n’offre pas Modifier/Désactiver.

## 7. Règle manuelle sur plan personnalisé

- ouvrir « Nouvelle règle » ;
- choisir un plan personnalisé ;
- choisir une règle sémantique ;
- choisir un compte du même plan ;
- enregistrer ;
- vérifier liste/détail ;
- modifier le compte cible ou les dates ;
- désactiver via `…`.

Cas négatifs :
- compte d’un autre plan ;
- compte de nature incompatible ;
- règle dupliquée active ;
- tentative de modifier une règle template.

## 8. Menus contextuels ERP

Vérifier les plein-écrans :
- Gaming postes ;
- tarification ;
- sessions ;
- réservations ;
- encaissement ;
- clôture ;
- tournoi ;
- Comptabilité masters/règles.

Les actions globales de l’élément doivent être dans `…`. Les actions propres à une sous-ligne restent dans la sous-ligne.

## 9. Permissions

Avec un utilisateur lecture seule :
- aucun CRUD interdit ne doit être visible ;
- appel direct d’une mutation interdite doit être refusé par le backend.

Avec un gestionnaire autorisé :
- seules les actions compatibles avec l’état métier sont proposées.

## 10. Bloc générique

Parcourir plusieurs modules ERP :
- le bloc « Accès et responsabilités » ne doit plus apparaître ;
- les protections RBAC restent effectives.

## Validation propriétaire

Remplacer `NOT_EXECUTED` uniquement après confirmation explicite du propriétaire.