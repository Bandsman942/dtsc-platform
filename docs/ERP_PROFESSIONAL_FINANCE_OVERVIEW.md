# Vue d’ensemble Finance professionnelle

## Objet

`FINANCE_OVERVIEW` est le point d’entrée de préparation et de surveillance de la Finance opérationnelle. Il réutilise le moteur financier commun et ne crée aucune source concurrente.

## Assistant de configuration

L’assistant présente douze étapes : devise fonctionnelle, devise de présentation, exercice, première période, plan comptable, journaux, comptes financiers, taxes, tolérances, règles de comptabilisation, responsables/approbateurs et vérification finale.

La devise fonctionnelle ne peut pas être changée dangereusement après les premières écritures. Les périodes et la révision optimiste sont contrôlées côté serveur.

## Checklist métier

Les clés techniques sont remplacées par :

- Devise configurée ;
- Exercice actif ;
- Période ouverte ;
- Plan comptable disponible ;
- Journaux des ventes et achats configurés ;
- Compte bancaire ou caisse disponible ;
- Règles de taxes configurées ;
- Comptabilisation prête.

## Indicateurs

Créances, dettes, paiements non affectés, caisses ouvertes, rapprochements, factures non comptabilisées et opérations à valider sont affichés sans additionner silencieusement des devises différentes.

## Sécurité et maturité

Les routes appliquent tenant, membership, module, entitlement, permission, validation, rate limit, transactions et audit.

Maturité : `COMMERCIAL_READY` — `commercializable: true`.

La promotion commerciale repose sur la confirmation explicite du propriétaire du 2 août 2026 : tous les scénarios E2E authentifiés de l’itération 4 ont réussi. La preuve de recette est conservée dans `docs/ERP_ITERATION_04_COMMERCIAL_ACCEPTANCE.md`.
