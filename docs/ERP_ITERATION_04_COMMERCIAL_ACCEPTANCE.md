# Attestation de recette commerciale — ERP, itération 04

Date de décision : 2 août 2026  
Décideur : propriétaire de DTSC Platform  
Environnement déclaré : Production, après fusion de l’itération 4 dans `main`  
Portée : Finance opérationnelle

## Décision du propriétaire

Le propriétaire de DTSC Platform a confirmé explicitement que la campagne E2E manuelle authentifiée de l’itération 4 a été exécutée et que tous les tests passent.

Cette confirmation constitue la décision produit requise pour promouvoir individuellement les modules concernés vers :

- maturité `COMMERCIAL_READY` ;
- `commercializable: true` ;
- aucun critère commercial bloquant restant.

L’assistant n’affirme pas avoir exécuté lui-même ces tests. La preuve enregistrée ici est l’attestation explicite du propriétaire, complétée par les Quality Gates automatisés du dépôt.

## Modules acceptés

- `FINANCE_OVERVIEW` — Vue d’ensemble Finance ;
- `FINANCE_RECEIVABLES` — Créances et factures clients ;
- `FINANCE_PAYABLES` — Dettes et factures fournisseurs ;
- `FINANCE_PAYMENTS` — Paiements et allocations ;
- `FINANCE_TREASURY` — Trésorerie ;
- `FINANCE_CASH` — Caisse ;
- `FINANCE_BANK` — Banque et relevés, dans le périmètre du format CSV officiellement supporté ;
- `FINANCE_RECONCILIATION` — Rapprochement bancaire et financier.

## Résultats E2E attestés

| Scénario | Couverture | Résultat propriétaire |
|---|---|---|
| `FIN-E2E-04-001` | Configuration financière et checklist | `RÉUSSI` |
| `FIN-E2E-04-002` | Créance client complète | `RÉUSSI` |
| `FIN-E2E-04-003` | Avoir client | `RÉUSSI` |
| `FIN-E2E-04-004` | Dette et contrôle commande-réception-facture | `RÉUSSI` |
| `FIN-E2E-04-005` | Paiement non affecté puis allocation | `RÉUSSI` |
| `FIN-E2E-04-006` | Transfert de trésorerie | `RÉUSSI` |
| `FIN-E2E-04-007` | Caisse et clôture indépendante | `RÉUSSI` |
| `FIN-E2E-04-008` | Import bancaire, invalidité et doublon | `RÉUSSI` |
| `FIN-E2E-04-009` | Rapprochement et non-duplication | `RÉUSSI` |
| `FIN-E2E-04-010` | Blocage sur période fermée | `RÉUSSI` |
| `FIN-E2E-04-011` | Navigation Relations avec les entreprises | `RÉUSSI` |
| `FIN-E2E-04-012` | Français, mobile et liens profonds | `RÉUSSI` |
| `FIN-E2E-04-013` | Permissions et isolation tenant | `RÉUSSI` |

## Critères de clôture

- tous les scénarios critiques sont déclarés réussis ;
- aucun défaut critique ouvert n’a été signalé par le propriétaire dans cette décision ;
- la confirmation explicite du propriétaire est acquise ;
- la matrice de maturité est mise à jour dans une PR séparée ;
- les Quality Gates GitHub restent obligatoires avant fusion ;
- le déploiement Production reste exclusivement déclenché depuis `main`.

## Limites conservées

- la promotion commerciale ne fusionne pas facture, créance, paiement, allocation, transfert, écriture ou rapprochement ;
- elle ne permet aucune auto-approbation interdite ;
- elle ne contourne pas les périodes fermées, les permissions, l’isolation tenant ou l’audit ;
- le module Banque est commercialisé pour les formats réellement supportés et testés, sans promettre des parseurs inexistants ;
- toute régression majeure impose un déclassement immédiat jusqu’à correction et nouvelle validation.

## Sources exécutables

- `lib/enterprise/module-commercial-readiness-iteration-04.json` ;
- `scripts/qa-erp-professional-iteration-04-finance-checks.mjs` ;
- `docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_04.md` ;
- les workspaces, routes, documents de domaine et contrats QA de l’itération 4.
