# Retail final stabilization & acceptance — Issue #145

## Baseline

Cette tranche part de la Production validée après la clôture quotidienne :

- SHA : `bd948059eb2c2d2053f7f4359c61aa647bcdb13d` ;
- Release : `prod-20260809-0759-bd94805` ;
- Vercel Production : `READY` ;
- Shop 2.0 programme technique : `COMPLETE` ;
- statut commercial : `COMMERCIAL_READY`.

## Objectif

Clôturer la consolidation produit #135 par une stabilisation des surfaces opérationnelles Shop sans ajouter de nouveau moteur métier ni modifier la comptabilité.

La tranche couvre :

- décomposition définitive du workspace Retail monolithique ;
- POS dédié ;
- Mobile Money / Télécom dédiés ;
- langage client FR/EN ;
- historique et rapports ;
- continuité Shop ↔ ERP ;
- QA durable ;
- acceptance production-like multi-écrans ;
- preuve finale Production après merge.

## Hors scope

- aucune migration Prisma ;
- aucun nouveau ledger ;
- aucun dual-write ;
- aucun provider fictif ;
- aucune certification réglementaire supplémentaire ;
- aucune promotion `COMMERCIAL_READY_GLOBAL` ;
- aucun SYSCOHADA ;
- aucun programme d’implantation de plans comptables.

## Architecture finale des surfaces Retail

| Module | Workspace client |
|---|---|
| `RETAIL_POS` | `RetailPosWorkspace` |
| `MOBILE_MONEY_AGENCY` | `RetailOperatorWorkspace` |
| `TELCO_TOPUPS` | `RetailOperatorWorkspace` |
| `RETAIL_DAILY_CLOSE` | `RetailDailyCloseWorkspace` |

Les primitives communes de chargement, mutations, caisse, métriques, rapports et navigation ERP sont regroupées dans `retail-workspace-shared.tsx`.

L’ancien `EnterpriseRetailShopWorkspace` est retiré du runtime et les QA historiques sont migrées vers cette architecture.

## Contrat de sécurité conservé

Aucun changement n’affaiblit les contrôles serveur existants :

`session → organisation active → membership → module/entitlement → permission → same-origin → Zod → rate limit → transaction → audit`.

Les mutations continuent d’utiliser les routes Retail existantes. Les clés d’idempotence restent stables pour les opérations qui en ont besoin. La séparation soumission/validation reste opposable pour la clôture et les retours.

## Sources de vérité ERP

La consolidation n’introduit aucune donnée maître Retail concurrente :

- CRM : clients ;
- Catalog : articles/prix de référence ;
- Inventory : stock et réservations ;
- Sales : commandes/fulfillment ;
- Purchase : approvisionnement ;
- Finance : paiements, caisse, trésorerie, fiscalité, comptabilité ;
- Reports : lecture consolidée.

## Acceptance automatisée obligatoire

Le même SHA de PR doit faire passer :

1. **Delivery Governance** ;
2. **migrations depuis zéro** ;
3. `prisma generate` ;
4. `pnpm type-check` ;
5. QA globale + QA Retail ;
6. `pnpm lint` ;
7. `pnpm build` ;
8. **Shop 2 commercial UI** ;
9. **Shop 2 global readiness** ;
10. **Shop 2 behavioral gates**.

Le workflow comportemental exécute notamment :

- POS / comptabilité / idempotence / concurrence ;
- pricing, promotions, retours, remboursements ;
- CRM client, fidélité, stored value et paiements ;
- clôture quotidienne ;
- offline, multi-store, omnicanal et fulfillment ;
- nouvelle acceptance de cohérence produit multi-écrans.

## Acceptance UI finale

`tests/e2e/shop2-final-coherence-ui.spec.mjs` vérifie :

### 390 px — français

- ouverture `RETAIL_POS` ;
- présence du parcours « Vente comptoir » ;
- continuité « Continuer dans l’ERP » ;
- absence des formulations techniques interdites ;
- aucun débordement horizontal structurel.

### 768 px — français

- ouverture `MOBILE_MONEY_AGENCY` ;
- parcours « Opération Mobile Money » ;
- liens Finance/Reports ;
- absence de libellés bruts `MOBILE_MONEY`, `DEPOSIT`, `WITHDRAWAL`, `CLEARING` ;
- aucun débordement horizontal structurel.

### 1440 px — anglais

- ouverture `TELCO_TOPUPS` ;
- parcours `Airtime / bundle` ;
- onglet Reports ;
- libellés métier des comptes ;
- absence de `CASH`, `MOBILE_MONEY`, `CLEARING`, `CARD_CLEARING` comme labels bruts ;
- aucun débordement horizontal structurel.

## QA de cohérence

Les contrats suivants sont migrés/renforcés :

- `qa-retail-product-coherence.mjs` ;
- `qa-shop2-retail-frontend-contract.mjs` ;
- `qa-retail-telco-mobile-money.mjs` ;
- `qa-sector-onboarding-commercial-readiness.mjs` ;
- `shop2-behavioral.yml`.

Ils bloquent notamment :

- le retour du workspace monolithique ;
- le retour du filtre produit local ;
- un `+243` forcé côté frontend ;
- la disparition de l’idempotence ;
- l’affichage direct d’erreurs serveur ;
- le vocabulaire provider/float connu côté client ;
- les types de comptes bruts dans les rapports ;
- la perte des sources de vérité ERP ;
- une régression de la readiness `COMMERCIAL_READY` du secteur Shop.

## Preuve Production finale

Après merge, la preuve finale doit être constituée par :

- le SHA fusionné dans `main` ;
- le déploiement Vercel correspondant avec `target=production` et `readyState=READY` ;
- la GitHub Release `prod-*` ciblant exactement ce SHA.

La Release GitHub est l’enregistrement final opposable de la Production, afin d’éviter de créer une nouvelle PR documentaire uniquement pour inscrire le SHA qu’elle-même produirait.

## Acceptance propriétaire

Cette tranche exécute une acceptance navigateur automatisée production-like et vérifie le déploiement Production réel. Elle ne prétend pas remplacer une éventuelle validation manuelle du propriétaire pour une **nouvelle promotion commerciale**.

Le statut `COMMERCIAL_READY` existant est conservé. Aucune promotion commerciale supplémentaire n’est effectuée dans #145.

## Rollback

- revert applicatif de la PR finale ;
- aucune migration à annuler ;
- aucune correction de données requise ;
- les opérations financières déjà confirmées restent soumises aux règles normales de contrepassation métier.
