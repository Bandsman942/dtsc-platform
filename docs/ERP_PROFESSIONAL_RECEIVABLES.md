# Créances et factures clients professionnelles

## Chaîne métier

`VENTE → FACTURE CLIENT → CRÉANCE → PAIEMENT → ALLOCATION → TRÉSORERIE → COMPTABILISATION`.

Chaque objet reste distinct. L’émission utilise le moteur commun, une clé d’idempotence et produit une créance unique. La surfacturation d’une commande ou livraison et la double facture sont refusées côté serveur.

## Expérience

Le workspace dédié propose : Factures clients, Créances, Avoirs, Échéances et Retards. Le formulaire gère client, source, projet, devise, dates, conditions, lignes, quantités, prix, remises et notes. La fiche affiche total, payé, restant, échéance, lignes, statut, documents, commentaires et historique.

L’échéancier distingue : à échoir, 1–30, 31–60, 61–90 et plus de 90 jours. Les devises restent séparées.

## Workflow

Brouillon → validation → émission/comptabilisation → paiement partiel → paiement total. Les corrections après émission utilisent un avoir, remboursement ou une contrepassation contrôlée.

## Collaboration

Les justificatifs sont téléversés dans le module documentaire privé et liés structurellement. Les commentaires sont CRUD pour leur auteur, archivés logiquement et audités ; ils ne remplacent jamais une décision de workflow.

## Maturité

`PROFESSIONAL_READY`, non commercialisable avant validation E2E manuelle explicite du propriétaire.
