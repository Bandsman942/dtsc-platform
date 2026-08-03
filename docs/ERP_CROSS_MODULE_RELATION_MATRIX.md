# Matrice des relations inter-modules ERP

Le registre canonique fournit routes, icônes, libellés, plans et dépendances. Cette matrice décrit les relations métier qui complètent ce registre canonique.

| Source | Cible | Relation persistante | Contrôle d’unicité | Deep link |
|---|---|---|---|---|
| Tiers | devis, contrat, commande, facture, projet | FK `businessPartyId` + `EnterpriseEntityLink` | tenant + identifiant | objet précis |
| Devis | commande | `quoteId` | conversion idempotente | commande avec `recordId` |
| Commande | livraison | `salesOrderId` | source + révision | livraison précise |
| Livraison | facture | `fulfillmentId` | une projection autorisée | facture précise |
| Facture client | créance | `salesInvoiceId` | unique par organisation | créance précise |
| Achat | réception | `purchaseId` | quantités contrôlées | réception précise |
| Réception | mouvement | `sourceEntityType/sourceEntityId` | clé d’idempotence | mouvement précis |
| Facture fournisseur | dette | `supplierInvoiceId` | unique | dette précise |
| Paiement | créance/dette | `EnterprisePaymentAllocation` | clé composite | allocation et cible |
| Temps approuvé | paie | période, employé, run | période + employé | run de paie |
| Livrable accepté | projet/contrat/client | FK + liens structurels | lien composite | livrable précis |
| Actif | profil comptable | `assetId` unique | unique organisation/actif | immobilisation précise |
| Health invoice | facture commune | `HealthBillingExtension` | uniques source/cible | facture commune |
| Pharmacy sale | facture commune | `PharmacySalesExtension` | uniques source/cible | facture commune |
| Mouvement | valorisation/écriture | source movement + event | unicités comptables | mouvement/écriture |

Les modules activés doivent rester compatibles avec le plan, le secteur et leurs dépendances. Un alias ou module fantôme est désactivé par la réconciliation canonique, jamais affiché comme fonctionnalité professionnelle.
