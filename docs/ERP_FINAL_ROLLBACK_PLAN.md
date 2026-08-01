# ERP — Plan final de rollback

## Objectif

Le rollback est **non destructif**. Il rétablit un chemin de lecture ou désactive une nouvelle route sans effacer ni réécrire l’historique.

## Rollback applicatif

- désactiver temporairement le domaine ou la route canonique affectée ;
- restaurer une Redirection ou une lecture legacy protégée ;
- maintenir le blocage des nouvelles écritures concurrentes ;
- conserver toutes les relations de mapping et clés d’idempotence ;
- reprendre les traitements après correction par rejeu idempotent.

## Finance

Une écriture comptabilisée ne se supprime et ne se modifie jamais. Toute correction utilise une contrepassation liée, un avoir ou un nouveau paiement/allocation selon le domaine. Le rollback ne peut pas recréer une double créance, détacher une allocation confirmée, réutiliser un numéro ou modifier une période fermée.

## Pharmacy

Conserver lots, mouvements, prescriptions, rappels, blocages, qualité et pharmacovigilance. Une restauration ne doit jamais perdre une quantité réglementée ou contourner FEFO.

## Health

Conserver patients, consultations, dossiers et documents. Aucune donnée clinique ne doit être copiée vers Finance ou exposée pendant le rollback.

## Migration

Les migrations additives sont neutralisées logiquement. Une future migration destructive exige sauvegarde, export, restauration testée et approbation explicite ; elle n’est jamais annulée par une suppression improvisée en Production.
