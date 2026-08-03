# Mapping financier transverse

| Fait métier | Objet financier unique | Comptabilisation |
|---|---|---|
| Livraison/prestation facturée | `EnterpriseSalesInvoice` + `EnterpriseReceivable` | règle de vente unique |
| Réception/facture fournisseur | `EnterpriseSupplierInvoice` + `EnterprisePayable` | règle d’achat unique |
| Encaissement/décaissement | `EnterprisePayment` | transaction de trésorerie unique |
| Affectation | `EnterprisePaymentAllocation` | réduit une cible précise |
| Paie approuvée | run/bulletins + dette/paiement commun | règle paie |
| Stock valorisé | accounting event + cost layer | écriture stock/COGS unique |
| Capitalisation | profil comptable d’actif | écriture d’acquisition unique |
| Amortissement | échéance avec clé d’idempotence | écriture unique par période |
| Health | facture commune + extension confidentielle | aucune donnée clinique inutile |
| Pharmacy | facture/paiement/caisse communs + extension | aucun total parallèle |

Une annulation publiée utilise avoir, remboursement, contrepassation ou écriture corrective. Elle ne supprime jamais silencieusement facture, paiement, mouvement ou journal. Les périodes fermées bloquent les nouvelles écritures. Les devises de transaction, fonctionnelle et de présentation restent distinctes.
