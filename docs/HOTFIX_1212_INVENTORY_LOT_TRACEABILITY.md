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

## Réservations ventilées et consommation par lot (en validation)
- Migration additive nullable `lotAllocations` sur la réservation canonique : aucun backfill de promesses historiques non identifiées. Les coordonnées de solde, lot et emplacement ainsi que les quantités initiales et livrées sont contrôlées dans une transaction Serializable ; pas de deuxième registre.
- Allocation des stocks suivis en FEFO strict : pas de lot expiré, bloqué ou archivé ; quantité de la commande encore disponible ; réservations explicites et retenues de facture déduites. Les réservations historiques restent protégées conservativement jusqu’à leur libération et nouvelle affectation.
- Livraisons omnicanal : plusieurs mouvements physiques par réservation, consommation partielle, identifiant stable par solde, coût des ventes calculé par le moteur Finance existant sur chaque mouvement. La libération de la promesse consommée et l’émission du mouvement sont atomiques.
- Disponibilité commune : stock physique conservé dans le total, stock vendable calculé par dépôt en excluant les lots expirés, bloqués, archivés et emplacements indisponibles. Les retenues historiques sans lot sont déduites conservativement; pas de backfill inventé. Le préfiltre agrégé des quantités ne bloque plus à tort une demande localisée sur un lot libre.
- La sortie générique protège les lots promis, y compris lors d’un transfert, d’un ajustement ou d’une vente POS. Le contrôle Retail et le sélecteur de lots intègrent les allocations exactes. Tests comportementaux ajoutés (30+20, livraison 30+10, reliquat 10, deux emplacements et une seule retenue).
- ERP commun : même API canonique de réservation et libération, via le registre des commandes et la route existante de livraison. Liste paginée par commande et dépôt autorisé, numéros réels et dates/motifs, droit Ventes et Stock, choix FEFO strict. Les commandes Retail orchestrées restent en lecture seule dans ce formulaire et les articles projetés depuis Pharmacy/Health ou un autre registre sectoriel sont exclus de la mutation commune.
- Les livraisons ERP communes des articles suivis exigent une réservation dans le dépôt, et consomment les mêmes mouvements. Si la comptabilisation automatique est activée, valorisation transactionnelle par le moteur Finance existant ; sinon journal physique sans prétendre qu'il est automatiquement comptabilisé. Le flux historique des articles non suivis est inchangé.
- Reste bloquant : allocation multi-lots automatique sur une seule ligne de facture POS, retour et pertes/qualité, certification de bout en bout incluant la préparation physique et la valorisation commune.

- Recette API/DB ajoutée à la suite Playwright Shop 2 globale : commande ERP commune, réservation 30+20, livraison partielle 30+10, 2 écritures de coût, replay sans double mouvement, blocage/rollback si lot mis en quarantaine, reprise et libération du reliquat. Aucune exécution réussie encore déclarée sur ce commit.

## Facture POS à ventilation multi-lots (en validation)
- Une ligne Finance et un checkout par article; ajout nullable `lotAllocations` au lien de checkout. Quand aucun lot explicite n’est sélectionné, le serveur répartit les lots disponibles FEFO strict, après déduction des retenues et réservations. Aucune duplication de prix, TVA, créance ou facture. Le choix explicite d’un lot reste compatible.
- Les retenues et la sortie physique à paiement intégral relisent le même instantané. Un crédit avant livraison libère la fin de la ventilation FEFO; contrôle des sommes et refus sur lot devenu indisponible. Chaque sortie garde le même invoiceItemId et sa propre clé par solde.
- Retour physique multi-lots : preuve structurée par lot sur la ligne unique d’avoir, somme exacte, contrôle du débit source et des retours déjà engagés. Inspection indépendante avec confirmation explicite ; préflight Finance répète les vérifications, y compris crédit antérieur à livraison et rapprochement des mouvements originaux. La réintégration utilise le coût d’origine. Le formulaire affiche les numéros de lots réellement sortis, leurs soldes retournables et la ventilation par lot. L’inspecteur doit confirmer ces quantités. La réintégration d’un lot expiré, bloqué ou archivé est refusée; la recette complète reste à certifier.
- La QA vérifie le total exact et le crédit non livré. Le scénario matériel complet et les retours doivent encore être exécutés.
- Correction du gate strict-positive (nouvelle garde distincte pour les réservations de commande, retenue facture positive uniquement) et réutilisation des cookies d’une authentification réussie dans le scénario E2E global; aucune modification du rate limit de production ni suppression de scénario.

- Correction fixture E2E : le parent fournit organizationId à la relation composite lors de la création imbriquée. Les 16 workflows réussis du SHA d4bb49c n’incluent pas la recette globale qui a échoué sur ce champ.
- La liquidation de facture respecte les lots déjà promis, sans imposer une nouvelle allocation FEFO après une réception ultérieure; les contrôles de sécurité et disponibilité demeurent actifs.

- Contrôle de sécurité commun : un article géré avec date de péremption ne peut pas être vendu, réintégré en stock vendable ou consommé en production après sa date limite. Le choix manuel du lot ne contourne pas ce contrôle. La politique Retail historique ALLOW reste applicable aux articles sans suivi obligatoire de péremption.
- QA préflight étendue : retour volontaire du deuxième lot après crédit avant livraison, contrôle du solde après retour précédent, refus lot étranger, rejet de la réintégration d’un lot indisponible, traçabilité des dispositions non revendables. Aucun test supprimé.

- Recette POS PostgreSQL/HTTP ajoutée au parcours Finance cinq acteurs : 2+3 unités stockées, facture unique de 4 unités (2+2), promesses empêchant la survente, paiement et deux mouvements/coûts, retour du lot tardif seul, confirmation physique indépendante et restitution au coût de 7, rejeu sans mouvement en double. Résultat à vérifier en CI.

## Pertes et destruction contrôlées (en validation)
- `lossReason` optionnel sur l'ajustement canonique (migration additive), motifs EXPIRY/DAMAGE/RECALL/DESTRUCTION; quantité positive exacte, lot identifié, demande et validateur distincts, contrôle du solde, révision et idempotence.
- Sortie interne uniquement `LOT_WRITE_OFF`, sur demande approuvée; jamais exposée au schéma public de mouvement. Les retenues et réservations restent opposables, donc libérer/régulariser les promesses avant destruction. Les secteurs à registre spécialisé sont exclus.
- Valorisation automatique si activée, par moteur existant et devise unique des couches ouvertes. En cas de configuration insuffisante, rollback de la sortie et de l'approbation. Événement distinct `INVENTORY_LOSS_VALUED` (LOSS), débit charge d'exploitation configurée et crédit Stock, sans COGS ni mouvement de trésorerie. En mode manuel, la valorisation par la route Finance existante reconnaît le même mouvement et le même événement.
- Sur c7c4e8a, les deux recettes PostgreSQL/HTTP sont CI_PROVEN (Shop 2 behavioral 44249517190, étapes des commandes globales et Finance cinq acteurs). 16 workflows verts; Quality 134616677661 a échoué sur le code d'erreur de lot non revendable (exception masquée). Correction préflight avec code autorisé et conservation de l'erreur métier.

## Restant (bloquant)
Certification de la réaffectation historique sur PostgreSQL + navigateur et valeur inchangée; certification achats et valorisation, réservations/livraisons multi-lots; moteur FEFO commun et POS; pertes, rappels et comptabilité; Design 2.0 et tests multisectoriels. Voir issue #1212. Ne pas merger avant clôture de tous les points.

## Recette propriétaire (NON EXÉCUTÉE)
1. Article stockable suivi, sans solde dans un dépôt autorisé : présent; service, article inactif ou non suivi : absent.
2. Recherche SKU au-delà de 50 articles, filtre de la liste des règles indépendant; dépôt non autorisé et autre tenant refusés.
3. Article à solde sans lot : activation refusée sans mutation. Lot sans date : activation péremption refusée. Concurrence : 409.
4. Lot enregistré : quantité inchangée; entrée approuvée uniquement.
5. Restant : répartition 100 en 30+70, valeur inchangée; réception/livraison multi-lots et FEFO, ventes/retours, réservations, pertes, comptabilité, Pharmacy/Health/Manufacturing, mobile 320px FR/EN.

Quality, Migration, Delivery, QA ciblées et globales, Playwright et E2E propriétaire sur SHA final requis. Aucun résultat déclaré à ce stade.
