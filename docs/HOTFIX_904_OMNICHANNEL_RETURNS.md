# Hotfix #904 — Retours omnicanaux après livraison

Issue : [#904](https://github.com/Bandsman942/dtsc-platform/issues/904), incrément des parents P0 #886 / #785.

## Périmètre

- `EnterpriseSalesOrder` et ses lignes restent l'autorité de commande ; `EnterpriseRetailOrderOrchestration` reste l'autorité du canal et du dépôt de préparation.
- `EnterpriseRetailOmnichannelReturn` est **uniquement** la demande opérationnelle de retour. Elle ne tient aucun solde comptable ni financier parallèle. Nouvelle migration additive et clés tenant-aware.
- La migration matérialise également les deux uniques composites « organisation + ID » déjà déclarés dans Prisma sur les commandes et lignes de vente mais absents des migrations CRM historiques : PostgreSQL peut alors appliquer les nouvelles clés étrangères tenant-scoped sur une base vierge.
- Le retour exige une commande réellement livrée, la preuve d'acceptation ou un document privé vérifié, **une facture client commune unique** de même tiers/devise/total et une allocation d'encaissement `CUSTOMER_PAYMENT` effectivement confirmée.
- Quantité demandée : contrôlée par ligne et par les demandes non rejetées, transaction `SERIALIZABLE` avec verrou de la commande. La dernière tranche prend le reliquat exact du prix TTC original, sans nouvelle remise ou recalcul de taxe.
- Séparation : créateur de la demande ≠ validateur. Le validateur possède les capacités Retail et Finance Payments/Receivables ; le règlement est réalisé par un troisième acteur habilité Finance.
- Le parcours Finance crée et soumet un `EnterprisePayment` de type `REFUND` et un `EnterpriseSalesCreditNote` par les services canoniques. **Il ne les approuve pas automatiquement** : la décision appartient au validateur affecté dans les modules Finance.
- Après approbation : allocations d'encaissement inversées, avoir comptabilisé, marqueur Finance inverse prêt, paiement de remboursement confirmé, disponibilité consommée. Seulement alors, un dernier bloc transactionnel remet au besoin les quantités en stock selon les coordonnées des mouvements de fulfillment originaux et, après **retour intégral de toutes les lignes**, annule la consommation du quota `AUTO_RETAIL_OMNICHANNEL`.
- **Comptabilité d'inventaire canonique** : pour les nouvelles livraisons omnicanales, la sortie physique `SALE_FULFILLMENT` et le posting `INVENTORY_ISSUE_VALUED` sont désormais dans **une seule transaction** (stock / coût des ventes). Pour le retour `RESTOCK`, chaque mouvement `RETURN_IN` est valorisé au coût unitaire de la sortie d'origine et posté via `EnterpriseInventoryAccountingEvent` et `RETAIL_POS_INVENTORY_RETURN`, dans la même transaction que la remise en stock. On réutilise la contrepassation de COGS canonique sans nouveau livre parallèle.
- Retours partiels : quota inchangé (`CONSUMED`). Retour totalement remboursé : quota libéré une fois, jamais sur demande/rejet/avoir non comptabilisé/remboursement non confirmé. Réessai du dernier bloc idempotent et sérialisé.
- Interface FR/EN : accès « Demander un retour » après livraison, quantités restantes, condition et disposition des articles, choix d'un validateur, liste des demandes, approbation, préparation et règlement selon l'acteur et les droits serveur.

## Limitations explicites et protection des données

- **Ne jamais générer de remboursement pour une commande non facturée/non encaissée.** Il faut terminer le parcours Finance original auparavant.
- Un remboursement choisi doit être couvert par **une seule source de paiement client confirmée**, dans la même devise et pour le même tiers. Les encaissements partagés entre plusieurs paiements ne sont pas assemblés silencieusement. Un traitement multi-source sera une évolution bornée après validation du parcours mono-source, si nécessaire.
- Les lignes livrées depuis plusieurs coordonnées d'inventaire ne peuvent pas être automatiquement remises en stock sans sélection d'emplacement traçable ; la demande `RESTOCK` est bloquée **avant** la préparation financière dans cette situation.
- Les anciennes livraisons sans écriture de valorisation d'inventaire `POSTED` sont **bloquées pour `RESTOCK` avant toute pièce Finance**. Elles requièrent un rapprochement comptable contrôlé (pas de valorisation rétroactive silencieuse). Une livraison neuve nécessite désormais une configuration de valorisation, les couches de coût et les comptes de journal disponibles ; l'absence d'un de ces prérequis bloque la livraison atomiquement.
- Le circuit opérationnel ne réécrit pas les pièces financières publiées, ne crée pas de ledger de caisse autonome et ne fusionne pas une commande `EnterpriseSalesOrder` en vente POS `EnterpriseRetailSale`.
- Le stock redevient disponible **à la finalisation**, après attestation explicite de réception physique, motif/constat d'inspection et horodatage de l'acteur en base. La disposition `SCRAP` / `NO_STOCK` ne remet jamais les articles en stock vendable.
- Un échec après confirmation d'un paiement peut laisser le retour `FINANCE_PENDING` : **ne pas relancer un second remboursement**. Relancer la finalisation idempotente, puis examiner les journaux Finance et les coordonnées de stock. Aucun quota n'est libéré tant que le retour opérationnel n'est pas entièrement finalisé.
- Aucun backfill des anciennes commandes n'est supposé : si leur lien facture/encaissement est ambigu, le retour est refusé jusqu'à régularisation traçable.

## Guide d'utilisation

1. Dans **Retail → Commandes, retraits & livraisons**, sélectionner **Demander un retour** pour une commande entièrement livrée.
2. Choisir les quantités restantes, l'état et le traitement de stock réel, saisir un motif et sélectionner un validateur indépendant. Si le système refuse la demande faute de facture ou d'encaissement, terminer la facturation/confirmation dans Finance.
3. Le validateur affecté approuve ou refuse la demande avec un motif. En cas de refus, les quantités redeviennent disponibles pour une nouvelle demande.
4. Un collaborateur habilité Finance prépare les pièces : le paiement et l'avoir sont envoyés dans le circuit de validation Finance existant.
5. Le validateur affecté approuve séparément **l'avoir** et **le remboursement** dans Finance. Le préparateur ne peut pas valider ses propres pièces.
6. Un troisième responsable Finance confirme le remboursement et la réception du stock via **Confirmer le remboursement et le stock**. Il vérifie l'état de la caisse, la période comptable et les justificatifs. Le statut final devient **Remboursé et traité**.

## Matrice OWNER_E2E requise

| Scénario | Attendu |
|---|---|
| Commande livrée sans facture, ou facture non encaissée | Refus métier clair, aucun retour ni effet financier |
| Même clé de demande, même corps puis corps différent | Même ID au replay, conflit si corps différent |
| Autre tenant, auto-validation, validateur désactivé ou privé de droits Finance | Refus 403/404, aucun changement |
| Retour partiel sur commande de deux unités | Montant exact arrondi au centime, stock correspondant, quota toujours consommé |
| Retour du solde ; règlement Finance confirmé | Deuxième mouvement inverse, quota annulé une fois, soldes Finance exacts |
| Rejouer décision/préparation/règlement et provoquer deux appels concurrents | Une seule paire de pièces Finance, aucun double remboursement ni mouvement de stock |
| Avoir ou paiement non approuvé, période fermée, session cash manquante | Refus et maintien du statut en attente, pas de stock ni quota prématuré |
| Article endommagé et option hors stock, source historique de plusieurs emplacements | Pas de remise en vente injustifiée ; coordonnées d'origine conservées |
| Livraison de stock valorisée / sortie historique non valorisée | Débit COGS + crédit stock lors de livraison ; contrepassation exacte lors du retour `RESTOCK` ; retour historique sans sortie valorisée refusé avant Finance |
| Mobile 320–414 px, tablette 768–1024 px, FR/EN, dark/light, clavier | Fenêtre utilisable sans scroll horizontal ; CTA clairs et non fictifs |
| Anciennes régressions POS #888, commandes #903, Gaming #884 | Aucune régression |

**Statut de preuve au début du développement** : `OWNER_E2E` = `NOT_EXECUTED`, migration base vierge = `NOT_EXECUTED`, CI = `NOT_EXECUTED`. Ne les changer qu'avec les résultats du SHA concerné.

## Opérations / rollback

- Migration additive déployée par `prisma migrate deploy` depuis `main`, avant exécution des nouvelles routes. Aucun script de backfill ni secret nouveau.
- Un revert applicatif peut désactiver les nouveaux parcours, **sans supprimer les retours ou pièces Finance déjà créés**. La migration ne doit pas être supprimée d'une base ayant déjà reçu des données ; prévoir un correctif de reprise contrôlé en cas d'incident.
- Signaux à surveiller : retours bloqués `FINANCE_PENDING`, conflits de source, insuffisance d'allocations confirmées, échec de posting, impossibilité de remise en stock, écart entre paiements remboursés et demandes `COMPLETED`.
- QA dédiée : `node scripts/qa-hotfix-904-omnichannel-returns.mjs`. CI Shop 2 : migration base vierge, build, scénarios historiques. E2E propriétaire indépendant requis avant merge.
