# Maturité commerciale ERP — DTSC Platform

Version : 3
Évaluation courante : 2 août 2026

## Sources exécutables

- Registre canonique : `lib/enterprise/module-registry*.json` et `module-registry.ts`.
- Évaluation produit de base : `lib/enterprise/module-commercial-readiness.json`.
- Complément itération 3 : `lib/enterprise/module-commercial-readiness-iteration-03.json`.
- Résolution typée fusionnée : `lib/enterprise/module-commercial-readiness.ts`.
- Contrôle CI : `scripts/qa-erp-commercial-readiness-checks.mjs` et `scripts/qa-erp-professional-iteration-03-checks.mjs`.
- Visualisation autorisée : `/admin/erp-readiness`.

La matrice affichée dans l’administration est calculée à partir de ces sources. Ce document explique la politique ; il ne remplace pas le manifeste exécutable.

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

## Politique prudente

Aucune promotion automatique vers `COMMERCIAL_READY` n’est autorisée.

Les modules sans preuve produit dédiée reçoivent une évaluation conservatrice. Les modules masqués, planifiés ou retirés restent `BACKEND_READY`. Une section d’administration consolidée peut être `PROFESSIONAL_READY` sans être vendue comme module autonome.

`COMMERCIAL_READY` exige simultanément :

- un parcours métier complet ;
- formulaire, détail et actions ;
- français commercial et internationalisation ;
- expérience mobile ;
- permissions et audit ;
- documentation, onboarding et support ;
- observabilité et QA ;
- packaging commercial ;
- validation fonctionnelle manuelle du propriétaire.

Les tests automatisés verts ne remplacent jamais la validation E2E authentifiée.

## Réévaluation de l’itération 2

Les cinq modules ciblés disposent de workspaces dédiés, formulaires, détails, actions, onboarding, aide, documentation, mobile et QA ciblée. Leur promotion finale reste individuelle et dépend des contrôles CI, des scénarios navigateur authentifiés et des smoke tests Production.

## Réévaluation de l’itération 3

Les modules suivants sont évalués `PROFESSIONAL_READY` et restent `commercializable: false` :

| Module | Preuves principales | Critères encore ouverts |
|---|---|---|
| Ventes, devis et commandes | Devis, transitions, conversion, reliquats, livraisons idempotentes | E2E propriétaire, packaging final |
| Fournisseurs, achats et réceptions | Référentiel fournisseurs, demandes, commandes, réceptions | E2E propriétaire, packaging final |
| Stock, transferts et inventaires | Soldes, transferts, inventaires, ajustements, protection stock négatif | E2E propriétaire, validation scanner sur appareil |
| Ressources humaines | Dossier sans compte, consentement, contrats, organigramme | E2E propriétaire, packaging final |
| Temps et présences | Congés, chevauchements, feuilles de temps, approbation | E2E propriétaire, packaging final |
| Paie opérationnelle | Périodes, population, calcul, approbation, bulletins, recréation après annulation | E2E propriétaire, packaging final |
| Projets et services | Projet, équipe, jalons, risques, détail professionnel | E2E propriétaire, validation du partage client |
| Temps projet et livrables | Temps lié au projet, soumission, corrections et validation | E2E propriétaire, validation externe explicite |
| Actifs et maintenance | Registre, affectation, retour, incidents, maintenance | E2E propriétaire, packaging final |

Le commentaire opposable pour ces modules est :

> Tests E2E manuels préparés — validation du propriétaire en attente.

Aucun de ces modules ne peut être affiché comme `COMMERCIAL_READY` avant confirmation explicite du propriétaire.

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
- un override cible un code absent du registre ;
- un module de l’itération 3 repasse silencieusement par le workspace générique ;
- un rapport déclare les tests E2E réussis sans preuve du propriétaire.

## Maintenance

Toute itération de professionnalisation doit :

1. fermer uniquement les critères réellement traités ;
2. ajouter les preuves correspondantes ;
3. laisser visibles les lacunes restantes ;
4. exécuter les QA du domaine et le contrôle de maturité ;
5. faire relire la promotion par produit et technique ;
6. déclasser immédiatement un module lorsqu’une preuve majeure n’est plus vraie.

Le statut `ACTIVE` demeure un statut technique. Il ne doit jamais être réutilisé comme argument commercial.
