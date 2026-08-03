# Propriété canonique des entités ERP

## Décision d’architecture

Une donnée commune ne possède qu’une autorité. Les extensions sectorielles ajoutent du contexte sans recréer l’objet financier, logistique ou comptable.

| Concept | Autorité canonique | Extensions admises | Interdiction |
|---|---|---|---|
| Identité globale | `User` | profils et préférences | remplacer une fiche métier par un compte |
| Tiers | `EnterpriseBusinessParty` | patient, assureur, fournisseur, client sectoriel | tiers financier parallèle |
| Catalogue | `EnterpriseCatalogItem` | `PharmacyProductExtension`, services Health | quantité ou prix commun dupliqué |
| Sites et stockage | `EnterpriseSite`, `EnterpriseWarehouse`, `EnterpriseStorageLocation` | service clinique, lot Pharmacy | emplacement concurrent |
| Vente | `EnterpriseQuote`, `EnterpriseSalesOrder`, `EnterpriseFulfillment` | contexte sectoriel | commande sectorielle financière concurrente |
| Achat | `EnterprisePurchase`, `EnterprisePurchaseReceipt` | lot et contrôle réglementaire | fournisseur ou réception parallèle |
| Facture client | `EnterpriseSalesInvoice` | `HealthBillingExtension`, `PharmacySalesExtension` | seconde facture Finance |
| Facture fournisseur | `EnterpriseSupplierInvoice` | contexte d’achat sectoriel | seconde dette |
| Paiement | `EnterprisePayment` | preuve sectorielle | caisse ou paiement financier parallèle |
| Stock physique | `EnterpriseStockMovement` | lot, FEFO, dispensation | seconde quantité indépendante |
| Employé | `EnterpriseEmployee` | liaison `User` consentie | auto-liaison par e-mail |
| Paie | `EnterprisePayrollRun` et éléments | dette/paiement commun | auto-approbation |
| Projet | `EnterpriseProject`, `EnterpriseProjectDeliverable` | partage client autorisé | facturation sans source |
| Actif opérationnel | `EnterpriseAsset` | maintenance et affectations | confusion avec immobilisation |
| Immobilisation | `EnterpriseAssetAccountingProfile` | échéanciers et cessions | suppression d’une écriture publiée |
| Comptabilité | `EnterpriseJournalEntry` | dimensions analytiques | écriture sectorielle parallèle |

Toute relation transverse persistante utilise une clé structurelle ou `EnterpriseEntityLink`. Aucun backfill automatique par nom, courriel ou texte libre n’est autorisé.
