# #1228 — Migration des quantités physiques à six décimales

Candidate non déployée : `20261125190000_physical_quantity_six_decimals`.

Complément non déployé : `20261125200000_inventory_catalog_tenant_reference`. Le test PostgreSQL du SHA `e0d98f94` a démontré que la FK composite stock→catalogue décrite par Prisma manquait physiquement. La nouvelle migration ajoute et valide cette contrainte, sans toucher la migration de précision déjà exécutée en CI. Une référence historique orpheline/hors tenant fait échouer la validation : diagnostic et remédiation séparés, jamais correction automatique.

## Périmètre et capacité

110 colonnes dans 65 modèles : stock, mouvements, inventaires, transferts, réservations, ventes, devis, achats/réceptions, production, retours omnicanaux, projections sectorielles, confection et quantités Health/Pharmacy. Le SQL de migration est l’inventaire exact colonne par colonne.

- `DECIMAL(18,3)` devient `(21,6)` : 15 chiffres entiers conservés.
- `DECIMAL(14,3)` devient `(17,6)` : 11 chiffres entiers conservés.
- Les consommateurs de quantités déjà en `(20,6)` passent à `(21,6)` pour ne pas réduire la capacité entière du registre commun.
- Les montants, coûts unitaires, taux, minutes et comptages entiers conservent leurs types et leurs précisions.
- La contrainte `inv_transfer_value_amount_ck` conserve positivité, valeur arrondie à six décimales, devise, révision et conservation source. Seule sa restriction de quantité à trois décimales devient six.

Aucun `UPDATE`, backfill, changement de valeur métier ou journal POSTED. Les contraintes et clés historiques restent en place. Les anciennes migrations restent intactes.

## Préconditions opérationnelles

1. Appliquer toute la chaîne sur PostgreSQL isolé ; exécuter `qa:data-intelligence-1228`, `qa:data-intelligence-1228:postgres` et les parcours réels de réception, réservation, vente, transfert, inventaire, retour et production.
2. Tester également la mise à niveau d’une copie comportant les valeurs limites existantes, les contraintes de transfert et les historiques sectoriels. Le contrôle des types après une installation vide ne remplace pas cette preuve.
3. Mesurer durée, verrous, taille et marge disque sur une copie représentative. Un changement de typmod peut réécrire une table et prendre un verrou exclusif ; il ne faut pas supposer une migration instantanée.
4. Préparer sauvegarde et restauration vérifiée selon le runbook existant. Suspendre les écritures concurrentes au besoin pendant la fenêtre validée.
5. Le SQL est transactionnel, avec `lock_timeout = 10s`. Un verrou indisponible provoque l’échec ; diagnostiquer et replanifier selon le runbook Prisma, sans modifier une migration appliquée.

Production exclusivement via main après contrôles et OWNER_E2E explicite. Aucun lancement manuel de cette migration sur une entreprise réelle dans cette reprise.

## Contrat applicatif

`quantity-policy.ts` refuse toute perte de précision, dépassement physique et fraction incompatible avec l’unité effective. Le contexte arithmétique local protège les micro-unités près de la limite entière. Les mouvements internes acceptent Decimal/chaîne pour éviter un aller-retour par Number. Les valeurs historiques incompatibles ne sont pas arrondies : l’affichage exact et le signalement restent nécessaires.

Le helper de conversion exige un facteur fiable fourni par l’appelant et vérifie exactement l’unité cible. Aucun registre de conversions n’existe dans le catalogue inspecté ; aucune conversion n’est déduite d’un nom ou symbole. Ce helper ne constitue pas à lui seul un parcours d’achat/vente en unités distinctes : les références, facteurs historiques et écrans correspondants restent à raccorder et certifier.

Les garde-fous physiques de FEFO, réservations, retours et preuves de transfert utilisent six décimales. Les achats et la production ne doivent plus tronquer les quantités à trois. Les coûts et montants gardent leurs règles indépendantes.

## Retour arrière

Ne jamais rétrécir les colonnes, arrondir ou supprimer les quantités enregistrées. Le schéma élargi peut rester en place. Avant le premier mouvement à plus de trois décimales, une PR de retour applicatif peut revenir à l’ancienne limitation. Après un tel mouvement, conserver le moteur exact et bloquer les nouvelles saisies concernées si nécessaire pendant un correctif en avant. Revenir à un ancien code qui arrondit ces valeurs n’est pas un rollback sûr. Toute correction métier historique exige le workflow autorisé et sa trace.

## Preuves requises

Les nouveaux contrôles PostgreSQL vérifient les types déployés, les limites, une soustraction exacte, la contrainte de transfert et une fixture Prisma réelle (solde limite, mouvement, couche de coût, FK inter-tenant refusée et clé d’idempotence). La fixture exige une base locale isolée `*_test` et un flag explicite ; ses écritures sont annulées et l’absence de résidus est vérifiée. Ces contrôles sont ajoutés aux Quality Gates. Ils ne certifient pas seuls la mise à niveau d’une base peuplée, les performances, les parcours Health/Pharmacy ou l’E2E propriétaire. Voir la matrice du cahier des charges pour les lots encore ouverts.
