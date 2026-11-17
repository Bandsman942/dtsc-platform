# Hotfix #1212 — Inventory & Lot Traceability 2.0 (DRAFT)

## Tranche initiale
- GET inventory?view=lot-options&warehouseId=…&search=…&page=… : session, droit écriture, dépôt actif, MANAGE_STOCK, catalogue actif/stockable, suivi lots, 25 résultats et pagination, aucun solde d'un autre dépôt.
- Formulaire : dépôt d'abord, recherche indépendante de la liste des règles, pagination, chargement/erreur/vide, date obligatoire pour article suivi en péremption.
- PUT item-policy : refus des politiques globales depuis un périmètre boutique isolé, rate limit, transaction Serializable, contrôle stock historique sans lot et lots non datés, 409 en cas de conflit. Aucune quantité ni valeur modifiée.
- Le routage existant est conservé; aucune migration. Aucune modification de production.

- Contrôle des références catalogue aussi sur POST lots, limitation des mutations, UX actions selon permissions. QA comportementale de la tranche initiale : `pnpm qa:inventory-lot-traceability-1212` intégrée à qa:regression (non exécutée localement).

## Tranche réception fournisseurs (en validation)
- Les deux routes de réception acceptent `lotAllocations` par ligne d’achat : numéro réel, dates et quantité. La somme doit correspondre à la réception. Une ligne de service ne possède pas de lot.
- Création ou réutilisation transactionnelle du lot du dépôt, refus de dates/statuts incompatibles ; mouvements distincts par lot. Le lien historique par ligne conserve le premier mouvement ; le journal canonique contient toutes les sorties/entrées par source de réception. Pas de double quantité ni de migration. Le rapprochement de valorisation reste celui du moteur Finance existant, à tester (aucune valeur comptable inventée).
- Formulaire Achats : champs multiples par ligne suivie avec aide FR/EN, erreur métier contextualisée. Cette tranche n’atteste ni les tests de production ni la réception pharmaceutique réglementée.

## Restant (bloquant)
Assistant de réaffectation historique transactionnel avec approbation et valeur conservée; certification achats et valorisation, réservations/livraisons multi-lots; moteur FEFO commun et POS; pertes, rappels et comptabilité; Design 2.0 et tests multisectoriels. Voir issue #1212. Ne pas merger avant clôture de tous les points.

## Recette propriétaire (NON EXÉCUTÉE)
1. Article stockable suivi, sans solde dans un dépôt autorisé : présent; service, article inactif ou non suivi : absent.
2. Recherche SKU au-delà de 50 articles, filtre de la liste des règles indépendant; dépôt non autorisé et autre tenant refusés.
3. Article à solde sans lot : activation refusée sans mutation. Lot sans date : activation péremption refusée. Concurrence : 409.
4. Lot enregistré : quantité inchangée; entrée approuvée uniquement.
5. Restant : répartition 100 en 30+70, valeur inchangée; réception/livraison multi-lots et FEFO, ventes/retours, réservations, pertes, comptabilité, Pharmacy/Health/Manufacturing, mobile 320px FR/EN.

Quality, Migration, Delivery, QA ciblées et globales, Playwright et E2E propriétaire sur SHA final requis. Aucun résultat déclaré à ce stade.
