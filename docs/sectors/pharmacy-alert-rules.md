# Règles d'alertes PHARMACY

Toutes les règles sont exécutées côté serveur, filtrées par `organizationId`, persistées et dédupliquées.

| Code règle | Catégorie | Condition réelle | Criticité | Action recommandée | Responsable recommandé | Module source |
| --- | --- | --- | --- | --- | --- | --- |
| `PRODUCT_OUT_OF_STOCK` | Stock | Produit actif suivi, quantité totale nulle | Critique | Créer un réapprovisionnement | Stock / achats | Produits |
| `PRODUCT_LOW_STOCK` | Stock | Quantité inférieure ou égale au seuil minimal | Élevée | Réapprovisionner | Stock / achats | Produits |
| `PRODUCT_OVERSTOCK` | Stock | Quantité supérieure ou égale au seuil maximal | Moyenne | Contrôler seuil et achats | Stock | Produits |
| `PRODUCT_WITHOUT_PRICE` | Stock | Prix de vente absent ou nul | Élevée | Définir le prix | Gérant | Produits |
| `PRODUCT_WITHOUT_BATCH` | Stock | Produit suivi sans lot disponible | Élevée | Réceptionner un lot | Stock | Produits / lots |
| `BATCH_NEAR_EXPIRY` | Péremption | Lot avec stock dans le seuil de péremption | Élevée | Prioriser FEFO | Pharmacien / stock | Lots |
| `BATCH_EXPIRED` | Péremption | Lot expiré avec stock disponible | Critique | Bloquer, retirer, détruire | Pharmacien / qualité | Lots |
| `BATCH_RECALLED` | Rappel | Lot rappelé | Critique | Bloquer et retirer | Pharmacien / qualité | Lots |
| `BATCH_QUARANTINED` | Rappel | Lot en quarantaine | Élevée | Documenter la décision | Qualité | Lots |
| `BATCH_BLOCKED` | Rappel | Lot bloqué | Élevée | Contrôler le motif | Pharmacien | Lots |
| `PURCHASE_ORDER_OVERDUE` | Achat | Livraison attendue dépassée, commande ouverte | Élevée | Contacter fournisseur | Achats | Fournisseurs & commandes |
| `REPLENISHMENT_REQUEST_PENDING` | Achat | Demande non clôturée | Moyenne | Traiter la demande | Achats | Fournisseurs & commandes |
| `RECEIPT_DISCREPANCY_OPEN` | Réception | Écart de réception non résolu | Selon écart | Traiter l'écart | Stock / achats | Réceptions |
| `PHARMACIST_VALIDATION_PENDING` | Vente | Validation pharmacien en attente au-delà du délai | Élevée | Faire contrôler la vente | Pharmacien | Ventes |
| `SALE_ANOMALY_OPEN` | Vente | Anomalie vente ouverte | Selon anomalie | Contrôler la vente | Pharmacien / gérant | Ventes |
| `INVENTORY_VARIANCE_CRITICAL` | Inventaire | Variance absolue importante | Critique | Recompter et ajuster | Stock | Inventaire |
| `STOCK_ADJUSTMENT_PENDING` | Ajustement | Ajustement soumis ou en revue | Moyenne | Valider ou rejeter | Gérant / stock | Inventaire |
| `LOSS_CRITICAL` | Retour / perte | Perte critique ou valeur au-dessus du seuil | Critique | Contrôler et justifier | Gérant / qualité | Retours & pertes |
| `DESTRUCTION_PENDING` | Retour / perte | Destruction soumise en attente | Élevée | Valider et documenter | Qualité | Retours & pertes |
| `CASH_SESSION_OPEN_TOO_LONG` | Caisse | Session ouverte au-delà du délai | Élevée | Clôturer ou justifier | Gérant / caisse | Caisse |
| `CASH_DISCREPANCY_CRITICAL` | Caisse | Écart au-dessus du seuil critique | Critique | Contrôler la clôture | Gérant / finance | Caisse |

Limites actuelles: la création directe d'une tâche, demande interne ou réapprovisionnement depuis une alerte sera activée quand les contrats multi-tenant de ces objets communs seront exposés aux entreprises clientes. Aucune action factice n'est affichée en attendant.
