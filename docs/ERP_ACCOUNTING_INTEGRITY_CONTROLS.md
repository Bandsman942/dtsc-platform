# Contrôles d’intégrité comptable

## Contrôles fondamentaux

Par entreprise et, lorsque demandé, par période :

- somme des débits égale somme des crédits ;
- écriture rattachée à un journal et une période du même tenant ;
- compte actif à la date autorisée ;
- source et clé d’idempotence uniques ;
- aucune écriture comptabilisée modifiée ;
- aucune mutation interdite dans une période fermée ;
- aucune séquence dupliquée ;
- aucune contrepassation orpheline ;
- aucune source comptabilisée deux fois sans justification ;
- balance générale équilibrée.

## Chaînes opérationnelles

L’audit vérifie également, lorsque la politique l’exige : facture client et créance, facture fournisseur et dette, paiement et écriture, transfert équilibré, paie approuvée et comptabilisation, amortissement unique, valorisation unique et rapprochement bancaire non dupliqué.

## Confidentialité

Les scripts d’audit peuvent retourner des identifiants techniques et des compteurs aux opérateurs autorisés, mais ne doivent pas écrire dans les logs les salaires individuels, coordonnées bancaires complètes, documents ou exports financiers complets.

## Réaction aux anomalies

Un audit ne répare jamais silencieusement les données historiques. Il signale l’anomalie, bloque l’action dangereuse et oriente vers une correction, une contrepassation ou une procédure de réouverture contrôlée.
