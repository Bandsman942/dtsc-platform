# OWNER E2E — Hotfix #756 financements communs

Statut initial : **NOT_EXECUTED**.

## Préconditions

- entreprise cliente avec Finance/Trésorerie/Comptabilité configurées ;
- au moins trois utilisateurs pouvant jouer initiateur, validateur et confirmateur ;
- compte Banque actif et compte Caisse actif ;
- session de caisse ouverte pour le compte Caisse ;
- période comptable ouverte.

## Scénarios

1. **Apport en capital sur Caisse à 0**
   - créer un apport de 500 USD vers la Caisse ;
   - sélectionner la session ouverte et un validateur indépendant ;
   - approuver avec le validateur ;
   - confirmer avec un troisième utilisateur ;
   - vérifier : compte Caisse +500, mouvement Cash INBOUND +500, trésorerie FUNDING +500, écriture débit Caisse / crédit Capital, chiffre d’affaires inchangé.

2. **Apport en capital sur Banque**
   - confirmer 500 USD sur Banque ;
   - vérifier l’absence de mouvement Cash et la présence trésorerie + comptabilité.

3. **Avance d’associé**
   - sélectionner un compte de passif actif comme contrepartie ;
   - vérifier trésorerie augmentée et crédit du passif, sans produit.

4. **Emprunt reçu**
   - vérifier débit trésorerie / crédit emprunt et aucun impact sur chiffre d’affaires.

5. **Séparation vente / encaissement**
   - vérifier qu’une vente à crédit peut augmenter le chiffre d’affaires sans trésorerie immédiate ;
   - encaisser ensuite la créance et vérifier que le chiffre d’affaires n’est pas reconnu une seconde fois.

6. **Transfert interne**
   - transférer Banque → Caisse ;
   - vérifier que le total de trésorerie entreprise n’augmente pas du seul fait du transfert.

7. **Contrepassation**
   - contrepasser un financement confirmé avec un acteur indépendant ;
   - vérifier mouvement OUTBOUND, solde restauré et écriture comptable inverse liée, original conservé.

8. **Garde Cash**
   - tenter un financement sur Caisse sans session ouverte : erreur métier explicite ;
   - avec plusieurs sessions, sélectionner explicitement la bonne session.

9. **Sécurité**
   - tenter auto-approbation/auto-confirmation ;
   - vérifier refus selon la politique Finance ;
   - vérifier qu’aucune référence d’un autre tenant n’est acceptée.

10. **UI**
    - FR et EN ;
    - clair et sombre ;
    - 320, 360, 375, 390, 414, 768 et 1024 px ;
    - clavier/focus ;
    - aucune page ne déborde horizontalement ;
    - erreur backend : le formulaire reste ouvert avec ses valeurs ;
    - succès backend : toast global puis fermeture/réinitialisation.

## Validation propriétaire

Ne remplacer `NOT_EXECUTED` que par une preuve explicite du propriétaire.