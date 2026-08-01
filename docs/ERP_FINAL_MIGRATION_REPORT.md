# ERP — Rapport final de migration

## Stratégie

Cette itération n’ajoute **aucune suppression physique**. Elle s’appuie sur toutes les migrations historiques, ERP, Finance, Pharmacy, Health et convergence déjà fusionnées. Les modèles legacy restent disponibles pour la lecture et le rollback.

## Base vide

Le Quality Gate crée PostgreSQL, exécute `pnpm prisma migrate deploy`, génère le client Prisma et vérifie la parité du schéma Finance. Le build applicatif reste une condition obligatoire. Une installation neuve ne dépend d’aucun backfill manuel non documenté.

## Base existante

La validation doit utiliser une copie réaliste anonymisée contenant organisations, membres, Core Records, Sector Records, workflows legacy, fournisseurs, achats, factures, paiements, écritures, Pharmacy, Health, documents et éléments non mappés.

Contrôles :

- absence de perte ou corruption ;
- absence de doublon financier ;
- archives toujours lisibles ;
- mutations legacy refusées ;
- mappings et backfills idempotents ;
- rapports, soldes et écritures cohérents ;
- permissions et redirections conservées ;
- confidentialité médicale maintenue.

## Release en deux temps

- **Release A** : code sans nouvelles écritures legacy, UI retirée, audits actifs, migrations additives seulement.
- **Release B** : suppression physique éventuelle après observation, export, sauvegarde, restauration testée et approbation.

Aucune migration historique déjà appliquée n’est modifiée.
