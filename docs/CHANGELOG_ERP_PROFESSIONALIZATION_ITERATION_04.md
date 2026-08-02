# Changelog — Professionnalisation ERP, itération 04

Date initiale : 2 août 2026  
Promotion commerciale : 2 août 2026

## Portée

Professionnalisation puis promotion commerciale de : Vue d’ensemble Finance, Créances, Dettes, Paiements, Trésorerie, Caisse, Banque et Rapprochement.

## Changements fonctionnels livrés

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
- dialogs plein écran, clavier numérique et actions tactiles.

## Promotion commerciale

Le propriétaire de DTSC Platform a confirmé le 2 août 2026 que tous les scénarios E2E manuels authentifiés de l’itération 4 passent.

Les huit modules sont donc promus individuellement vers :

- `maturity: COMMERCIAL_READY` ;
- `commercializable: true` ;
- `criteriaMissing: []`.

La preuve de décision est enregistrée dans `docs/ERP_ITERATION_04_COMMERCIAL_ACCEPTANCE.md` et la matrice détaillée dans `docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_04.md`.

Le module Banque est commercialisable dans le périmètre du CSV officiellement supporté et testé. Aucun format non implémenté n’est annoncé.

## QA renforcée

La gate `scripts/qa-erp-professional-iteration-04-finance-checks.mjs` doit désormais échouer si :

- un module de l’itération 4 n’est plus `COMMERCIAL_READY` ;
- `commercializable` repasse à `false` ;
- un critère manquant réapparaît ;
- l’attestation propriétaire ou le résultat des 13 scénarios disparaît ;
- une preuve déclarée est absente ;
- les contrats fonctionnels, sécurité, français, mobile, liens profonds ou navigation régressent.

## Migration

Ajout non destructif historique de `EnterpriseFinanceComment`. La promotion commerciale n’ajoute aucune migration, ne modifie aucune migration appliquée et ne supprime aucune donnée financière.

## Rollback

En cas de régression majeure, déclasser immédiatement le module concerné dans la matrice de maturité, masquer ou désactiver l’action fautive et conserver toutes les factures, dettes, paiements, allocations, écritures, sessions de caisse, relevés et rapprochements. Toute correction comptable utilise les mécanismes de contrepassation existants.

## Statut E2E

**Recette E2E propriétaire validée — tous les scénarios ont réussi — promotion commerciale autorisée.**
