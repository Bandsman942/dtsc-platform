# Workflows ERP transverses

## Règles

Le frontend ne modifie jamais directement un statut. Les services vérifient l’état courant, la révision, l’acteur, le tenant, la permission et la séparation des tâches. Une transition réussie produit événement, audit, notification et projection idempotente.

## Chaînes consolidées

- CRM → opportunité → devis → contrat éventuel → commande → livraison → facture → créance → paiement → écriture.
- Besoin → demande d’achat → approbation → commande → réception → stock → facture fournisseur → dette → paiement → écriture.
- Employé → contrat → temps approuvé → paie → bulletin → dette/paiement → écriture.
- Client → contrat → projet → temps → livrable → validation → facturation.
- Achat/création → actif opérationnel → maintenance → immobilisation → amortissement → cession.
- Patient → consultation → prestation → facture commune → ventilation patient/assurance → paiement.
- Produit Pharmacy → achat → réception → lot/FEFO → vente/dispensation → mouvement → facture/paiement communs.

Les commentaires restent CRUD selon leur politique et distincts d’une décision. Une demande de correction est une transition métier explicite, conserve les commentaires et ne remplace pas l’historique.
