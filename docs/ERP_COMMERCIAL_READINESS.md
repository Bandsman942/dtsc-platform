# Maturité commerciale ERP — DTSC Platform

Version : 1  
Évaluation initiale : 1 août 2026

## Sources exécutables

- Registre canonique : `lib/enterprise/module-registry*.json` et `module-registry.ts`.
- Évaluation produit : `lib/enterprise/module-commercial-readiness.json`.
- Résolution typée : `lib/enterprise/module-commercial-readiness.ts`.
- Contrôle CI : `scripts/qa-erp-commercial-readiness-checks.mjs`.
- Visualisation autorisée : `/admin/erp-readiness`.

La matrice affichée dans l’administration est calculée à partir de ces sources. Ce document explique la politique ; il ne duplique pas manuellement toute la liste des modules.

## Lecture de la matrice

Pour chaque module, l’administration expose :

- le libellé commercial français ;
- le code technique en information secondaire ;
- le statut technique ;
- la maturité commerciale ;
- la route et le workspace lorsqu’ils existent ;
- le plan minimal ;
- les dépendances ;
- les critères validés et manquants ;
- le contrat QA ;
- les preuves ;
- l’itération suivante ;
- la date d’évaluation ;
- la commercialisabilité.

## Évaluation initiale prudente

Cette itération n’effectue aucune promotion automatique vers `COMMERCIAL_READY`.

Les modules sans preuve produit dédiée reçoivent une évaluation conservatrice `READ_ONLY_UI`, même s’ils sont `ACTIVE`. Les modules masqués, planifiés ou retirés sont évalués `BACKEND_READY`. Les sections d’administration consolidées peuvent être `PROFESSIONAL_READY`, mais ne sont pas commercialisées comme modules autonomes.

Les pilotes évalués explicitement comprennent notamment :

| Surface | Maturité initiale | Motif principal |
|---|---|---|
| Tâches & opérations | `OPERATIONAL_UI` | Flux principaux, formulaire, détail, actions et QA présents ; recette commerciale complète ouverte |
| Demandes internes | `OPERATIONAL_UI` | Cycle de demande exploitable ; promotion commerciale non déclarée |
| Validations | `OPERATIONAL_UI` | File et séparation des responsabilités opérationnelles |
| Réunions | `OPERATIONAL_UI` | Participants, décisions et deep links ; recette finale ouverte |
| Workflows | `PROFESSIONAL_READY` | Moteur, interface, audit, documentation et QA dédiés |
| Budgets | `OPERATIONAL_UI` | Flux métier disponible ; finition linguistique et commerciale restante |
| Rapports | `OPERATIONAL_UI` | Sources métier réelles ; adaptation par rôle et finition à poursuivre |
| Assistant IA entreprise | `PROFESSIONAL_READY` | Expérience dédiée, isolation tenant et QA ; packaging final distinct |

La liste exacte et courante est toujours celle rendue par le manifeste et la page d’administration.

## Anomalies bloquantes

Le contrôle CI échoue notamment si :

- un module commercialisable utilise une interface générique ou non vérifiée ;
- un module `COMMERCIAL_READY` n’a pas d’override explicite ;
- la route ou le workspace manque ;
- une écriture existe sans formulaire prouvé ;
- le détail ou les actions métier manquent ;
- les permissions, l’audit, l’i18n, le responsive ou la QA manquent ;
- des critères restent ouverts ;
- une preuve déclarée est introuvable ;
- un override cible un code absent du registre.

## Maintenance

Toute itération de professionnalisation doit :

1. fermer les critères réellement traités ;
2. ajouter les preuves correspondantes ;
3. laisser visibles les lacunes restantes ;
4. exécuter les QA du domaine et le contrôle de maturité ;
5. faire relire la promotion par produit et technique ;
6. déclasser immédiatement un module lorsqu’une preuve majeure n’est plus vraie.

Le statut `ACTIVE` demeure un statut technique. Il ne doit jamais être réutilisé comme argument commercial.
