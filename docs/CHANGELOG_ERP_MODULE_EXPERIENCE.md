# Changelog — Cohérence des modules, offres et navigation ERP

## Livré

- activation transactionnelle d’un module avec ses prérequis ;
- refus de désactivation lorsqu’un service actif dépend encore du module ;
- réconciliation automatique des modules avec l’abonnement courant ;
- création des lignes canoniques manquantes pour les anciens tenants ;
- désactivation non destructive des aliases et codes historiques ;
- ordre canonique partagé entre navigation et administration ;
- offres renommées Essentiel, Professionnel et Entreprise ;
- catalogue des services inclus visible dans Administration DTSC ;
- limites d’offres adaptées au nombre réel de modules ERP ;
- comptabilité courante intégrée à l’offre Professionnel ;
- rail mobile horizontal avec icônes et module actif surveillé ;
- recentrage automatique du module sélectionné ;
- messages d’administration et d’activation reformulés en français commercial ;
- audit des dépendances regroupé par module et présenté avec les libellés métier ;
- nouveau quality gate `qa:erp-module-experience` intégré à la régression.

## Compatibilité

- aucune table ni colonne supprimée ;
- aucune migration historique modifiée ;
- aucune donnée métier créée par la réconciliation ;
- les lignes historiques restent disponibles pour l’audit ;
- les permissions serveur et l’isolation tenant restent obligatoires ;
- la Production continue de provenir uniquement de `main`.
