# Plan comptable professionnel

## Finalité

Le plan comptable fournit la source unique des comptes utilisés par les journaux, écritures, taxes, immobilisations, stocks et états financiers d’une entreprise cliente.

## Données gérées

- code et libellés français/anglais ;
- type et sous-type ;
- compte parent et niveau hiérarchique ;
- devise éventuelle ;
- compte collectif ou système ;
- autorisation de comptabilisation directe ;
- statut actif ou inactif.

## Contrôles

- code unique dans l’entreprise ;
- parent appartenant au même tenant et du même type ;
- cycle de hiérarchie interdit ;
- compte utilisé non supprimable ;
- changement destructif de type interdit ;
- désactivation privilégiée à la suppression ;
- comptes d’une autre entreprise refusés côté serveur.

## Utilisation

1. Créer le plan comptable.
2. Créer les comptes de regroupement.
3. Créer les comptes mouvementables.
4. Vérifier les comptes de taxes, trésorerie, stock et immobilisations.
5. Désactiver avec précaution les comptes devenus inutilisables.

L’import massif avec prévisualisation n’est pas présenté comme disponible tant que son assistant complet n’est pas livré et validé.
