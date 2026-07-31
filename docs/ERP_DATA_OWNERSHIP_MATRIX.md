# Matrice de propriété des données ERP

## Règle

La source de vérité indiquée ci-dessous est la seule source éditable pour les nouvelles écritures de l’itération 2. Les projections, historiques et objets legacy ne doivent pas devenir des sources concurrentes.

| Donnée | Source de vérité | Projection ou profil | Règle |
|---|---|---|---|
| Identité d’un tiers | `EnterpriseBusinessParty` | rôles, contacts, adresses | aucune fusion automatique par simple ressemblance de nom |
| Rôle client/prospect/partenaire | `EnterpriseBusinessPartyRole` | CRM | rôles structurés et tenant-aware |
| Profil fournisseur | `EnterpriseSupplier` | tiers commun lié | le fournisseur existant reste utilisable |
| Produit ou service | `EnterpriseCatalogItem` | extension sectorielle future | pas de dépendance obligatoire de Pharmacy/Health en itération 2 |
| Catégorie catalogue | `EnterpriseCatalogCategory` | aucune | code unique par organisation |
| Unité de mesure | `EnterpriseUnitOfMeasure` | aucune | unité enregistrée et contrôlée |
| Site | `EnterpriseSite` | aucune | référence physique commune |
| Entrepôt | `EnterpriseWarehouse` | emplacements | appartient à un site |
| Emplacement | `EnterpriseStorageLocation` | aucune | appartient à un entrepôt |
| Lead | `EnterpriseLead` | opportunité après conversion | conversion idempotente |
| Opportunité | `EnterpriseOpportunity` | rapports pipeline | valeur commerciale indicative |
| Devis | `EnterpriseQuote` + lignes | commande après conversion | totaux recalculés côté serveur |
| Contrat commercial | `EnterpriseContract` | documents et validations | version/approbation contrôlées |
| Commande client | `EnterpriseSalesOrder` + lignes | livraisons | ne constitue pas une facture |
| Livraison/prestation | `EnterpriseFulfillment` + lignes | progression commande | quantité cumulée bornée |
| Besoin d’achat | `EnterpriseRequest` | approbation | `requestType=PURCHASE_REQUEST` |
| Acquisition | `EnterprisePurchase` | budget/expense existants | objet achat canonique existant |
| Réception | `EnterprisePurchaseReceipt` | mouvement de stock éventuel | ne constitue pas une facture fournisseur |
| Journal de stock | `EnterpriseStockMovement` | balance | immuable après création |
| Quantité disponible | `EnterpriseInventoryBalance` | recalcul depuis mouvements | projection transactionnelle, jamais modifiée librement |
| Lot générique | `EnterpriseStockLot` | mouvements | pas de règle Pharmacy réglementaire générique |
| Inventaire physique | `EnterpriseInventoryCount` + lignes | mouvements de correction approuvés | écart audité |
| Transfert | `EnterpriseStockTransfer` + lignes | deux mouvements équilibrés | transaction logique unique |
| Employé client | `EnterpriseEmployee` | membre utilisateur facultatif | distinct de `HrcfoEmployee` |
| Contrat de travail | `EnterpriseEmploymentContract` | historique | une modification active crée une nouvelle version |
| Horaire attendu | `EnterpriseWorkSchedule` | aucune | distinct de présence et temps déclaré |
| Présence observée | `EnterpriseAttendance` | aucune | distincte du temps facturable |
| Congé/absence | `EnterpriseLeaveRequest` | approbation | aucune auto-approbation par défaut |
| Temps déclaré | `EnterpriseTimesheet` + lignes | temps approuvé | durée recalculée serveur |
| Période de paie | `EnterprisePayrollPeriod` | runs | ne prouve aucun paiement |
| Paie opérationnelle | `EnterprisePayrollRun` + items | payslip | état final opérationnel `APPROVED_AWAITING_PAYMENT` |
| Projet | `EnterpriseProject` | rapports portefeuille | progression calculée |
| Jalon | `EnterpriseProjectMilestone` | tâches/livrables | validation éventuelle |
| Livrable | `EnterpriseProjectDeliverable` | document privé | cycle de soumission/acceptation |
| Risque/incident projet | `EnterpriseProjectRisk` / `EnterpriseProjectIssue` | tâches | suivi opérationnel |
| Actif | `EnterpriseAsset` | affectations/maintenance | valeur indicative, sans amortissement |
| Affectation d’actif | `EnterpriseAssetAssignment` | événements | retour et état historisés |
| Maintenance | `EnterpriseAssetMaintenance` | tâches/demandes/achats | cycle contrôlé |
| Incident actif | `EnterpriseAssetIncident` | maintenance | historique opérationnel |
| Document | `EnterpriseDocument` | versions et accès | stockage privé, aucun fichier public permanent |
| Tâche | `EnterpriseTask` | aucune | système transversal unique |
| Validation | `EnterpriseApproval` | aucune | système transversal unique |
| Réunion | `EnterpriseMeeting` | décisions et tâches | système transversal unique |
| Commentaire métier | `EnterpriseOperationalComment` | aucune | pagination et visibilité contrôlées |
| Timeline | `EnterpriseOperationalEvent` | aucune | append-only |
| Workflow | `EnterpriseWorkflowDefinition` | versions/runs | adapters statiques et allow-listés |
| Rapport opérationnel | `EnterpriseReport` | snapshot immuable | données bornées et non comptables |
| Paiement comptable | différé à l’itération 3 | aucun | ne pas simuler avec un statut opérationnel |
| Facture client/fournisseur comptable | différée à l’itération 3 | aucun | commande et réception restent distinctes |
| Grand livre et états financiers | différés à l’itération 3 | aucun | aucune anticipation |

## Données sectorielles existantes

`PharmacyProduct`, `PharmacySale`, `PharmacyInvoice`, `PharmacyPayment`, `HealthBillingServiceCatalog`, `HealthMedicalInvoice` et `HealthMedicalInvoicePayment` restent leurs sources sectorielles actuelles jusqu’à l’itération 4. Ils ne reçoivent aucun dual-write permanent vers les nouveaux objets communs.

## Backfills

Les backfills de fournisseurs vers les tiers communs sont explicites, idempotents, exécutés hors migration structurelle et journalisent toute ambiguïté. Aucun client, produit, employé, projet, entrepôt, devise ou rapprochement fournisseur n’est inventé.
