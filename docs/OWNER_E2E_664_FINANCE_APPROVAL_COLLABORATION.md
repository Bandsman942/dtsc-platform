# OWNER E2E #664 — validations Finance et collaboration

Statut initial : **NOT_EXECUTED**

Cette recette doit être réalisée sur le SHA final de la PR #664 avant merge. La preuve attendue du propriétaire est la confirmation explicite **« E2E #664 bon »** après les scénarios ci-dessous.

## Prérequis

- entreprise cliente de test avec modules `FINANCE_PAYMENTS`, `FINANCE_RECEIVABLES`, `FINANCE_CASH` et `DOCUMENTS` actifs ;
- deux utilisateurs actifs lorsque la séparation des fonctions l’exige : préparateur et validateur ;
- au moins un paiement, une facture client et une clôture de caisse réellement en attente de validation ;
- au moins un avoir client ou fournisseur pour la recette des commentaires ;
- test en français puis contrôle de la même surface en anglais.

## 1. Paiements

1. Ouvrir un paiement `PENDING_APPROVAL` avec le validateur désigné.
2. Cliquer sur **Approuver**.
3. Saisir exactement `Ok` dans le commentaire.
4. Confirmer.
5. Vérifier : succès, pas de toast « Transition impossible », statut approuvé et détail actualisé.
6. Sur une action Annuler/Contrepasser, saisir moins de 4 caractères.
7. Vérifier : le navigateur empêche la soumission ou l’interface explique le minimum ; avec un motif valide, l’action suit ensuite le workflow normal.

## 2. Ventes et créances

1. Ouvrir une facture client `PENDING_APPROVAL` affectée au compte connecté.
2. Approuver avec le commentaire `Ok`.
3. Vérifier le toast de succès et le nouveau statut.
4. Provoquer volontairement un conflit de révision en ouvrant le même objet dans deux onglets, modifier/décider dans le premier puis agir dans le second.
5. Vérifier que le second affiche une explication du type « cette facture a changé entre-temps » plutôt qu’un message générique.
6. Vérifier qu’un utilisateur non désigné reçoit une explication précise d’affectation/permission.

## 3. Caisse

1. Ouvrir une clôture `PENDING_VALIDATION` affectée au validateur.
2. Choisir **Approuver la clôture**.
3. Saisir `Ok`.
4. Enregistrer.
5. Vérifier que la caisse passe à `CLOSED`.
6. Tester ensuite un refus avec `Ok` : le motif trop court doit être bloqué clairement.
7. Saisir un motif d’au moins quatre caractères et vérifier le parcours de refus.
8. Vérifier qu’une clôture sans validateur conserve le parcours de récupération #662 et affiche le message précis attendu.

## 4. Documents financiers

Sur Paiement, Facture/Avoir et Caisse :

1. ouvrir le détail ;
2. vérifier **Documents et collaboration** ;
3. développer **Documents financiers** ;
4. vérifier la hiérarchie visuelle, l’état « stockage privé / accès contrôlé » et les deux CTA ;
5. **Voir les documents** doit ouvrir le module Documents filtré sur l’objet ;
6. **Ajouter un document** doit ouvrir le même contexte avec l’action de téléversement ;
7. revenir au détail sans scroll horizontal global.

## 5. Conversation financière

1. développer **Conversation financière** ;
2. publier un commentaire multiligne ;
3. vérifier auteur, date, contenu et compteur ;
4. modifier puis supprimer son propre commentaire ;
5. replier puis déplier la conversation : les messages chargés doivent rester disponibles ;
6. tester un avoir client et un avoir fournisseur : aucun message « Cet objet financier ne prend pas en charge les commentaires » ne doit apparaître ;
7. tester également une créance/dette ouverte ;
8. vérifier que la zone de composition reste accessible avec le clavier mobile.

## 6. Erreurs métier

Vérifier au minimum les familles suivantes lorsqu’elles peuvent être reproduites :

- mauvais validateur ;
- auto-validation interdite ;
- approbation absente ;
- révision obsolète ;
- statut incompatible ;
- motif obligatoire/insuffisant ;
- permission Finance retirée ;
- session expirée.

Le toast doit décrire le problème métier et, lorsque possible, l’action corrective. Aucun code Prisma, SQL, route API, UUID tenant ou stack trace ne doit être affiché.

## 7. Responsive, thème et accessibilité

Réaliser les contrôles aux largeurs :

- 320 px ;
- 360 px ;
- 375 px ;
- 390 px ;
- 414 px ;
- 768 px ;
- 1024 px.

Vérifier :

- Samsung Internet / Chrome mobile sur le parcours principal ;
- mode sombre et clair ;
- FR et EN ;
- aucun scroll horizontal global ;
- titres et CTA non coupés ;
- cibles tactiles ;
- focus clavier ;
- ouverture/fermeture des sections ;
- textarea avec clavier virtuel et safe area.

## Résultat

Après exécution complète et satisfaisante, confirmer dans la conversation ou la PR :

> E2E #664 bon

Avant cette confirmation, la PR doit rester non fusionnée.
