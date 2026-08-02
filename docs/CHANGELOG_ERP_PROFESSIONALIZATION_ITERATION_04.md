# Changelog — Professionnalisation ERP, itération 04

Date : 2 août 2026

## Portée

Professionnalisation de : Vue d’ensemble Finance, Créances, Dettes, Paiements, Trésorerie, Caisse, Banque et Rapprochement.

## Changements

- remplacement du visualiseur générique par des workspaces métier dédiés ;
- assistant de préparation Finance et checklist traduite ;
- formulaires et détails pour factures clients et fournisseurs ;
- vues créances, dettes, avoirs, échéances et retards ;
- contrôle commande-réception-facture ;
- paiements, approbation, confirmation et allocations bornées ;
- comptes financiers et transferts ;
- ouverture, comptage, clôture et validation indépendante de caisse ;
- import CSV bancaire prévisualisé et borné ;
- détails de relevé et de rapprochement ;
- correspondances manuelles et clôture contrôlée ;
- documents privés et commentaires Finance CRUD auditables ;
- vocabulaire français explicite ;
- dialogs plein écran, clavier numérique et actions tactiles ;
- maturité `PROFESSIONAL_READY`, jamais `COMMERCIAL_READY` sans validation propriétaire.

## Migration

Ajout non destructif de `EnterpriseFinanceComment`. Aucune migration historique modifiée et aucune donnée financière supprimée.

## Rollback

Désactiver les nouvelles actions ou restaurer l’ancienne lecture sans supprimer facture, dette, paiement, allocation, écriture, session de caisse, relevé ou rapprochement.

## Statut E2E

Tests E2E manuels préparés — validation du propriétaire en attente.
