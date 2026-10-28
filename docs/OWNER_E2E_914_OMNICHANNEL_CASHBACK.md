# Recette propriétaire #914 — Cashback relationnel omnicanal

**Préconditions :** ce document sert à certifier la PR #915 dans l'environnement de test autorisé; ne pas exécuter des transactions financières de test dans une entreprise cliente réelle. Les déploiements Preview Vercel sont désactivés. **Ne confirmer « E2E #914 BON » qu'après une recette indépendante**, pas sur la seule preuve CI.

## Vérifications métier

1. Dans **Avantages relationnels**, créer un cashback **actif** de 3 %, pour la relation client consentie, sur le module **Retail POS**, devise du shop, sans avantage concurrent sur le même article.
2. Dans Retail, créer une **commande omnicanale** pour un client explicitement relié à cette personne. La demande d'avantage est **réservée**, pas encore consommée; aucun compte n'est crédité.
3. **Paiement d'abord** : créer une facture Sales liée à la commande, la faire valider, émettre et comptabiliser; enregistrer et confirmer un paiement entrant client avec **compte financier réel**; affecter la totalité à la créance de la facture. Vérifier qu'aucun `EARN` n'existe encore avant livraison.
4. Effectuer **une livraison partielle** : pas d'avoir. Terminer la livraison, acceptée par le client ou avec justificatif actif/versionné lié à la commande. Vérifier une attribution **EARN unique** et la consommation de la réserve.
5. Vérifier en Finance une écriture `POSTED` équilibrée : charge `OPERATING_EXPENSE` au débit, dette `CUSTOMER_ADVANCES` au crédit, pour le même client/devise et exactement le montant crédité.
6. **Livraison d'abord** : recommencer avec une autre commande; terminer la livraison avant la facture/paiement. Le cashback reste en attente. Après paiement confirmé et allocation intégrale, constater **exactement un EARN**, pas de double comptabilisation.
7. Rejouer l'API de commande et de livraison déjà terminées ou répéter le paiement sans nouvelle allocation autorisée : une seule attribution par commande et avantage.

## Refus et reprises

8. Paiement partiel, non confirmé ou non affecté : aucun EARN. Facture non émise/non comptabilisée, doublon de facture, autre client, autre devise, pas de remise client ni pièce justificative : aucun EARN.
9. Révoquer la relation avant la livraison/paiement complet et retenter : aucun avoir émis. Restaurer uniquement dans le cadre de la recette et avec autorisation légitime.
10. Annuler une commande non livrée : la réservation est annulée, sans crédit. Tester un retour demandé avant l'attribution : aucun crédit tant que le remboursement n'est pas soldé.
11. Après un EARN, traiter un **retour partiel avec remboursement confirmé et stock régularisé** : débit de reprise proportionnel aux seules lignes éligibles, nouvelle pièce comptable équilibrée `RETAIL_RELATIONSHIP_CREDIT_REVERSED`.
12. Un second retour portant le total à 100 % des lignes : montant cumulé des reprises = EARN original; quota libéré exactement une fois. Rejouer le règlement du même retour : aucune reprise additionnelle.
13. Test tenant et permission : accéder à la commande, la facture ou l'avoir depuis un autre tenant/une session dépourvue de permissions; refus sans fuite de données.

## Validation interface et exploitation

Vérifier les résolutions 320, 360, 375, 390, 414, 768 et 1024 px, desktop, mode sombre, libellés FR/EN, focus/clavier, sans chevauchement. Contrôler le solde d'avoir dans le registre Store Credit et sa réutilisation sur une vente POS ultérieure, avec la même devise et le même tiers.

## Résultat à fournir

- Copie des éléments E2E sans données sensibles : référence commande, référence facture, devise, montants, nombre de crédits, nombre de reprises, preuve comptable équilibrée et screenshots d'interface utiles.
- Décrire les cas refusés, ainsi que le comportement de concurrence/replay.
- **Validation exigée :** message explicite `E2E #914 BON` du propriétaire. Sans ce message, PR #915 reste en brouillon/non fusionnée et aucune Production n'est déclenchée.
