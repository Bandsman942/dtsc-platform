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

## Tranche FEFO commun (en validation)
- Planificateur physique Decimal, date civile, tri déterministe, exclusion quarantaine/blocage, péremption BLOCK ou dernier recours WARN/ALLOW; déduction des réserves et retenues factures.
- Validation Retail de la demande totale par lot et article, y compris livraison finale après crédit partiel ; exclusion des retenues de la facture en cours. Conservation du contrat facture (une ligne par article) : allocation automatique multi-lots de la facture reste à réaliser avec une provenance adaptée. Les réservations sans lot sont déduites conservativement sur chaque lot, comme les contrôles Retail historiques ; leur allocation exacte reste bloquante.
- QA comportementale sur quantités 20+20, lot retenu, date civile et quarantaine. Exécution requise sur SHA final. FEFO ne change pas les couches de coût moyen pondéré par article/dépôt/devise.

## Réaffectation historique — service et approbation (en validation)
- Demande persistée, migration additive sans backfill, validation commune par un autre collaborateur, revue versionnée, transaction Serializable à révision du solde/fiche avec contrôle des opérations ouvertes et séparation des registres sectoriels.
- Mouvements compensés `LOT_RECLASSIFICATION_OUT/IN` à quantité exacte, même article/dépôt/emplacement, journal immuable, aucune modification de couches de coût ou d’écriture; valorisation interdite pour ces mouvements. Le suivi des lots s’active séparément après traitement de tous les soldes.
- Interface de soumission depuis les contrôles par article, sélection des soldes, calcul indicatif du restant, validation indépendante, lien vers Validations et revue affichant tous les lots. QA des règles 100 = 30+70, doublons, données et séparation des acteurs; recette PostgreSQL/UI complète à exécuter. Pas d’exécution sur données clientes.

## Restant (bloquant)
Certification de la réaffectation historique sur PostgreSQL + navigateur et valeur inchangée; certification achats et valorisation, réservations/livraisons multi-lots; moteur FEFO commun et POS; pertes, rappels et comptabilité; Design 2.0 et tests multisectoriels. Voir issue #1212. Ne pas merger avant clôture de tous les points.

## Recette propriétaire (NON EXÉCUTÉE)
1. Article stockable suivi, sans solde dans un dépôt autorisé : présent; service, article inactif ou non suivi : absent.
2. Recherche SKU au-delà de 50 articles, filtre de la liste des règles indépendant; dépôt non autorisé et autre tenant refusés.
3. Article à solde sans lot : activation refusée sans mutation. Lot sans date : activation péremption refusée. Concurrence : 409.
4. Lot enregistré : quantité inchangée; entrée approuvée uniquement.
5. Restant : répartition 100 en 30+70, valeur inchangée; réception/livraison multi-lots et FEFO, ventes/retours, réservations, pertes, comptabilité, Pharmacy/Health/Manufacturing, mobile 320px FR/EN.

Quality, Migration, Delivery, QA ciblées et globales, Playwright et E2E propriétaire sur SHA final requis. Aucun résultat déclaré à ce stade.
