# ERP — Propriété finale des données

## Principe

DTSC Platform autorise **une seule source de vérité par domaine**. Les objets historiques conservés ne sont ni des sources d’écriture ni des agrégats financiers parallèles.

| Domaine | Source de vérité finale | Source historique | État final |
|---|---|---|---|
| Modules | Registre canonique `module-registry.ts` | catalogues locaux et aliases | aliases limités, catalogues concurrents interdits |
| Tiers | `EnterpriseBusinessParty` et rôles | fournisseurs/patients financiers isolés | extensions ou mappings sectoriels |
| Catalogue | `EnterpriseCatalogItem` | catalogues sectoriels financiers | extension métier spécialisée |
| CRM et ventes | modèles CRM, commandes et contrats dédiés | `EnterpriseCoreRecord` | historique `LEGACY_READ_ONLY` |
| Achats | `EnterprisePurchase` et réceptions | achats génériques/sectoriels parallèles | mapping ou extension |
| Facture client | `EnterpriseSalesInvoice` | facture sectorielle financière | une facture commune unique |
| Créance | `EnterpriseReceivable` | solde local sectoriel | projection interdite comme autorité |
| Paiement | `EnterprisePayment` et allocations | paiement sectoriel isolé | extension vers paiement commun |
| Caisse | `EnterpriseCashSession` | caisse sectorielle isolée | extension vers caisse commune |
| Comptabilité | `EnterpriseJournalEntry` / `EnterpriseJournalLine` | statuts de synchronisation | journal commun immuable |
| Workflow | Workflow Engine v2 | `EnterpriseWorkflow` | archive en lecture seule |
| Documents généraux | `EnterpriseDocument` | enregistrements génériques | archive si mapping non déterministe |
| Stock Pharmacy | modèles Pharmacy dédiés | projection ERP | Pharmacy reste autoritaire pour lots, FEFO, péremption, rappels et quantités réglementées |
| Patient clinique | `HealthPatient` et modèles Health | aucune copie Core | Health reste autoritaire |
| Facturation Health | facture, créance, paiement et allocations communs | facture médicale financière isolée | extension Health sans donnée clinique dans Finance |

## Règles durables

- Aucune opération ne doit écrire simultanément dans deux modèles métier concurrents.
- Toute projection est reconstruisible et ne devient jamais une seconde autorité.
- Toute écriture comptable possède une clé d’idempotence et respecte la partie double.
- Une écriture `POSTED` est immuable ; une correction utilise une contrepassation.
- Les données cliniques restent sous contrôle Health ; Finance ne reçoit que les informations strictement nécessaires à la facturation.
- Les données réglementaires Pharmacy restent dans Pharmacy.
