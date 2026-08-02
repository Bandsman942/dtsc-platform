# Fiscalité professionnelle

## Périmètre livré

Le module `FINANCE_TAX` gère des codes fiscaux configurables, leurs taux historisés, les comptes collectés ou récupérables et les états fiscaux opérationnels produits depuis les écritures.

Il ne prétend pas automatiser toutes les déclarations légales de toutes les juridictions.

## Données

- code et libellés ;
- catégorie fiscale ;
- juridiction éventuelle ;
- taux et date d’effet ;
- règle d’arrondi ;
- compte fiscal collecté ;
- compte fiscal déductible ;
- statut et historique.

## Historisation

Un nouveau taux crée une nouvelle période d’effet. Les factures et écritures historiques conservent le taux qui leur était applicable ; aucun changement de configuration ne réécrit les transactions passées.

## Contrôles

- compte fiscal appartenant au même tenant ;
- taux valide à la date de l’opération ;
- absence de double application ;
- période comptable autorisée ;
- devise cohérente ;
- exonération justifiée selon les données disponibles.

Les rapports générés sont présentés comme rapports ou brouillons opérationnels, jamais comme déclarations officielles sans validation juridique et fiscale compétente.
