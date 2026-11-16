# DTSC Platform — ERP sept modules Design 2.0 · Issue #1200

**Date :** 16 novembre 2026 · **Version candidate :** `v1.22.0` · **État :** branche de travail, pas de merge ni Production avant E2E propriétaire.

## Architecture et périmètre
Une refonte d'interface, filtres de liste et exports des modules communs déjà existants. Aucun deuxième référentiel et aucune migration Prisma. La source de vérité reste dans les domaines d'origine ; cette livraison ne matérialise pas de flux financier/stock automatique nouveau.

| Module | Registre source | Communication ERP existante |
|---|---|---|
| Fournisseurs et achats `SUPPLIERS_PURCHASES` | `EnterpriseSupplier` + `EnterprisePurchase` | Tiers canoniques, demandes/approbations, commande, réception, rattachements aux budgets/dettes fournisseurs, stock |
| Sites et entrepôts `SITES_WAREHOUSES` | `EnterpriseSite`/`EnterpriseWarehouse`/`EnterpriseStorageLocation` | Entrepôts des achats, stocks/transferts et actifs |
| Documents `DOCUMENTS` | `EnterpriseDocument` + versions, droits d'accès et relations | Documents liés aux achats, projets, contrats, actifs, demandes |
| Stocks et logistique `INVENTORY_LOGISTICS` | `EnterpriseInventoryItem`, `StockTransfer`, `InventoryCount`, `StockAdjustment` | Catalogue, réceptions fournisseurs, boutiques/entrepôts, lots, mouvements, valorisation comptable séparée |
| Projets et services `PROJECTS_SERVICES` | `EnterpriseProject`, membres/jalons/risques/incidents | Clients/contrats, budgets, sites, documents, livrables |
| Temps et livrables `TIME_DELIVERABLES` | `EnterpriseProjectDeliverable` + `EnterpriseTimesheetEntry` **approuvées** | Projet canonique, jalons, documents et temps ; pas de paie/facture automatique |
| Actifs et maintenance `ASSETS_MAINTENANCE` | `EnterpriseAsset` + affectations, maintenances et incidents | Collaborateurs, sites, fournisseurs/achats, immobilisations Finance distinctes |

### Primitives UI
- `ErpDesign2Metric` : indicateurs métiers avec accents de couleurs sémantiques et icônes explicites ; ne pas assimiler « rouge » à un échec technique.
- `ErpDesign2RegisterSection` : registre toujours visible, compact, sans plein écran modal involontaire. Les dialogues d'édition, de décisions et de détails restent séparés.
- `ErpDesign2RegisterTools` : rails de statut accessibles, calendrier de dates civiles et export professionnel réutilisant le moteur unique `FinanceExportControls` ; responsive mobile, FR/EN, clair/sombre.
- `FinanceExportControls` charge **toutes les pages** de l'API authentifiée, jusqu'à 1000 lignes, et prépare CSV/XLSX/PDF avec nom d'entreprise, filtres et colonnes métier. Aucun export de données non autorisées ni reproduction silencieuse de la page seule.

### Documents professionnels
- **Commande fournisseur** : `GET /api/enterprise/:organizationId/purchases/:id/print?lang=fr|en`. Session, organisation active, permission module `read`, `enterprisePurchaseVisibilityWhere`; HTML entièrement échappé, CSP à nonce, `Cache-Control: private, no-store`, impression A4. Montants, taxes, lignes, fournisseurs, quantités déjà reçues, référence et révision proviennent de l'achat enregistré. Brouillon/en attente => avertissement **non validé**, refusé/annulé => avertissement **non exécutable**. Copie commerciale uniquement, jamais facture/justificatif.
- **Documents** : dépôt et versions restent récupérés via routes d'accès et URL de téléchargement signée ; exports limités aux métadonnées autorisées (titre, type, visibilité, statut, version, échéance).
- La « copie imprimable » n'est ni un nouveau workflow d'approbation ni un déclencheur de livraison, mouvement de stock, écriture comptable ou paiement.

### Règles de filtrage et sécurité
- Les endpoints existants réappliquent authentification, organisation, RBAC, entitlement et, lorsque pertinent, restrictions par site/boutique **avant** pagination, métriques et export.
- Paramètres `dateFrom/dateTo` : validation commune `financeBusinessDateRange` (dates civiles, inclusivité du dernier jour). Documents conservent `from/to` avec validation stricte et fin exclusive.
- Le périmètre stock et entrepôt dépend des mêmes résolveurs `retailInventoryVisibleSites` et `retailStockTransferVisibleSites` ; une personne n'acquiert aucun nouveau droit grâce à un filtre client.
- Restreindre les droits d'impression aux achats visibles, sans pouvoir requérir une autre organisation par modification de l'URL.
- Les taux de change, dépenses, TVA comptabilisée, paiements et amortissements ne sont pas modifiés par ce PR.
- **Limite préexistante signalée** : le compteur de stock faible de `inventory/route.ts` est calculé sur les éléments de la page courante (et non un agrégat global), même lorsque le filtre `lowStock` est utilisé ; sa lecture doit rester locale tant que l'agrégat global sûr et performant n'est pas implémenté.

## Impact opérationnel
- Schéma / migrations : **aucun**.
- Variables d'environnement / secrets : **aucun**.
- CI : script `pnpm qa:erp-seven-design2-1200` ajouté à Quality Gates ; TypeScript, lint, build, migrations et tests RETAIL/Finance habituels toujours requis.
- Déploiement : **production uniquement depuis `main` après OWNER E2E BON**, pas de Preview, pas de `vercel --prod`.
- Retour arrière : revert de la PR fusionnée après analyse des schémas et dépendances ; aucune rétro-migration.
- Documentation d'acceptation : `docs/OWNER_E2E_1200_SEVEN_ERP_DESIGN2.md`.

## Hors scope documenté
- Pas de deuxième moteur comptable ou moteur de stocks, pas d'automatisation achat→paiement.
- L'incident de stock non Retail `#1196` reste distinct.
- Pas de certification fiscale des copies ou signature électronique à prétendre valide sans signature/autorité.
- Pas d'export du contenu brut d'un document confidentiel ni des liens signés.
