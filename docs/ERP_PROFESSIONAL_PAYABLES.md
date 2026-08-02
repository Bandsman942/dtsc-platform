# Dettes et factures fournisseurs professionnelles

## Chaîne métier

`ACHAT → COMMANDE FOURNISSEUR → RÉCEPTION → FACTURE FOURNISSEUR → DETTE → PAIEMENT → COMPTABILISATION`.

La facture approuvée produit une dette commune unique. La référence fournisseur, le tenant, la devise, la période et l’idempotence sont contrôlés côté serveur.

## Contrôle commande-réception-facture

Le détail conserve les quantités commandées, reçues et facturées, les prix, la devise et les écarts. Une dérogation exige une permission, un motif et un audit ; l’écart original n’est jamais effacé.

## Expérience

Vues : Factures fournisseurs, Dettes, Avoirs fournisseurs, À valider, À payer et En retard. Formulaire professionnel, fiche détaillée, documents privés, commentaires auditables et actions de workflow.

## Corrections

Avant comptabilisation : annulation contrôlée. Après comptabilisation : avoir fournisseur, remboursement ou contrepassation. Aucune modification silencieuse d’une facture comptabilisée.

## Maturité

`COMMERCIAL_READY` — `commercializable: true`.

La campagne E2E authentifiée a été déclarée entièrement réussie par le propriétaire le 2 août 2026, notamment pour le contrôle commande-réception-facture, les écarts, l’approbation indépendante, la dette unique et les paiements partiels puis complets. Référence : `docs/ERP_ITERATION_04_COMMERCIAL_ACCEPTANCE.md`.
