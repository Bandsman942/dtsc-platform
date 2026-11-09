> **Hotfix #1094 (candidat v1.7.4, 09/11/2026)** : `formatAccountingNarrative()` centralise le rendu FR/EN des seuls libellés générés automatiquement dans le grand livre, les écritures, traces et exports ; textes postés et montants restent immuables. Le registre global MCP inclut `PUBLIC_TIME`, `PUBLIC_FETCH` et `PUBLIC_BRAVE` avec `STDIO_BRIDGE` dédié : seul le serveur persistant exécute `uvx`/`npx`, Vercel n'exécute aucun subprocessus. Outils READ disponibles dans la Tool Gateway unique (si certifié), ordre prompt `time → brave → fetch`, sécurité URL/DNS/egress, quotas et audit. Tous les outils publics restent **DISABLED jusqu'au rapport de certification réseau réel**, à la présence des variables `MCP_PUBLIC_BRIDGE_URL`, `MCP_PUBLIC_BRIDGE_TOKEN` et `MCP_PUBLIC_BRIDGE_CERTIFIED=true` côté application. Le secret Brave appartient au runner. Détails et matrice E2E : [HOTFIX_1094_ACCOUNTING_MCP_RUNBOOK.md](HOTFIX_1094_ACCOUNTING_MCP_RUNBOOK.md).

> **Complément opérationnel #1091 :** `GET /api/enterprise/:organizationId/inventory-unvalued-receipts` retourne une file paginée et tenant-scoped des mouvements entrants sans couche de coût. Le module `FINANCE_INVENTORY` présente un formulaire contrôlé de coût unitaire réel et de devise (attestation de justificatif), puis réutilise `POST /api/enterprise/:organizationId/stock-movements/:movementId/value-receipt`, avec rôle `FINANCE_INVENTORY.post`, valorisation idempotente et posting canonique. La quantité du stock ne bouge pas. Les opérateurs Retail limités à certaines boutiques ne peuvent pas consulter des coûts consolidés inter-sites.

> **Hotfix #1091 (09/11/2026, candidat v1.7.3)** : la liste `FINANCE_PAYMENTS` n'affirme plus une confirmation prête tant que `GET /api/enterprise/:organizationId/payments?recordId=:id` n'a pas exécuté une prévalidation read-only des droits, de la caisse, du solde facturé, du site, des couches de coûts des articles, de l'inventaire, des mappings, du journal et de la période financière. La confirmation transactionnelle sérialisable reste seule source de vérité. Les refus métier HTTP 409 exposent leur reasonCode traduit et sont audités. `linkedSalesInvoiceId` est dérivé de la proposition de paiement Retail ou des allocations de créance confirmées, jamais d'un numéro libre. L'aperçu A4 canonique de facture est maintenant disponible dans Paiements professionnels (tous statuts liés), Factures clients, Créances, Échéances (liste paginée et tranches d'âge) et En retard. `sales-invoices/:invoiceId/print?paymentId=:id` autorise un lecteur `FINANCE_PAYMENTS.view` uniquement si l'identité de la facture liée et son site sont revérifiés dans la même organisation. Aucun coût d'acquisition fictif n'est créé. QA et OWNER_E2E : [HOTFIX_1091_FINANCE_CONFIRMATION_INVOICE_PRINT.md](HOTFIX_1091_FINANCE_CONFIRMATION_INVOICE_PRINT.md). **Aucune fusion sans CI + E2E propriétaire ; Production depuis `main` uniquement.**

# DTSC Platform — Documentation technique

> **Hotfix #1088 — budgets, dépenses et règlements (09/11/2026, candidat v1.7.2)** : les lignes budgétaires reçoivent une imputation comptable et un compte financier prévisionnel facultatif, sans mouvement de caisse. Les dépenses portent leur bénéficiaire éventuel, leur échéance et leur modalité de règlement ; la charge directe approuvée se comptabilise via le registre canonique, tandis que les factures fournisseurs et flux stocks/actifs/taxes conservent leurs circuits spécialisés. Un nouvel `EnterprisePayment.paymentType=EXPENSE_SETTLEMENT`, tenant-scoped vers la dépense, permet règlements partiels, réservation du reste à payer, approbation et confirmation distinctes, écriture de liquidation et mouvement de trésorerie atomiques ; la charge n’est jamais repostée. Voir [contrat, guide utilisateur et recette #1088](HOTFIX_1088_FINANCE_BUDGET_EXPENSE_PAYMENT.md). **OWNER_E2E requis avant merge et Production depuis `main` uniquement.**

> **Hotfix #1086 — factures clients et POS (09/11/2026, candidat v1.7.1)** : un `EnterpriseSalesInvoice` RETAIL passe par le validateur `EnterpriseApproval` désigné dans la file POS « À valider par moi », puis le gérant `MANAGER` de la boutique concernée ou un titulaire du droit Finance de comptabilisation peut l'émettre. La transition d'émission, la créance et les écritures partagent une transaction Finance `Serializable` ; `RETAIL_POS` ne possède ni registre parallèle ni raccourci de remboursement. L'aperçu imprimable A4 de `FINANCE_RECEIVABLES` utilise la facture canonique pour **tous les secteurs**, et les factures provisoires restent explicitement marquées « non émises ». QA : `pnpm qa:hotfix-1086-invoice-workflow`, guide de recette : [HOTFIX_RETAIL_INVOICE_APPROVAL_1086_20261109.md](HOTFIX_RETAIL_INVOICE_APPROVAL_1086_20261109.md). **OWNER_E2E requis, aucune fusion/déploiement avant validation.**

> **Hotfix RETAIL — isolation du tableau de bord POS (08/11/2026, en attente E2E) :** les projections de catalogue, comptes, dépôts et historiques restent cacheables par entreprise, mais `getCommercialRetailDashboardRead` applique systématiquement la visibilité effective du collaborateur *après* lecture du cache et *avant* la réponse API. Sous `siteStaffIsolationEnabled`, les dépôts sont limités à ses sites autorisés, les comptes et sessions à `COLLECT_PAYMENT`, les ventes à `VIEW_SALES`, et les indicateurs de vente sont recomptés par boutique côté PostgreSQL via `getRetailMetricsByCurrency(..., siteIds)` — jamais à partir des totaux multi-boutiques en cache. L'administrateur/propriétaire conserve la vision consolidée ; un tenant historique sans isolation conserve son parcours. Vérification : `node scripts/qa-retail-pos-dashboard-site-isolation.mjs`. Contrat et E2E : [HOTFIX_RETAIL_POS_DASHBOARD_ISOLATION.md](HOTFIX_RETAIL_POS_DASHBOARD_ISOLATION.md).

> **Hotfix UI #1046 (08/11/2026, avant E2E) :** l'entrée `RETAIL_POS` est devenue un répertoire de 14 cartes : treize vues `?section=checkout|customers|sites|staff|invoices|offline|omnichannel|payments|equipment|readiness|activation|inventory|alerts` et la route commerciale existante `/RETAIL_POS/commercial` (prix, offres, retours), désormais placée dans `AppShell` et thémée DTSC 2.0. La route serveur conserve `resolveEnterpriseModuleAccess` et refuse les sous-vues réservées aux administrateurs pour un rôle non autorisé. Les prérequis Retail ciblent la sous-vue correspondante avant l'ancre historique. `AppShell.hideContextualBack` retire uniquement la bande générique des surfaces immersives POS et Collaborateurs (y compris Commercial) ; leur retour demeure embarqué dans l'en-tête, sans toucher à la navigation des autres modules. Les API de vente, client et messagerie sont inchangées. Voir [HOTFIX_1046_RETAIL_POS_COLLABORATORS_UI.md](HOTFIX_1046_RETAIL_POS_COLLABORATORS_UI.md).

> **RETAIL #1044 — activation administrée (08/11/2026, candidat v1.4.0) :** une nouvelle section **Shop → Mise en service & équipements → Activation des fonctionnalités avancées** pilote `siteStaffIsolationEnabled` et `invoiceCheckoutEnabled` par entreprise, dans cet ordre. `GET/POST /api/enterprise/:organizationId/retail/feature-activation` imposent membership owner/admin, module, same-origin, step-up récent MFA, prérequis Finance/équipe/dépôts, révision optimistic/transaction sérialisable et journal AuditLog atomique. Désactivation sécurisée (factures, retours, paiements, collaborateurs). Les deux flags restent OFF par défaut ; OWNER_E2E de #1044 indispensable avant merge. Contrat, parcours et risques : [HOTFIX_1044_RETAIL_FEATURE_ACTIVATION.md](HOTFIX_1044_RETAIL_FEATURE_ACTIVATION.md).

**Version :** Consolidation ERP + modules standards 8/8 + DTSC AI 08/08
**Version applicative :** `package.json` (SemVer ; la Release GitHub confirme seule une version livrée).
**Repository :** `Bandsman942/dtsc-platform`
**Production :** déploiement Vercel exclusivement depuis `main`

## 1. Objet

> **Retail #1042 tranche 46 (07/11/2026, pré-release) :** `lib/enterprise/retail/site-financial-report.ts` agrège exclusivement les lignes `EnterpriseJournalLine` des journaux `POSTED`/`REVERSED` liés aux comptes de résultat, par entreprise, `siteId`, devise fonctionnelle et période. `GET /api/enterprise/:organizationId/retail/site-overview` rend `postedLedger` par site et `unallocatedPostedLedger` séparé ; `postedLedgerScope=PROVISIONAL_POSTED_ONLY` et `financeMarginCertified=false` empêchent de confondre marges indicatives et résultat net certifié. Le calcul ne récupère ni coûts catalogue ni marges des factures Finance par soustraction arbitraire. QA : `scripts/qa-hotfix-1042-retail-site-ledger.mjs` et contre-épreuve PostgreSQL facture/avoir/retour. Rapprochement historique, exhaustivité de comptabilisation et exports PDF/XLSX nécessaires avant E16 et `OWNER_E2E` final ; aucun déploiement ou activation des flags.

> **Retail #1042 tranche 47 (07/11/2026, pré-release) :** `lib/enterprise/retail/site-financial-export.ts` construit le modèle d'export des écritures P&L postées, avec colonnes boutique/devise et les lignes sans site distinctes. `RetailSiteOverview` appelle les moteurs existants `downloadProfessionalXlsx` et `downloadProfessionalPdfV2` en affichant des boutons « provisoire » FR/EN. Aucune sommation inter-devises ni certification implicite ; PDF/XLSX à vérifier matériellement, et imputation historique à rapprocher avant signature E16.

> **Retail #1042 tranche 48 (08/11/2026, candidat) :** `EnterpriseRetailInvoiceReturnRefundLeg` référence avec des FK tenant-scoped chaque paiement Finance sortant d'un retour sur plusieurs comptes d'encaissement. La route de préparation garde `POST /api/enterprise/:organizationId/retail/invoices/:invoiceId/returns/:requestId/prepare` et exige le même `revision` et les mêmes permissions ; elle crée un paiement `PENDING_APPROVAL` par compte d'origine avec approbation assignée, un avoir unique et un lien par paiement. La route de liquidation `.../settle` conserve le step-up récent, revérifie toutes les approbations, les comptes/allocations et les montants dans une transaction `SERIALIZABLE`, puis inverse chaque allocation, comptabilise l'avoir unique, confirme tous les paiements et restitue le stock valorisé une seule fois. En cas d'échec, aucun paiement/avoir/mouvement ne doit subsister partiellement. Pour un retour historique à un seul paiement, le lien `refundPaymentId` reste autoritatif. Le GET de demandes renvoie désormais `paymentApprovalCount` et `paymentApprovalTotal`, et ne propose `canSettleFinance` qu'après approbation de tous les paiements. **Avant activation :** migration depuis base vide et base existante, E2E PostgreSQL multi-comptes, restauration de sauvegarde, recette E01–E19 et signature propriétaire restent obligatoires.

> **Correction CI Retail #1042 COGS (tranche 47) :** le classement des coûts des ventes utilise `EnterpriseLedgerAccount.accountSubtype=COST_OF_SALES` **ou** l'existence du mapping comptable canonique `EnterpriseAccountMapping.mappingKey=COST_OF_SALES` sur le compte de la ligne, en groupant par `a.id` pour éviter les faux positifs. La fixture PostgreSQL `SHOP2-COGS` n'a volontairement pas de sous-type ; tests automatiques et validation du cycle Finance/retour doivent confirmer son traitement.

> **SemVer #1037 (06/11/2026, candidate) :** adoption de `vMAJOR.MINOR.PATCH` pour la traçabilité de la plateforme entière, avec incrément obligatoire par PR, QA de version et GitHub Release seulement après Vercel Production réussi. Voir [versionnement et procédure de release](RELEASE_VERSIONING.md). Cette étape n'est pas considérée Production tant que les preuves CI/review/merge/déploiement ne sont pas disponibles.

> **Hotfix #1036 (06/11/2026, pré-release) :** palette des interfaces RH uniformisée sur la marque DTSC, couleurs sémantiques limitées aux statuts/alertes, i18n et QA visuelle. Voir [contrat RH](ERP_PROFESSIONAL_HR.md) et [design system](DTSC_FRONTEND_DESIGN_SYSTEM.md). OWNER_E2E et preuves CI requis avant Production. Le libre-service RH intègre désormais le rail de `TIME_ATTENDANCE` et les historiques paginés côté serveur ; `GET /api/enterprise/[organizationId]/my-hr` accepte `page`, `reportPage`, `clockPage` et `pageSize` (5–25), renvoie `payslipsPagination`, `reportsPagination`, `clockSessionsPagination` et `activeClockSession`, avec contrôles de session, organisation, accès module et `Cache-Control: private, no-store`. Les nouveaux champs sont additifs. Liaison depuis `app/enterprise-modules/page.tsx` et le workspace Paie par des CTA compacts, soit vers `TIME_ATTENDANCE?tab=SELF_SERVICE` si l'accès canonique le permet, soit vers la route personnelle indépendante `app/enterprise-modules/my-hr/page.tsx`. Dans le rail, liens locaux vers les quatre onglets de suivi ; les liens vers `HUMAN_RESOURCES` et `PAYROLL_OPERATIONS` proviennent exclusivement de `getEnterpriseNavigationModules` (RBAC, abonnement et restrictions).

Ce document est le point d’entrée technique de DTSC Platform. Les règles exécutables se trouvent dans les fichiers `AGENTS.md`. Les contrats détaillés restent dans les documents spécialisés du dossier `docs/`.

> **DTSC Payments — PAY-0 (#370/#371, 01/11/2026) :** [contrat d'architecture et de cutover](DTSC_PAYMENTS_ARCHITECTURE.md). Cartographie vérifiée des paiements SaaS (`Payment`/`Invoice`), de la trésorerie DTSC (`HrcfoExpense`/`FinancialAccount`) et des paiements ERP clients (`EnterprisePayment` et allocations). Contrôle documentaire : `pnpm qa:dtsc-payments-contract`. Cette étape ne change aucun paiement en production ; PAY-1 à PAY-9 restent à livrer et à valider.

> **Hotfix P0 Console Chrome (#1022, 03/11/2026, avant fusion) :** [diagnostic et recette propriétaire](HOTFIX_1022_CONSOLE_AUTO_RELOAD.md). Reprise PWA sans refresh inutile, expiration/navigation inter-produits dédupliquées, diagnostics opt-in sans données personnelles. OWNER_E2E obligatoire ; Production uniquement depuis `main`.

> **Hotfix P0 MFA/Chrome (#1026, 03/11/2026, avant fusion) :** [frontière de confiance et E2E Chrome mobile](HOTFIX_1026_CHROME_MFA_SESSION_LOOP.md). Le cookie signé sert au routage Edge, tandis que seule la validation serveur `getSession()` autorise Account à renvoyer vers Console ; les déconnexions inter-onglets sont revalidées avant navigation. Aucun changement MFA/RBAC ni Production sans OWNER_E2E.

> **Programme INFRA-MC (#891–#899, 21/10/2026) :** audit et ADR dans [`INFRA_MC_ARCHITECTURE_AUDIT.md`](INFRA_MC_ARCHITECTURE_AUDIT.md). Secours Vercel + autre cloud en **active-passive proposé, non approuvé**, sans activation ni certification. Production Vercel depuis `main` inchangée ; objectifs RPO/RTO, coût, régions et approbation à compléter.

La reprise durable des workflows (#813), les preuves d’effet, les états incertains
et les précautions de déploiement sont décrits dans [WORKFLOW_RUNTIME_RECOVERY.md](WORKFLOW_RUNTIME_RECOVERY.md).

Le lancement manuel transverse des workflows (#863) partage les prédicats ERP de sélection et de validation POST dans `lib/enterprise/workflows/manual-source-options.ts`. Les routes conservent la validation de membership, RBAC, module et entitlement ; les informations sur les objets non visibles ne sont pas divulguées. Les cinq templates Finance suivent uniquement une validation ERP canonique préexistante : aucune comptabilisation, confirmation ou clôture ne s’effectue automatiquement depuis Workflows. Voir [WORKFLOW_ERP_CONTRACTS.md](WORKFLOW_ERP_CONTRACTS.md) et la [checklist de recette](ENTERPRISE_WORKFLOW_ENGINE_QA_CHECKLIST.md).

La plateforme réunit : site public, compte/authentification, SaaS multi-entreprises, console interne DTSC, support, collaboration, ERP commun, extensions Health/Pharmacy, IA, PWA et notifications.

## 2. Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js App Router 15 |
| Interface | React 19, TypeScript, Tailwind CSS |
| Validation | Zod |
| ORM | Prisma 6 multi-fichiers |
| Base | PostgreSQL |
| Hébergement | Vercel |
| Authentification | session serveur et cookie HTTP-only signé |
| QA | scripts Node dédiés, type-check, lint et build |

## 3. Produits et sous-domaines

```text
dtsc-platform.com          site public
account.dtsc-platform.com  compte et authentification
app.dtsc-platform.com      application SaaS
console.dtsc-platform.com  console interne DTSC
support.dtsc-platform.com  support client
```

Les helpers de domaine centralisent les URL. Le middleware protège les produits, exclut les assets et `/api/*` des réécritures, garde le fallback offline public et interdit l’exposition directe de la console dans l’application cliente.

## 4. Authentification et contexte

La session identifie l’utilisateur, le rôle global, le contexte actif et l’organisation active éventuelle.

- `DTSC_INTERNAL` : espace interne ;
- `ORGANIZATION` : entreprise cliente ;
- `GLOBAL_CLIENT` : compte client global.

Une URL, un body ou une clé étrangère fournie par le navigateur n’est jamais une preuve d’accès.

Un cookie HTTP-only correctement signé n'est pas non plus une preuve suffisante de session toujours active après révocation. Les pages de connexion Account qui veulent rediriger un utilisateur déjà authentifié doivent obtenir une session courante de `getSession()`, en respectant `reason=session-expired`. Le middleware ne déduit pas cette autorisation des seules claims Edge (hotfix #1026).

## 5. Isolation multi-tenant

### 5.1 Chemin critique Dashboard et AppShell

Le Dashboard conserve des données exactes et serveur comme autorité. Lorsqu’il a déjà calculé un compteur utilisé par l’AppShell, il peut transmettre cette valeur au shell afin d’éviter une seconde lecture identique ; les autres pages continuent à résoudre leurs compteurs normalement.

En contexte entreprise, la navigation ERP et l’accès Administration sont dérivés d’un même snapshot du résolveur d’accès canonique. Cette mutualisation n’introduit ni cache RBAC ni politique parallèle : membership, organisation, secteur, module, entitlement, dépendances et permissions restent évalués par `lib/enterprise/module-access.ts`.

L’observabilité SCALE-7 expose des classes d’âge **agrégées** pour les sessions PostgreSQL `idle in transaction` (<100 ms, ≥100 ms, ≥1 s) sans SQL, PID, tenant ni utilisateur. Ces classes servent uniquement au diagnostic ; la gate de certification reste strictement zéro session observée.

Toute requête métier vérifie :

```text
session
→ activeOrganizationId
→ membership actif
→ organisation CLIENT
→ module actif
→ entitlement
→ permission
→ visibilité de l’objet
```

Toutes les références structurantes sont revalidées dans le même `organizationId`. Les rôles globaux, un rôle `MANAGER` générique ou une relation active avec une entreprise ne donnent aucun accès implicite à la Finance d’un tenant.

### 5.2 Relations & avantages

Le module `RELATIONSHIP_BENEFITS` ajoute un catalogue d’avantages relationnels sans convertir un client externe en membre du tenant. Les 22 types de relation configurables possèdent un contrat explicite de capability, mais un avantage n’existe pour une personne que si le catalogue, l’audience/attribution et les règles serveur l’autorisent.

Le moteur canonique `lib/enterprise/relationship-benefits/enforcement.ts` évalue relation active et approuvée, entitlement, audience, rôle, attribution, dates, module cible, devise, montant minimum, conditions contrôlées, cumul et quotas. Le DSL de conditions est borné ; aucune condition JSON arbitraire n’est exécutée.

Les demandes génériques utilisent `EnterpriseRelationshipBenefitUsage`. Leur contrat public reste demande/approuvé/refusé/annulé : le navigateur ne peut ni fournir un contexte transactionnel faisant foi, ni forcer `CONSUMED`. Une demande sans cible transactionnelle peut rester request-only ; en revanche, toute `targetModuleCode` ou règle transactionnelle exige un adaptateur serveur certifié et est refusée à la configuration lorsqu’aucun adaptateur n’existe.

Pour `RETAIL_POS`, les remises en pourcentage/montant et prix fixes compatibles sont calculés dans le moteur de pricing Retail, revérifiés dans la transaction de vente puis inscrits dans le ledger avec `effectEntityType=EnterpriseRetailSale`. Le pricing preview utilisé par le POS expose le même total serveur avant encaissement. Les overrides manuels désactivent l’application automatique afin d’éviter un cumul ambigu.

Les promotions Retail restent dans `EnterpriseRetailPromotion`. Les points et avoirs restent détenus par `EnterpriseRetailLoyaltyAccount` et `EnterpriseRetailStoredValueAccount` ; aucun dual-write n’est effectué. Une annulation de ticket annule aussi l’usage automatique afin de restaurer le quota. Un replay idempotent d’un ticket déjà commis conserve les décisions, promotions et usages réellement persistés : un recalcul ultérieur ne peut pas rattacher un nouvel avantage au ticket historique.

**Contrat pré-release #908 — cashback** : un bénéfice `CASHBACK` actif en pourcentage, devise explicitée et cible `RETAIL_POS`, n'est attribué qu'après paiement d'une vente réelle liée à une relation consentie. La base de calcul est le montant net des seules lignes éligibles après remises. Une attribution crée un `EnterpriseRetailStoredValueEntry/EARN` et un usage `AUTO_RETAIL_CASHBACK` atomiquement. Le compte `STORE_CREDIT` est unique par organisation, tiers et devise grâce à `benefitScopeKey`, distinct du `lookupHash` aléatoire utilisé par les cartes-cadeaux. Le POS ne peut débiter ce compte que pour ce même client et cette devise. Les remboursements sur paiement d'origine reconstituent l'avoir ; les retours partiels renversent le cashback sur les lignes éligibles uniquement, et une dette négative bloque les futures consommations jusqu'à compensation. Les journaux débitent la dette d'avoir `CUSTOMER_ADVANCES` lors du paiement, et comptabilisent l'attribution `OPERATING_EXPENSE` / `CUSTOMER_ADVANCES` sans mouvement fictif de trésorerie. Les mappings comptables doivent être prêts avant activation. Cette évolution nécessite une migration additive et une vérification E2E isolée avant toute mise en service. Le crédit forfaitaire `CREDIT` reste hors scope.

**Contrat pré-release Retail #1042 — facturier et caissier multi-boutiques (tranches 3–4)** : la facture Finance `EnterpriseSalesInvoice` conserve seule le solde, le statut, l'émission et la créance ; `EnterpriseRetailInvoiceCheckout` lie cette facture au site, dépôt, lot et idempotency key sans ledger financier concurrent. `GET /api/enterprise/:organizationId/retail/invoices?page=&pageSize=&siteId=&status=` est paginé, affiche les références de sites/dépôts et les données de Finance, filtre les sites du collaborateur, interdit un filtre sur une boutique non assignée. `POST` accepte un panier Zod `{idempotencyKey,siteId,warehouseId,currencyCode,businessPartyId?,lines:[{catalogItemId,stockLotId?,quantity}]}` ; les prix et taxes sont exclusivement recalculés côté serveur. L'accès staff exige la double activation `settingsJson.siteStaffIsolationEnabled` et `settingsJson.invoiceCheckoutEnabled`, une affectation active avec `VIEW_SALES` puis `PREPARE_INVOICE` ; les propriétaires sont transversaux. Aucun contrôle d'activation n'est exposé en UI et le rollout reste OFF.

L'affectation Finance existante `allocateEnterprisePayment` vérifie, uniquement pour les factures liées à Retail, `COLLECT_PAYMENT` sur la boutique, un compte financier actif de même site/devise et une session de caisse de même site pour espèces ; la dernière allocation déclenche le mouvement de stock dans la même transaction sérialisable. Une insuffisance de stock annule toute l'allocation finale et les mouvements ; les paiements confirmés antérieurs conservent leur état dans Finance. Les autres factures Finance restent inchangées. L'interface `RetailInvoiceFlowWorkbench` FR/EN n'affiche la préparation qu'après activation et n'invente pas d'encaissement instantané ni d'approbation automatique. `POST /api/enterprise/:organizationId/retail/invoices/:invoiceId/transition` accepte soit `{action:"CANCEL",revision,reason}` (motif de 4–1000 caractères), soit `{action:"SUBMIT",revision,approverUserId,reason?}` (commentaire facultatif), uniquement en brouillon, avec permission boutique forcée, révision et audit ; `CANCEL` emploie la transition Finance canonique, `SUBMIT` l'approbation Finance assignée, avec conservation du contrôle d'auteur. `GET /api/enterprise/:organizationId/retail/invoices/approval-candidates?siteId=...` (accès `RETAIL_POS:read`, isolation `siteStaffIsolationEnabled` et `invoiceCheckoutEnabled`, réponse `{candidates,selfApprovalOverrideAvailable:false}`) ne retourne que les validateurs indépendants réellement autorisés à approuver en Finance. La soumission Retail limitée ne confère aucun droit `FINANCE_RECEIVABLES:submit` global ; le service Finance vérifie en transaction le lien Retail, le site autorisé et le validateur Finance ; les autres factures continuent leur chemin Finance normal. Erreurs 400/403/404/409/validation, cache no-store et contrôles same-origin sur mutations. L'approbation/émission et tous les remboursements restent exclusivement dans les workflows Finance. Les retours, la réserve de stock, les autres API Retail/ERP et l'E2E propriétaire restent **bloquants**. Documentation détaillée : `docs/HOTFIX_1042_RETAIL_CONFIGURABLE_MULTISTORE.md`.

Une révocation de relation coupe immédiatement les futures capacités ; l’historique d’usage n’est pas supprimé.

## 6. Registre canonique et maturité

Le registre canonique ERP définit les codes, statuts, routes, workspaces, permissions, dépendances, plans et QA des modules ERP. `EnterpriseModule` active un module pour un tenant, mais ne peut ouvrir un code absent, masqué ou non entitled.

Le registre canonique standard `lib/modules/standard-module-registry-data.json` décrit séparément les surfaces SaaS globales, entreprise standard, internes DTSC, Console, publiques, Account et Support. Une entrée standard qui consomme un moteur ERP déclare `erpDependencies` et ne devient jamais une seconde source de vérité.

La maturité commerciale est séparée du statut technique :

- `BACKEND_READY` ;
- `READ_ONLY_UI` ;
- `OPERATIONAL_UI` ;
- `PROFESSIONAL_READY` ;
- `COMMERCIAL_READY`.

Une promotion vers `COMMERCIAL_READY` exige une décision explicite du propriétaire après validation E2E authentifiée et Production stable. Les audits refusent toute promotion automatique des modules standards.

## 7. ERP commun

Le Core comprend : tiers, catalogue, sites/entrepôts, CRM, devis, contrats, commandes, livraisons, fournisseurs, achats, stock, RH/paie client, projets, temps, actifs, documents, workflows, rapports et IA.

Une source de vérité unique est conservée par domaine. Les anciens objets legacy restent en lecture seule lorsqu’une migration destructive n’est pas justifiée.

## 8. Finance opérationnelle — Itération 4

Modules dédiés :

- `FINANCE_OVERVIEW` ;
- `FINANCE_RECEIVABLES` ;
- `FINANCE_PAYABLES` ;
- `FINANCE_PAYMENTS` ;
- `FINANCE_TREASURY` ;
- `FINANCE_CASH` ;
- `FINANCE_BANK` ;
- `FINANCE_RECONCILIATION`.

Les factures, créances/dettes, paiements, allocations, comptes financiers, caisse, banque, transferts et rapprochements restent des objets distincts et durables.

Pour un financement vers une caisse, la référence de session est résolue depuis les sessions communes `OPEN` du compte financier exact et du même tenant. Le sélecteur Finance sépare désormais l’invite de sélection de l’état vide réel et ne pré-sélectionne automatiquement qu’un résultat unique non filtré ; la route de mutation revalide ensuite la session côté serveur avant toute écriture.

## 9. Comptabilité et Finance avancée — Itération 5

Modules dédiés :

- `FINANCE_ACCOUNTING` ;
- `FINANCE_TAX` ;
- `FINANCE_CLOSE` ;
- `FINANCE_STATEMENTS` ;
- `FINANCE_ASSETS` ;
- `FINANCE_INVENTORY`.

### 9.1 Moteur comptable unique

```text
événement métier validé
→ registre de posting allow-listé
→ règle et comptes actifs
→ période autorisée
→ clé d’idempotence
→ lot de comptabilisation
→ écriture
→ lignes
→ Σ débits = Σ crédits
```

`EnterpriseJournalEntry` et `EnterpriseJournalLine` sont l’unique grand livre commun. Une écriture `POSTED` est immuable. Une correction utilise une contrepassation liée ou une nouvelle écriture corrective.

### 9.2 Workspaces avancés

Le workspace Finance avancée expose :

- plan comptable et comptes ;
- exercices et périodes ;
- journaux et écritures ;
- grand livre et balance ;
- règles et anomalies ;
- codes et taux fiscaux ;
- checklist de clôture ;
- états dynamiques et versions publiées ;
- immobilisations et amortissements ;
- valorisation comptable du stock.

Les listes volumineuses sont paginées côté serveur. Les interfaces françaises n’affichent ni UUID, ni enum brute, ni type Prisma.

### 9.3 Périodes et clôture

- `OPEN` : opérations normales ;
- `SOFT_CLOSED` : ajustements contrôlés ;
- `CLOSED` : mutations normales bloquées ;
- `LOCKED` : réouverture standard interdite.

Une réouverture exige permission, motif, acteur indépendant et audit. Elle ne supprime aucune écriture ni version publiée.

### 9.4 Fiscalité

Les codes fiscaux utilisent des taux à date d’effet. Un changement de taux ne modifie jamais les transactions historiques. Le produit ne prétend pas automatiser une déclaration légale universelle.

### 9.5 États financiers

Un aperçu dynamique est recalculable. Une version publiée est horodatée, liée à ses paramètres, protégée par une empreinte et non modifiable.

### 9.6 Immobilisations

Un actif opérationnel devient une immobilisation uniquement après capitalisation contrôlée. La méthode actuellement exposée est l’amortissement linéaire mensuel, réellement supporté et idempotent.

### 9.7 Valorisation du stock

Le stock physique reste l’autorité des quantités. La Finance utilise les couches de coût moyen pondéré et les événements comptables. Une consultation de valorisation ne modifie jamais le stock physique.

## 10. Documents, commentaires et notifications

Les pièces financières utilisent le stockage privé et les liens structurels. Les commentaires restent distincts des décisions de workflow et sont modifiables seulement selon la politique d’auteur.

Les notifications utilisent des liens profonds vers le module, l’objet et la section utile. Le backend revalide toujours l’accès à la destination.

## 11. API et sécurité

**Abonnements SaaS — renouvellement entreprise (hotfix #1001).** Le client dispose d'un accès contextualisé au renouvellement depuis `/dashboard` et d'une section directe sur `/billing#renouvellement-entreprise` sans accordéon préalable. Le suivi du dernier ticket de renouvellement (statut, dates, résolution) est projeté depuis `SupportTicket` et non dupliqué dans un nouveau modèle. Seul le créateur accède à la conversation privée via le lien Support ciblé, indépendamment du fait que plusieurs administrateurs d'une même organisation puissent voir le statut de demande dans Facturation. Les routes de renouvellement conservent leur RBAC serveur, la déduplication et l'interdiction de prélèvement récurrent sans mandat. Détails, QA et rollback : `docs/SAAS_BILLING_TREASURY_HOTFIX_2026_11_01.md`.

Contrat général d’une route mutante :

```text
getSession
→ organisation et membership
→ module/entitlement
→ permission et objet
→ same-origin
→ Zod
→ await rateLimit
→ transaction Prisma
→ ApiLog
→ AuditLog
```

Règles : aucun IDOR, aucune référence inter-tenant, aucun secret côté client, aucun log de document complet, salaire individuel, compte bancaire complet ou donnée clinique.

Les codes d’erreur Finance sont transformés en messages métier actionnables sans perdre leur valeur d’observabilité.

## 12. UI/UX

Primitives : `ModuleWorkspace`, `ModuleHeader`, `ModuleMetrics`, `ModuleToolbar`, `ModuleContent`, `ModuleSection`, `BusinessList`, `BusinessDetail`, `ContextActions`, `StatusBadge` et `EmptyState`.

Mobile : rail KPI horizontal local, `min-w-0`, aucun débordement global, champs à taille tactile, clavier numérique pour les montants, dialogs scrollables et formulaires utilisables à 320–412 px.

## 13. Prisma et migrations

- schéma multi-fichiers dans `prisma/` ;
- migrations historiques immuables ;
- évolutions additives privilégiées ;
- clés et index tenant-aware ;
- aucune suppression d’écriture, ligne, période utilisée, état publié, amortissement ou valorisation ;
- installation depuis une base vide obligatoire ;
- aucune dépendance cachée à un backfill manuel.

La fondation standard de l’itération 1 est statique et n’introduit aucune migration Prisma.

## 14. Audit d’intégrité

```bash
pnpm audit:financial-integrity -- --organization-id <id> --period-id <id> --json
```

Filtres supportés : organisation, période, plage de dates, journal, compte, JSON et fichier de sortie.

L’audit contrôle notamment : équilibre, lignes et en-têtes, sources, écritures sans lignes, balance, factures sans créance/dette, soldes incohérents, allocations excessives, périodes fermées, postings sectoriels dupliqués et contrepassations dupliquées.

Les sorties sont agrégées et ne réparent jamais silencieusement les données.

## 15. QA

Commandes principales :

```bash
pnpm prisma generate
pnpm type-check
pnpm lint
pnpm qa:regression
pnpm build
```

Fondations standards :

```bash
pnpm qa:standard-module-registry
pnpm qa:standard-module-navigation
pnpm qa:standard-module-routes
pnpm qa:standard-module-permissions
pnpm qa:standard-module-guides
pnpm qa:standard-module-language
pnpm qa:standard-module-mobile
pnpm qa:standard-module-multi-domain
pnpm qa:standard-module-readiness
pnpm qa:standard-modules-iteration-01
```

La CI démarre PostgreSQL, applique toutes les migrations depuis zéro, génère Prisma, exécute les audits, vérifie la parité Finance, le type-check, la régression incluant l’itération standard, le lint et le build.

## 16. CI/CD et Production

```text
branche feature
→ contrôles
→ Pull Request
→ GitHub Quality Gates
→ revue
→ merge dans main
→ prisma migrate deploy
→ pnpm build
→ Vercel Production
→ E2E manuels du propriétaire
```

Aucun `vercel deploy` ou `vercel --prod` n’est lancé depuis une branche. Les previews désactivées sont normales.

Après merge : vérifier SHA fusionné, SHA `main`, SHA Production, migrations, build, authentification, sélection du tenant, navigation, Finance, Health, Pharmacy, modules standards, PWA/Web Push, aliases, logs critiques et audits applicables.

## 17. Rollback

Le rollback est non destructif. Il peut masquer une action ou bloquer une route mutante tout en conservant les lectures et tout l’historique.

Il ne doit jamais supprimer, modifier ou recréer : écriture, ligne, contrepassation, période, état publié, amortissement, valorisation ou séquence.

Pour le registre standard, le rollback peut retirer une intégration de navigation ou déclasser honnêtement un statut, mais ne doit jamais promouvoir un module ni inventer une route de remplacement.

## 18. Documentation spécialisée

Références principales ERP :

- `docs/ERP_FINANCE_ARCHITECTURE.md`
- `docs/ERP_ACCOUNTING_MODEL.md`
- `docs/ERP_POSTING_RULES.md`
- `docs/ERP_FINANCIAL_SECURITY.md`
- `docs/ERP_ACCOUNTING_INTEGRITY_CONTROLS.md`

Références principales standards :

- `docs/STANDARD_MODULE_INVENTORY.md`
- `docs/STANDARD_MODULE_PROFESSIONAL_STANDARD.md`
- `docs/STANDARD_MODULE_DOMAIN_ARCHITECTURE.md`
- `docs/STANDARD_MODULE_NAVIGATION_CONTRACT.md`
- `docs/STANDARD_MODULE_PERMISSION_MODEL.md`
- `docs/STANDARD_MODULE_RESPONSIVE_CONTRACT.md`
- `docs/STANDARD_MODULE_ACCESSIBILITY_CONTRACT.md`
- `docs/STANDARD_MODULE_LANGUAGE_CONTRACT.md`
- `docs/STANDARD_MODULE_USER_GUIDES_INVENTORY.md`
- `docs/STANDARD_MODULE_USER_GUIDE_CONTRACT.md`
- `docs/STANDARD_MODULE_COMMERCIAL_READINESS.md`
- `docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_01.md`

## 19. Contrôle des projections inter-modules ERP

La consolidation utilise l’outbox durable d’événements métier. Chaque consommateur reçoit un reçu `EnterpriseCrossModuleProjection` idempotent avec état de reprise, erreur et liens profonds exacts. Les extensions sectorielles continuent de référencer les objets communs Finance, stock et comptabilité.

## 20. Fondations des modules standards — Itération 1/8

### 20.1 Registre

Le registre standard couvre les modules non ERP sans modifier l’autorité du registre ERP. Il centralise code, labels, description, famille, domaine, statut, maturité, route, host, icône, ordre, politique d’accès, permissions, plan, abonnement, dépendances, guide, QA, aliases et routes legacy.

### 20.2 Navigation

`components/layout/nav-links.tsx` résout les surfaces globales depuis les métadonnées canoniques. Les traversées PUBLIC, APP, ACCOUNT, CONSOLE et SUPPORT passent par les helpers de domaine. Les shells partagés sont des exceptions explicites auditées, jamais des collisions silencieuses.

### 20.3 Accès et capacités

`resolveStandardModuleAccess` produit une décision structurée avec reason code, message, plan requis, dépendances manquantes et capacités. Cette décision de module précède les contrôles d’objet ; elle ne les remplace pas.

### 20.4 PWA, session et Web Push

Cette itération réutilise les contrats existants : cookie partagé contrôlé, redirection interne fiable, session inactive/révoquée, fallback offline public, absence de cache privé et Web Push conditionné par la configuration serveur. Les comportements navigateur restent dans la checklist E2E manuelle.

### 20.5 Maturité

Aucune promotion vers `COMMERCIAL_READY` n’est réalisée. Les guides absents, routes BETA et validations navigateur restent des écarts visibles dans les audits et les inventaires.

**Tests E2E manuels préparés — validation du propriétaire en attente**

## Modules standards — Itération 03 : collaboration

La collaboration utilise `CollaborationGroup` comme agrégat canonique pour les conversations directes et de groupe. `directKey` garantit l’unicité par contexte. Les messages utilisent `clientMessageId`, lectures persistées, réactions, pièces jointes privées et modération auditée.

Les appels réutilisent LiveKit et `CollaborationGroupCall`. Les transitions, l’expiration de sonnerie et les durées sont décidées côté serveur. Les annonces utilisent une audience serveur et des commentaires paginés. Voir les documents `STANDARD_COLLABORATION_*`, `STANDARD_CALLS_*`, `STANDARD_ANNOUNCEMENTS_MODEL.md` et `STANDARD_MODERATION_MODEL.md`.

## 21. Modules standards — Itération 04 : coordination du travail

### 21.1 Calendrier agrégé

`/api/calendar/unified` agrège les événements autorisés de la période visible : calendrier, tâches, demandes, validations, réunions, instances de workflow et documents à échéance. Chaque entrée conserve `sourceType`, `sourceId`, le contexte, le fuseau et un lien profond. Une projection calendrier liée adopte la clé de l'objet canonique, puis la projection source la remplace dans la déduplication.

La plage est limitée à quatre-vingt-treize jours et chaque source est bornée. Le filtre temporel et la visibilité des workflows sont combinés dans des groupes `AND` distincts pour éviter qu'un `OR` n'en écrase un autre.

### 21.2 Coordination des tâches et demandes

Les extensions additives comprennent : checklists, dépendances, blocages et filtres personnels. La progression est calculée uniquement depuis une checklist réelle. Les dépendances sont tenant-scoped et les cycles sont refusés.

Les demandes disposent d'un cycle d'information, réponse, résolution, clôture et réouverture avec commentaires et événements. Les interfaces ouvrent l'objet exact depuis `?task=` et `?request=` après contrôle serveur.

### 21.3 Validations versionnées

Une validation conserve des versions de soumission et des décisions idempotentes. La correction exige un motif, la resoumission crée une nouvelle version et la délégation vérifie le membership du nouveau validateur. Les services métier existants restent responsables de la décision finale sur les achats, budgets, dépenses et autres sources.

### 21.4 Réunions

L'ordre du jour, les versions de compte rendu et les liens réunion-tâche sont persistés. Une décision peut créer une vraie tâche par la route dédiée. Les appels réutilisent Collaboration ; aucun second moteur audio/vidéo n'est créé.

### 21.5 Workflows

Le moteur `EnterpriseWorkflow*` existant reste canonique : définitions, versions, étapes, transitions, instances, tentatives idempotentes, événements et outbox. Une instance reste liée à sa version d'origine. Les reprises temporelles peuvent être projetées dans le Calendrier.

### 21.6 Documents

Les documents utilisent `EnterpriseDocument`, `EnterpriseDocumentVersion`, les accès privés, le stockage signé et `EnterpriseEntityLink`. L'itération 04 ne crée ni table de fichiers ni table de liens concurrente. Les listes chargent les métadonnées et demandent les fichiers à la demande.

### 21.7 QA et documentation

Les scripts `qa:standard-*` de l'itération 04 convergent vers `scripts/qa-standard-work-coordination-checks.mjs` et sont inclus dans `qa:regression`. Les modèles détaillés, la matrice de permissions, les liens profonds, les notifications, les neuf guides et le plan E2E sont référencés par `docs/STANDARD_MODULE_ITERATION_04_AUDIT.md`.

La PR peut viser `PROFESSIONAL_READY` uniquement après Quality Gates, revue, fusion et vérification Production. `COMMERCIAL_READY` reste interdit sans E2E explicite du propriétaire.

**Tests E2E manuels préparés — validation du propriétaire en attente**
## Itération 05 — Couche IA gouvernée

La couche `lib/ai/` fournit types, catalogue, classification, abstraction fournisseur, orchestration/fallback, erreurs stables, prompts versionnés, registre d’outils, i18n des erreurs, coûts et observabilité. Les routes existantes `/api/chat/v2` et `/api/enterprise/ai/chat` l’utilisent sans recréer leurs historiques. La migration `20260804173000_standard_ai_governance_iteration_05` ajoute les appels modèle et les preuves/transitions de maturité, plus les métadonnées linguistiques de connaissance. La console `/admin/erp-readiness` devient la surface canonique ERP + standards en matrice/Kanban.

### DTSC AI 00/08 — Policy Governance

Le Policy Engine `lib/ai/policy.ts` rend opposables avant provider le contexte, le plan effectif résolu côté serveur, les capacités requises, la fenêtre de contexte et la classification des données. Un provider inconnu est considéré externe jusqu'à certification ; `SECRET` n'est jamais transmis à un provider externe et les classifications sensibles externes sont refusées par défaut.

### DTSC AI 01/08 — Provider abstraction et streaming normalisé

AI01 découple le runtime applicatif des événements natifs OpenAI Responses. `lib/ai/provider.ts` devient la façade canonique d'adapters ; `lib/ai/providers/openai-responses.ts` contient le transport HTTP/SSE et traduit les événements natifs vers `AiProviderEvent` (`TEXT_DELTA`, `TOOL_CALL_DELTA`, `TOOL_CALL_COMPLETED`, `USAGE`, `COMPLETED`, `ERROR`). `lib/ai/stream.ts` consomme uniquement ce contrat normalisé.

Les protocoles `OPENAI_CHAT_COMPLETIONS` et `OPENROUTER_CHAT_COMPLETIONS` sont préparés dans le type et le catalogue, mais restent fail-closed tant qu'un adapter certifié n'est pas livré. OpenRouter n'est donc pas activé par AI01.

La cancellation est propagée au reader provider. Un flux qui se termine sans `COMPLETED` devient `STREAM_INTERRUPTED`; un événement provider `ERROR` arrête le flux amont. La migration additive `20260810065000_ai_provider_attempt_observability` introduit `AiProviderAttempt` pour tracer l'ordre, le provider/modèle, le statut, le reason code et la durée de chaque tentative sans prompt, message ou secret. `AiModelCall` reste l'unité applicative de consommation ; plusieurs tentatives techniques ne créent pas un double comptage quota/coût.

Les gates `qa-standard-ai-provider-adapters`, `qa-standard-ai-normalized-stream`, `qa-standard-ai-stream-cancellation` et `qa-standard-ai-provider-attempts` sont raccordées à l'agrégateur de l'itération 05 et doivent rester vertes avec AI00, la régression ERP, type-check, lint, migrations et build.

### DTSC AI 02/08 — OpenRouter et modèles certifiés

AI02 rend `OPENROUTER_CHAT_COMPLETIONS` exécutable derrière la façade AI01 sans modifier l'autorité AI00. `lib/ai/providers/openrouter-chat-completions.ts` normalise texte, outils, usage, erreurs et cancellation dans `AiProviderEvent`.

OpenRouter n'est jamais une source de vérité de catalogue : aucun modèle n'est activé par défaut et `AI_OPENROUTER_CERTIFIED_MODELS_JSON` est la seule allow-list OpenRouter. Le catalogue générique ne peut pas injecter de modèle OpenRouter, une certification exige une version explicite et ne peut pas écraser un code modèle DTSC existant.

Chaque requête OpenRouter impose `allow_fallbacks:false`, `data_collection:"deny"` et `zdr:true`. Les fallbacks restent donc décidés et audités par DTSC, et l'accès à un modèle reste soumis au plan, au contexte, aux capacités et à la politique de données. Le script `scripts/ai/audit-openrouter-catalog.mjs` compare les modèles certifiés au catalogue ZDR compatible en lecture seule ; il n'active ni ne modifie aucun modèle.

**Hotfix P0 #963 (30/10/2026, pré-release) :** `google/gemini-2.5-flash` est encore annoncé dans le catalogue OpenRouter général, mais absent de `/models?zdr=true` le jour du diagnostic. Sa certification historique est révoquée dans `lib/ai/catalog.ts` sans désactiver ZDR. Le portefeuille de sept modèles candidats est versionné dans `config/ai/openrouter-certified-models-20261030.json` ; l'audit `node scripts/ai/audit-openrouter-catalog.mjs --catalog-file config/ai/openrouter-certified-models-20261030.json` vérifie leur présence ZDR et leurs capacités publiées. **Ce fichier n'est pas une seconde source de vérité runtime** : les modèles ne sont activés qu'après certification, OWNER_E2E, merge `main` et mise à jour contrôlée de `AI_OPENROUTER_CERTIFIED_MODELS_JSON` en Production.

Le health-check classe désormais les échecs par `contextCode` et `taskType`, ne pénalise pas un provider pour un schéma d'outil invalide et préserve les tentatives réussies dont `reasonCode` est NULL. Les sélecteurs Chatbot/Entreprise et `/api/models` appliquent le plan effectif et les désactivations administrateur. Les préférences historiques révoquées reviennent à Auto sans lever la politique. Le transport OpenAI Responses tolère les paramètres d'outils optionnels (`strict:false`) ; la validation Zod, RBAC et les confirmations côté serveur restent obligatoires. Voir `docs/HOTFIX_963_OPENROUTER_AI_RECOVERY.md`.

`/api/models` expose uniquement les modèles déjà filtrés par le runtime, avec des métadonnées non sensibles de profil/certification. Les gates AI02 contrôlent l'adapter, la certification, les fallbacks inter-provider, le statut externe par défaut et la parité UI/runtime. Aucun changement Prisma n'est introduit par AI02.

## Modules standards — Itération 06 — Gouvernance d’entreprise (2026-08-05)

L’itération 06 professionnalise Budgets, Rapports et Administration entreprise sans dupliquer les moteurs ERP. Les budgets utilisent des versions additives, scénarios, gel, prévisions et alertes ; les métriques communes sont définies dans `lib/enterprise/reporting/metric-registry.ts`. L’administration ajoute rôles d’organisation, simulation de permissions, politiques de sécurité, protection du dernier administrateur, hiérarchie des départements et audit enrichi. La migration `20260805003000_standard_enterprise_governance_iteration_06` est additive. Les guides natifs sont dans `lib/user-guides/iteration06-guides.ts` et la QA agrégée est `pnpm qa:standard-modules-iteration-06`.

## Console DTSC — professionnalisation Itération 07

La Console globale utilise désormais des routes canoniques sous `/admin`, des datasets paginés dans `lib/console`, des capacités serveur explicites, des guides natifs et des audits dédiés. Les synchronisations financières ont été retirées du rendu. Voir `docs/STANDARD_DTSC_CONSOLE_ARCHITECTURE.md` et les contrats Console associés.

## Remédiation E2E itération 7 v3 — contrats transverses

### Progression opérationnelle

`lib/operational-progress.ts` centralise le calcul de progression et les gardes de clôture. Les routes de statut et de checklist ne font plus confiance à une valeur de progression saisie par le client. Les tâches COO liées à une opération et les éléments `OperationalChecklistItem` sont agrégés dans la même règle déterministe.

### Quotas IA et facturation

`lib/billing/ai-usage-limits.ts` résout le plan actif selon le contexte organisationnel ou personnel. `lib/billing/entitlements.ts` projette les champs administrables du plan vers les limites de l’Assistant IA entreprise. Le catalogue initial est défini une seule fois dans `config/billing-plans.bootstrap.json`; les modifications ultérieures restent versionnées en base.

### Actions flottantes

`FloatingActionHubProvider` fournit un registre client global. Les modules enregistrent une définition d’action au lieu de monter leur propre bouton fixe. Le hub rend une seule commande avec tri, safe area, fermeture avant navigation et actions mobiles conditionnelles.

### Guides et i18n

`scripts/audit-user-guide-contract.mjs` valide la structure et les fonctionnalités documentées. `scripts/audit-iteration-07-i18n-contract.mjs` contrôle les parcours corrigés et compare l’application à `config/i18n-hardcoded-baseline.json`; le nombre de libellés probables codés en dur ne peut plus augmenter sans correction explicite.

## Delivery Governance v1

Le workflow officiel est défini dans `docs/DELIVERY_GOVERNANCE.md`. Les agents suivent `docs/AGENT_DELIVERY_RUNBOOK.md`; le rapport du vendredi suit `docs/WEEKLY_DELIVERY_REPORT_CONTRACT.md`. Les checks canoniques requis sont `Delivery governance`, `Quality` et `Migration`. Vercel publie nativement le statut `Production` sur GitHub ; seule sa réussite autorise la GitHub Release.

## DTSC AI — RAG V2 / Knowledge Engine (AI05)

AI05 conserve PostgreSQL/pgvector et les modèles documentaires existants comme sources de vérité, sans index parallèle. Les embeddings passent désormais par `lib/ai/embeddings.ts`, avec identité provider/modèle/dimension/version et batch borné. Les index historiques restent explicitement `legacy-openai-1536-v1` jusqu’à réindexation contrôlée.

Les uploads personnels et Enterprise persistent stockage + texte extrait, retournent `202 PROCESSING`, puis terminent l’indexation avec `after()`. Les insertions de chunks sont idempotentes via SHA-256 + `indexVersion`. Le retrieval Enterprise filtre tenant, statut, archive, confidentialité, secteur/module et compatibilité d’index avant un ranking hybride pgvector + PostgreSQL lexical, puis un reranking optionnel avec fallback déterministe.

Les classifications RAG sélectionnées (dont `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE`) sont fusionnées avec celles du Context Engine avant passage au Policy Router. Aucun reindex global automatique n’est autorisé en Production ; le planificateur `scripts/ai/plan-rag-reindex.mjs` est dry-run et borné.

Documentation canonique : `docs/STANDARD_AI_KNOWLEDGE_RAG_ARCHITECTURE.md`, `docs/STANDARD_AI_EMBEDDING_INDEXING.md` et `docs/STANDARD_AI_DATA_CLASSIFICATION.md`.

## AI06 — DTSC Tool Gateway

AI06 introduces the canonical Tool Gateway on top of `lib/ai/tool-registry.ts`. Certified tools require an explicit registry definition, runtime Zod schemas, an explicit executor and centralized authorization. Pharmacy READ tools are migrated behind the Gateway; private support-ticket and DTSC-contact-email actions are mutations requiring a turn-bound structural confirmation.

The additive migration `20260810002000_ai_tool_gateway_confirmation_idempotency` creates `AiToolConfirmation` and `AiToolExecution`. Idempotency is protected by a unique database scope key and an atomic `ON CONFLICT ... DO NOTHING RETURNING id` execution claim. Pending confirmations expose only sanitized previews to the browser. The canonical Prisma representation lives in `prisma/standard-ai-governance.prisma`, consistent with the repository's multi-file Prisma schema.

Dedicated AI06 QA covers runtime registry integrity, authorization, structural confirmation, idempotency, tenant isolation and private-action bypass prevention. The five official package commands are `qa:standard-ai-tool-runtime`, `qa:standard-ai-tool-authorization`, `qa:standard-ai-tool-confirmation`, `qa:standard-ai-tool-idempotency-runtime` and `qa:standard-ai-tool-tenant-isolation`.

## Annexe — DTSC AI 08/08 : Agent Runtime contrôlé

AI08 complète la chaîne Standard AI sans créer de routeur, moteur d’outils ou mémoire conversationnelle parallèle :

```text
Conversation canonique
→ Assistant Runtime / Context Engine / CAG / RAG
→ Policy Router
→ provider certifié
→ structured tool proposal
→ DTSC Tool Gateway
→ résultat audité et traité comme donnée non fiable
→ continuation bornée
→ réponse finale ou suspension/arrêt contrôlé
```

### Sources de vérité

- `lib/ai/agent/*` : policy de run, runtime interactif, persistance, outils, turns et reprise ;
- `AiAgentRun` / `AiAgentStep` : état, plafonds, étapes, outils, provider/modèle, usage, coût, durée et reason codes ;
- `routeAiStream()` : autorité unique de routage provider/modèle/policy ;
- `executeAiTool()` : autorité unique d’exécution outil ;
- `AiToolConfirmation` / `AiToolExecution` : confirmation structurelle et idempotence ;
- `Conversation` / `Message` et `EnterpriseAiConversation` / `EnterpriseAiMessage` : mémoires conversationnelles existantes.

Aucun prompt complet, copie de conversation ou chaîne de pensée privée n’est ajouté aux modèles Agent.

### Surfaces

- `POST /api/chat/agent` : Agent Chatbot global opt-in ;
- `POST /api/enterprise/ai/agent` : Agent Entreprise opt-in ;
- `GET /api/ai/agent/context` : contexte actif minimal dérivé de la session ;
- `GET /api/ai/agent/runs/:id` : statut sûr ;
- `POST /api/ai/agent/runs/:id/cancel` : cancellation ;
- `POST /api/ai/agent/runs/:id/resume` : reprise canonique ;
- `components/chat/ai-agent-run-dock.tsx` : UX commune FR/EN/mobile du mode Agent.

Les routes historiques `/api/chat/v2` et `/api/enterprise/ai/chat` restent indépendantes. Le mode Agent est donc un opt-in produit et non un remplacement implicite du chat existant.

### Budgets, confirmations et sécurité

Chaque run reçoit des plafonds serveur `maxSteps`, `maxToolCalls`, `maxTokens`, `maxEstimatedCost`, `maxDurationMs`, `allowedToolModes` et `allowedToolCodes`. Une demande client ne peut jamais les augmenter.

Une mutation nécessitant confirmation suspend le run en `WAITING_CONFIRMATION`. Après confirmation structurelle réussie, le Tool Gateway produit l’exécution canonique et le run passe `READY_TO_RESUME`. La reprise recharge le résultat côté serveur, revalide tenant, droits, plan, quotas et classifications, puis claim atomiquement le même run. Un refus clôt le run suspendu avec `CONFIRMATION_CANCELLED`.

`SENSITIVE_MUTATE` n’est pas exposé. Pour Health, Finance, RH et Legal sensibles, l’Agent reste limité à READ/PREPARE et les workflows métier canoniques conservent l’autorité finale.

### MCP et Durable Agent

AI08 peut orchestrer uniquement les outils MCP READ déjà certifiés et projetés dans le Tool Gateway. Discovery distante, ressources ou prompts MCP ne deviennent jamais une permission ou une instruction système. `SECRET` ne sort pas vers MCP/provider externe.

La classe `DURABLE` reste réservée mais inactive. DTSC ne simule pas un agent background par une requête HTTP longue ; tout raccord durable futur doit réutiliser une infrastructure de worker réellement persistante et disposer de ses propres contrats/QA.

### Observabilité et UX

L’interface affiche uniquement l’état sûr du run : progression, outils, plafonds, tokens, coût estimé, confirmations, reason codes, annulation et reprise. Elle n’affiche ni prompts, ni arguments bruts, ni raisonnement privé.

Les traces provider (`AiProviderAttempt`), appels modèle (`AiModelCall`), exécutions outil (`AiToolExecution`), audits MCP et runs/steps Agent restent complémentaires afin de conserver la provenance sans double comptage fonctionnel.

### Validation et maturité

Les gates AI08 couvrent runtime/confidentialité, budgets, confirmation, reprise, UX FR/EN/mobile, idempotence, cancellation, isolation tenant et domaines sensibles. Elles sont intégrées à la régression Standard AI.

`COMMERCIAL_READY` reste interdit sans preuve sur le SHA `main` réellement déployé en Production : E2E Chatbot Agent, Assistant Entreprise, CAG+RAG, OpenRouter/fallback, READ, PREPARE, MUTATE confirmé/repris, MCP READ réellement configuré, cancellation et refus sensitive/cross-tenant.

Documents détaillés :

- `docs/STANDARD_AI_AGENT_RUNTIME.md` ;
- `docs/STANDARD_AI_AGENT_RUNBOOK.md` ;
- `docs/STANDARD_AI_TOOL_GATEWAY.md` ;
- `docs/STANDARD_AI_MCP_ARCHITECTURE.md` ;
- `docs/STANDARD_AI_ORCHESTRATION_ARCHITECTURE.md` ;
- `docs/STANDARD_AI_OBSERVABILITY_MODEL.md` ;
- `docs/user-guides/AI_AGENT_MODE_FR.md` ;
- `docs/user-guides/AI_AGENT_MODE_EN.md`.

## SCALE-7 — staged capacity certification

Issue #360 introduces a manual k6 certification harness for 500 / 1,000 / 2,500 / 5,000 simultaneous users. The workflow is never triggered automatically, uses at least two authenticated load-test tenants, samples the protected CTO observability endpoint, enforces tenant-isolation probes and archives sanitized GitHub Actions evidence. Versioned summaries in `data/scalability/scale7-certifications.json` are exposed separately from live telemetry in Administration DTSC → CTO → Scalabilité. Stage/profile progression is fail-closed; a higher stage cannot run before the prior stage has archived PASS evidence.

## Hotfix #756 — financements communs

Le domaine Finance commun inclut désormais `EnterpriseFundingOperation` pour les apports en capital, avances d'associés et emprunts reçus. Le service `lib/enterprise/accounting/funding-service.ts` orchestre approbation, confirmation, trésorerie, caisse et posting dans une transaction sérialisable. Les routes `funding-operations` sont protégées par `FINANCE_TREASURY`, same-origin, validation Zod, rate limit et audit via les primitives Finance communes.

L'interface Trésorerie expose un onglet **Financements** construit sur les sélecteurs de références canoniques ; les validations transversales présentent et ouvrent l'opération précise. Les erreurs sont traduites et orientées action. Les rapports comptables continuent à dériver le chiffre d'affaires uniquement des écritures de produits `POSTED` : les événements de financement utilisent `EQUITY_CAPITAL`, `BORROWINGS` ou un compte de passif explicite, jamais un mapping de revenu.

## Hotfix #758 — convergence UI/Backend ERP

Le shell ERP commun ne rend plus le bloc décoratif « Accès et responsabilités ». Les permissions restent autoritaires côté serveur.

Comptabilité réutilise désormais un contrat unique entre création, liste compacte, détail et actions :
- `label` persistant sur exercices/périodes ;
- capabilities serveur sur Plan/Compte/Exercice/Période/Journal/Règle ;
- menu contextuel `…` pour les actions globales autorisées ;
- règles OHADA affichées à partir des mappings sémantiques installés ;
- règles personnalisées créées via `EnterpriseAccountMapping` scoped par `chartId`.

Les plein-écrans ERP Gaming mutables audités suivent le même contrat de menu contextuel pour les actions globales.

## WF-01 — Contrats ERP des workflows (#814)

Le catalogue et la publication utilisent `getWorkflowContractReadiness`. La présence de `adapter.createApproval` correspond à une fonction de création réellement déléguée au service métier ; elle n’est jamais déduite d’une capacité générale de Finance. Les champs conditionnels ont un type unique dans l’adaptateur. Le choix post-action recharge l’objet, vérifie son identité, son tenant et une révision au moins égale à celle observée après effet. Référence : [contrats, inventaire et preuves](WORKFLOW_ERP_CONTRACTS.md).


## WF-02 — RBAC/entitlements du moteur de workflows (#815)

Les opérations du module WORKFLOWS exigent le membership CLIENT actif, le module activé et son entitlement canonique. L’accès au module source ERP est vérifié à la route et l’acteur d’exécution est revalidé à l’exécution ; MANAGER n’est pas administrateur implicite. Les métriques de runs partagent exactement le prédicat de visibilité des listes. Voir [WORKFLOW_SECURITY_POLICY.md](WORKFLOW_SECURITY_POLICY.md) pour les routes, matrices, critères E2E, cas de révocation et rollback.


### WF-03 — Publication transactionnelle et démarrage manuel (#816)

La définition de workflow après première publication conserve son contrat de déclenchement : `updateWorkflowDefinition` refuse atomiquement les modifications des champs comportementaux hors `status=DRAFT`. Le token de revue couvre également `allowManualStart`, `singleActiveRun`, `currentVersionId` et le statut ; la publication revalide le token dans une transaction PostgreSQL `SERIALIZABLE` sur les données du graphe. La concurrence échoue explicitement sans publier un état non revu.

Le catalogue Activités filtre `EnterpriseWorkflowDefinition.status=ACTIVE` et une version `PUBLISHED` ; les entrées héritées ne sont pas exécutées. Le GET `/api/enterprise/:organizationId/workflow-runs/sources?definitionId=...` propose au maximum 50 identifiants métier par type certifié, avec noms et statuts, selon tenant, permission WORKFLOWS et module ERP, sans montants ni données privées. Le POST `/workflow-runs/start` revalide l’existence et la visibilité d’un même objet pour l’acteur, même avec un ID falsifié. Les exécutions se chargent par pages de 20 et peuvent être consultées par `runId` sous contrôle du backend. Pas de changement de schéma Prisma ni de secrets.


### WF-04 — Exploitation et latences bornées (#817)

La route sécurisée des exécutions Workflows réutilise son prédicat tenant + droits de membre + modules ERP pour les mesures statistiques. `observability` détaille échantillonnage (`sampledAt`, `windowDays=30`, `sampleLimit=500`, `capped`), latences `p50/p95/p99` calculées à partir des run COMPLETED/REJECTED avec dates fiables, et ancienneté des runs WAITING/BLOCKED selon `updatedAt`. Ces chiffres sont des échantillons, jamais une facturation ou un SLA exhaustif. Un compteur manquant vaut `null`, pas 0. Le worker interne compte en plus les leases `PROCESSING` expirées, sans exposer de payload. Référence : `docs/WORKFLOW_OPERATIONS_RUNBOOK.md`. Aucun changement Prisma.


### WF-05 — Fondations de projection visuelle (#818, SPIKE)

`visual-projection.ts` transforme uniquement `WorkflowVersionInput` vers nœuds/arêtes d'interface et sauvegarde des coordonnées bornées sous `visual.node.{code}.{x|y}` dans `configurationJson`. Ce code est pur : aucun moteur d'exécution, mutation, token, nouvelle table ou connecteur. Le test `qa-workflow-visual-roundtrip` couvre dix nœuds, branches et sauvegarde sans perte. Un composant React/SVG de studio interactif est intégré sur la branche PR #836 : déplacement (pointer/keyboard), connexion de nœuds avec outcome typé, édition des libellés, zoom, liste mobile accessible, undo/redo bornés, et sauvegarde des coordonnées par le même PATCH/version. Le composant ne publie ni n'exécute jamais un workflow. #816/#817 sont fusionnés ; **QA navigateur et OWNER_E2E #818 demeurent indispensables avant merge/Production**. Voir [WORKFLOW_VISUAL_EDITOR_ADR.md](WORKFLOW_VISUAL_EDITOR_ADR.md).


#### WF-05 — Conflits sur la sauvegarde du studio

La route PATCH de version attend `editToken` (hash SHA-256 du graphe serveur) et `saveWorkflowVersion` compare le snapshot canonique sous verrou `FOR UPDATE` de `EnterpriseWorkflowVersion` avant toute suppression/recréation d'étapes. Le service conserve l'appel interne sans token pour les templates/fixtures, alors que le PATCH public refuse l'absence de token. Un éditeur périmé reçoit HTTP 409 `WORKFLOW_DRAFT_CONFLICT`; le brouillon local n'est pas écrasé. Cette solution n'ajoute ni seconde table de révision ni migration. Tests : `qa-workflow-818-concurrency.mjs` et `qa-workflow-818-visual-roundtrip.mjs`.


### WF-06A — Planification horaire non activée (#837, parent #819)

Le module `lib/enterprise/workflows/advanced-schedule.ts` propose un calcul strict des occurrences DAILY/WEEKLY en fuseau IANA et des clés SHA-256 tenant/schedule/version/date locale. Politique DST : saut de date quand heure inexistante, premier instant uniquement lors de l'heure répétée, fenêtre de 35 jours. Aucune route, table, worker ni capacité d'exécution est activée dans cette tranche. La garantie transactionnelle d'unicité des occurrences est un prérequis explicite avant activation ; voir [WORKFLOW_ADVANCED_RUNTIME_RFC.md](WORKFLOW_ADVANCED_RUNTIME_RFC.md).


### WF-06B — Conditions composites / projection typée (#839, parent #819)

Le module expérimental `lib/enterprise/workflows/advanced-data.ts` fournit un arbre AND/OR borné et une projection typée de variables sous **double contrôle** : champ déclaré par l'adapter et champ explicitement autorisé pour lecture par le contexte tenant/acteur/module. Les prédicats réutilisent `workflowConditionError` / `evaluateWorkflowCondition` ; toutes les branches sont validées avant court-circuit. Pas de nouvelle route, aucun trigger, aucune variable injectée dans le runtime V1 et aucune migration ; détail de sécurité : [WORKFLOW_TYPED_DATA_RFC.md](WORKFLOW_TYPED_DATA_RFC.md).


### WF-06S1 — Ledger durable d'occurrences (inactif, #841)

Deux nouveaux modèles `EnterpriseWorkflowSchedule` et `EnterpriseWorkflowScheduleOccurrence` portent des contraintes d'intégrité tenant/définition/version et l'unicité des reçus par date/heure locale, en complément de la clé SHA-256 WF-06A. Le service interne `reserveDueStagedWorkflowOccurrence` ne réserve que des horaires STAGED explicitement référencés (statut DISABLED par défaut), sans run, outbox, API ni worker actif : `FOR UPDATE SKIP LOCKED`, transaction unique d'insertion du reçu et progression CAS du curseur. Les droits, quotas, source métier et démarrage d'une exécution sont reportés à WF-06S2 ; voir [WORKFLOW_SCHEDULE_LEDGER_ADR.md](WORKFLOW_SCHEDULE_LEDGER_ADR.md).

La fiche détaillée d'une définition Workflow (#863) est désormais rendue en vue plein écran client via un portail contrôlé, plutôt qu'en colonne intégrée à la liste. Son état est local au workspace, son scroll n'affecte pas le document, le focus retourne au déclencheur, et les sous-dialogues restent régis par la primitive de dialogue standard. Ce changement est purement UI : aucune mutation de données ni nouvelle permission.


## Hotfix #965 — Gouvernance IA centralisée et assistant public multi-modèles (2026-10-30)

La politique `AiPlatformRuntimePolicy` reste l'autorité globale révisionnée; elle inclut désormais un profil `assistantSettings` borné et validé côté serveur (culture générale du chatbot, guidance par surface, modèles publics ordonnés et maximum de lectures Agent). L'API admin `GET/PATCH /api/admin/ai/policy` reste sous `CONSOLE_AI_READ/MANAGE`, same-origin et révision optimiste, avec historique et audit. Le frontend Console affiche des contrôles réels FR/EN; les prochains tours relisent les réglages sans rebuild, mais aucun changement ne peut accorder des permissions, contourner ZDR ou augmenter les plafonds serveur.

Le chatbot et le Mode Agent général utilisent `PERSONAL` (pas de CAG ni RAG d'entreprise). L'assistant entreprise garde le contexte tenant et les contrôles d'accès. L'agent d'analyse de risque limite le nombre de lectures et réserve un tour pour synthétiser les résultats réellement reçus. L'assistant public de landing consomme `listAvailableAiModels` et `createProviderEventStream` avec paramètres `PUBLIC/STARTER`, sélection interne ordonnée et restrictions runtime, sans identité utilisateur fictive ni lecture de ressources privées. Sa qualification de prospect nécessite une confirmation textuelle dans l'échange et une validation Zod, sans assimilation à une preuve d'identité anonyme. Voir `docs/HOTFIX_965_UNIFIED_AI_GOVERNANCE.md`.


## Hotfix RH #1028 — Dossiers, organisation et révisions contractuelles (en validation)

Les dossiers `EnterpriseEmployee` restent canoniques et indépendants de l'identité globale DTSC. Une fiche RH détaillée paginée renvoie les valeurs autorisées de l'employé, l'organisation et les comptes/liens des modules RH, Temps, Paie, Projets et Actifs selon le résolveur d'accès de chaque module. Le montant salarial et les notes RH privées ne sont transmis qu'à un gestionnaire `HUMAN_RESOURCES:manage`. La route de liste conserve la pagination serveur et permet la consultation des dossiers archivés uniquement avec ce droit.

Les commandes `PATCH /api/enterprise/:organizationId/employees/:employeeId`, `DELETE` (archivage), et `POST /employees/:employeeId/restore` vérifient révision, références tenant-scoped, rôles, same-origin, Zod, rate limit et audit minimal. L'édition ne lie pas silencieusement un compte utilisateur. L'archivage est réversible et protège les contrats/validations et subordonnés actifs.

La modification préapprobation d'`EnterpriseEmploymentContract` garde sa garde `revision`, mais écrit maintenant un snapshot immuable `EnterpriseEmploymentContractRevision` dans la même transaction, après update conditionnel. Les contrats actifs restent versionnés séparément via `versionNumber` et `supersedesContractId`. La lecture paginée `GET /employment-contracts/:contractId/revisions` exige `HUMAN_RESOURCES:manage`.

Voir [détail, critères QA et rollback](HOTFIX_1028_RH_DOSSIERS_CONTRACTS_ORGANISATION.md). L'issue #1029 couvrira ensuite l'accès salarié personnel, les PDF de bulletins privés, les pointages serveur et les rapports de travail ; ces fonctionnalités ne sont pas certifiées par #1028.


## Hotfix RH #1029 — self-service salarié paie / temps

L'espace personnel s'appuie sur l'association explicite `EnterpriseEmployee.organizationMemberId` avec un membership DTSC actif. `GET /my-hr` retourne seulement les bulletins `EnterprisePayslip` des runs de paie approuvés du salarié, ses rapports `EnterpriseTimesheet` et ses pointages `EnterpriseWorkClockSession`. Les PDF sont générés côté serveur et auditables, sans présumer d'un décaissement. Les mutations exigent `TIME_ATTENDANCE:submit`, même origine, limitation de fréquence, objet appartenant à l'employé et, pour les rapports, approbateur indépendant. La migration additive `20261105210000_employee_work_clock_sessions` assure une seule session ouverte par salarié au niveau PostgreSQL ; la paie et le calendrier existants ne sont pas dupliqués. Les registres entreprise des cycles de paie, timesheets et présences sont désormais limités selon la permission et/ou l'objet. Documentation et E2E : [HOTFIX_1029_RH_SELF_SERVICE_PAYSLIPS_CLOCK_REPORTS.md](HOTFIX_1029_RH_SELF_SERVICE_PAYSLIPS_CLOCK_REPORTS.md).

La capacité SELF de #1029 se fonde sur le plan et les modules activés, le membership actif et le dossier salarié lié. Elle ne confère jamais les permissions positionnelles `enterprise.payroll.view` ou les lectures RH d'entreprise. `GET /my-hr/approvers` sélectionne des validateurs indépendants ayant `TIME_ATTENDANCE:approve`. Le composant personnel est disponible dans le hub ERP, même quand les modules de gestion RH ne sont pas navigables pour le salarié.


### Hotfix RH #1028 — archive/restauration des contrats (tranche 2)
Les contrats `EnterpriseEmploymentContract` exposent deux mutations contrôlées sur les endpoints `DELETE /api/enterprise/:organizationId/employment-contracts/:contractId` et `POST /api/enterprise/:organizationId/employment-contracts/:contractId/restore`. La mutation est exclusivement logique (`archivedAt`) et atomique avec les approbations à révoquer ; aucun bulletin ou ancien contrat n'est effacé. Le registre standard exclut les archives et `GET /employment-contracts?archived=1` exige `HUMAN_RESOURCES:manage`. Le client affiche bascule courants/archives, actions par objet et états FR/EN. Référence de QA et de recette : `docs/HOTFIX_1028_RH_CONTRACT_ARCHIVE_PHASE2.md`. Les référentiels Organisation restent à livrer séparément.


### RH Design 2.0 — Organisation canonique #1034 (tranche 3, en PR)
- La section RH Organisation ne duplique ni `EnterpriseDepartment` ni `EnterprisePosition`. Elle charge les données administratives uniquement dans le sous-onglet Organisation et seulement après un `canManageOrganization` résolu par `ADMIN_DASHBOARD:manage` côté serveur.
- Les panneaux canoniques `EnterpriseAdministrationDepartmentsPanel` et `EnterprisePositionsGuidedPanel` sont réemployés sans autre route mutante ; sauvegardes suivies d’un rafraîchissement ciblé côté RH, tout en conservant le comportement historique de l’administration.
- Les utilisateurs RH sans gestion de l’administration restent en lecture seule. Les listes personnelles RH ne gagnent aucun droit de lecture de l’annuaire ; les réponses de sélecteurs sont `private, no-store`.
- QA `scripts/qa-hotfix-1034-hr-organization.mjs` et documentation `docs/HOTFIX_1034_RH_ORGANISATION_CANONIQUE.md`. Aucun changement Prisma/env. CI et E2E humain requis avant merge.

### Retail #1042 — frontières multi-boutiques de la tranche 14 (PR #1043 en brouillon)

Les anciennes routes `GET /warehouses`, `/storage-locations`, `/retail/sales`, `/retail/returns`, `/retail/sales/:saleId/returns`, `/retail/refund-accounts` et `/retail/sales/:saleId/receipt` appliquent des filtres serveur sur les boutiques affectées, lorsque `siteStaffIsolationEnabled` est activé. Les compteurs et métriques utilisent les mêmes restrictions. `MANAGE_STOCK` est vérifié dans les transactions des services de dépôts/emplacements, réservations et réceptions. Les retours POS exigent `VIEW_SALES` pour créer, `COLLECT_PAYMENT` pour décider et `MANAGE_STOCK` en cas de remise en stock ; le remboursement financier ne peut utiliser un compte d'une autre boutique. L'accès métier général du module et son audit restent obligatoires. Le rejeu d'une clé d'idempotence n'autorise ni l'accès à une autre boutique ni le recyclage d'une clé pour un autre objet.

Les flags `siteStaffIsolationEnabled` et `invoiceCheckoutEnabled` sont toujours OFF et sans commutateur client. La validation des transactions concurrentes sur vrai PostgreSQL et les tests authentifiés multi-boutiques/mobile restent obligatoires. La tranche 14 ne constitue pas une implémentation des avoirs et remboursements sur la nouvelle source de factures Finance Retail. Voir `HOTFIX_1042_RETAIL_CONFIGURABLE_MULTISTORE.md` pour la recette et le rollback.

**Complément tranche 15 (PR #1043, pré-release)** : la préparation de facture Retail ne retourne jamais un document idempotent avant vérification serveur du droit `PREPARE_INVOICE` sur la boutique d'origine, avec affectation active exigée y compris après révocation. Les conflits transactionnels `P2034` sont repris de manière bornée autour de la transaction sérialisable ; le rejeu n'émet pas une deuxième facture Finance. Contrats simulés ajoutés ; PostgreSQL concurrent réel, avoirs et remboursement des factures Finance restent non certifiés. Flags OFF, aucune fusion/Production sans OWNER_E2E.

**Complément Retail #1042 tranche 16 (PR #1043, pré-release)** : `proposeRetailInvoicePayment` encapsule sa transaction sérialisable Finance/Retail dans `withRetailTransactionRetry` pour reprendre jusqu'à trois conflits `P2034`. Les droits `COLLECT_PAYMENT`, les affectations, les comptes/sessions de caisse, le reliquat et l'idempotence sont revérifiés dans chaque nouvelle transaction. La QA dédiée simule les retries et leur épuisement, sans démontrer encore la concurrence PostgreSQL réelle. Les remboursements de facture Finance, le rapport par site, les tests multi-rôles et la recette OWNER_E2E restent à livrer ; pas d'activation des flags ni de fusion.


**Complément Retail #1042 tranche 17 (pré-release)** : Finance rejette `EnterpriseSalesCreditNote` sur une facture possédant `EnterpriseRetailInvoiceCheckout`, via `RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED`, dans création, preflight et posting (service + orchestration). Tant que les mouvements compensatoires, l'avoir et le remboursement ne sont pas liés transactionnellement et validés par des acteurs distincts, un avoir Finance direct pourrait laisser une réservation de stock orpheline. Ce garde n'est pas un parcours de retour fonctionnel ; interdiction de lever les flags. La QA simule le refus et le maintien du chemin Finance non Retail.

**Complément Retail #1042 tranche 18 (PR #1043, pré-release)** : la Quality Gate fournit un PostgreSQL `pgvector/pgvector:pg16` jetable et exécute `qa-hotfix-1042-retail-postgres-serialization.mjs` après migrations. Cette QA démontre la sémantique du retry transactionnel sous un conflit PostgreSQL SERIALIZABLE réel, mais ne couvre pas encore les transactions métier concurrentes ni les retours, remboursements et validations multi-rôles. Le script refuse les environnements hors base éphémère `dtsc_quality_test` et nettoie sa table d'essai.

**Complément Retail #1042 tranche 19 (pré-release)** : `GET /retail/site-overview` conserve sa restriction propriétaire/admin et ajoute `financeInvoices` avec agrégation SQL par `EnterpriseRetailInvoiceCheckout.siteId` et `EnterpriseSalesInvoice.currencyCode` sur la date d'émission. Les champs `issuedTotal`, `allocatedToDate` et `outstandingToDate` ne sont pas des encaissements de période ni une marge comptable ; la vue Design 2.0 FR/EN les affiche séparément des tickets POS. Les exports et le résultat net par site doivent s'appuyer sur les écritures POSTED avec dimensions et historique FX, non sur cette vue opérationnelle.

**Complément Retail #1042 tranche 39 (pré-release)** : lorsque `siteStaffIsolationEnabled` est actif, les routes ERP historiques `GET /sites`, `/warehouses`, `/storage-locations`, `/stock-movements` n'exposent que les ressources des boutiques affectées, avec métriques également filtrées. Les mutations de sites sont interdites au personnel isolé, même s'il détient des droits généraux `SITES_WAREHOUSES`. Pour `POST/PATCH /warehouses`, `POST/PATCH /storage-locations` et `POST /stock-movements`, un collaborateur doit disposer simultanément du droit du module ERP et de `MANAGE_STOCK` sur la boutique cible. `POST /stock-transfers` contrôle le site source ; la décision exige `AUTHORIZE_TRANSFER` sur la source, et la réception `MANAGE_STOCK` sur la destination. Les administrateurs/propriétaires et les entreprises dont le flag reste OFF conservent leur parcours existant. Les rejets utilisent `RETAIL_SITE_ACCESS_DENIED` (HTTP 403), sans fuite d'identité d'un site distant. Le test navigateur en PostgreSQL utilise deux boutiques et un manager B doté de permissions ERP générales pour détecter un contournement. **Ne pas déployer ni activer les flags avant la recette propriétaire**.

**Complément Retail #1042 tranche 40 (pré-release)** : `POST /inventory-counts`, `POST /stock-adjustments` et les deux endpoints `/decision` passent par `requireRetailWarehouseCapability`. La résolution du dépôt impose l'appartenance à l'entreprise et, avec le flag d'isolation actif, un `MANAGE_STOCK` explicite pour la boutique concernée. Les décisions continuent d'exiger la capacité `manage` ERP et les contraintes d'approbation indépendante des services d'inventaire. Aucun changement fonctionnel pour les entreprises dont le flag demeure OFF, aucun contournement autorisé avant l'E2E propriétaire.

**Complément Retail #1042 tranche 42 (pré-release)** : dans `trialBalance`, l'agrégation des lignes comptables s'effectue désormais depuis une sous-requête limitée par jointure interne aux pièces `POSTED/REVERSED` et à `accountingDate` dans la période. La requête historique filtrait la seconde jointure externe seulement, mais conservait les lignes `DRAFT` dans `SUM(l.debit/credit)` ; ce défaut impactait la balance et les états de résultat/ bilan dérivés. Aucun historique n'est modifié, seul le calcul des états est rectifié. La certification du résultat net Retail par site exigera toujours un plan de rapprochement des lignes sans `siteId` et des exports explicites, sans interpolation de coûts.

**Complément Retail #1042 tranche 44 (pré-release)** : les constructeurs canoniques de posting conservent désormais le `siteId` authentique sur chaque ligne de vente Finance associée à un `EnterpriseRetailInvoiceCheckout`, d'avoir associé, de coût d'inventaire/reversement issu du dépôt du mouvement et de dépense liée à un site. Les factures Finance sans checkout restent sans dimension de boutique plutôt que d'être imputées artificiellement. Le navigateur PostgreSQL vérifie la boutique des lignes de vente/COGS `POSTED`. Les anciennes écritures sans dimension ne sont **pas** réécrites, et un rapport Retail ne peut pas revendiquer un résultat net certifié avant reconciliation des dimensions, taxes/FX et exports.

**Complément Retail #1042 tranche 20 (PR #1043, pré-release)** : les deux méthodes canoniques d'inversion des allocations Finance refusent désormais, lorsqu'une facture possède un `EnterpriseRetailInvoiceCheckout`, un remboursement absent, issu d'un autre client ou d'une autre devise, ou débité d'un compte actif non attribué à la boutique émettrice. Le contrôle transactionnel est également appliqué à la confirmation de trésorerie sur l'ID de facture conservé dans l'événement `REFUND_FINANCIAL_INVERSE_READY`. Les factures Finance non Retail restent inchangées. Erreurs typées `RETAIL_INVOICE_REFUND_PAYMENT_REQUIRED`, `RETAIL_INVOICE_REFUND_CUSTOMER_CURRENCY_MISMATCH` et `RETAIL_INVOICE_REFUND_ACCOUNT_SITE_MISMATCH` (HTTP 409, message métier). Contrat `scripts/qa-hotfix-1042-retail-invoice-refund-scope.mjs` branché aux Quality Gates, sans migration ni activation des flags. Il reste à développer le parcours Retail complet de retour par ligne, inspection/stock, approbation Finance et avoir, avec E2E PostgreSQL réel avant OWNER_E2E.


**Complément Retail #1042 tranche 20 (pré-release)** : `retailFinanceReadSiteScope` restreint la lecture Finance à une liste de sites lorsqu'un utilisateur est affecté comme collaborateur Retail et que l'isolation de site est active ; les affectations révoquées ne donnent pas accès aux autres boutiques. `GET /sales-invoices` filtre la relation 1:1 `retailCheckout` ; `GET /payments` filtre les comptes du site, les propositions liées au checkout et tous les agrégats. Finance-only conserve sa portée Finance originale, tandis qu'aucun droit Finance supplémentaire n'est concédé aux facturiers/caissiers. Cette tranche ne certifie ni les écritures, ni l'export, ni le circuit de retour Finance.


**Complément Retail #1042 tranche 21 (pré-release)** : `GET /receivables` utilise `retailFinanceReadSiteScope(..., VIEW_SALES)` pour filtrer les créances Finance adossées aux factures `EnterpriseRetailInvoiceCheckout` dans le listing et les agrégats `openByCurrency`/`overdueByCurrency`, avant pagination. Les autres créances restent soumises aux autorisations Finance préexistantes. Ce correctif ne constitue pas une revue complète des vues Finance ni des exports.

**Complément Retail #1042 tranche 22 (travail local non publié)** : les retours idempotents et confirmations de remboursement liés à `EnterpriseRetailInvoiceCheckout` vérifient désormais le périmètre de l'acteur Finance par `retailFinanceReadSiteScope(..., COLLECT_PAYMENT)` sous transaction. Un opérateur affecté à une boutique ne peut pas agir pour une autre, et une affectation révoquée ne redonne pas la portée globale ; les Finance-only sans affectation Retail conservent leur RBAC Finance. La QA négative couvre aussi le rejeu d'une confirmation déjà enregistrée. Ce garde ne constitue pas un circuit métier complet de retour/stock/avoir. La matrice `RETAIL_1042_CAHIER_ACCEPTANCE_MATRIX.md` reprend le cahier original de 22 pages, les 20 RG et huit décisions ; elle reste à certifier par E2E techniques et propriétaire.


**Retail #1042 tranche 23, sécurité des remboursements (candidat, PR brouillon)** : les helpers Finance de préparation d'avoir partiel/exact et de préparation de la contrepartie de remboursement appliquent le garde `EnterpriseRetailInvoiceCheckout` avec l'erreur 409 `RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED`, avant le retour idempotent. Un dossier Retail sans preuve canonique de retour + reprise de stock ne peut donc plus utiliser indirectement les circuits Pharmacy/Gaming pour émettre un avoir. Les dossiers Finance non Retail restent inchangés. QA `qa-hotfix-1042-retail-refund-credit-bypass.mjs` câblée à Quality Gates ; recette PostgreSQL multi-acteurs, workflow de retour, comptabilité et restauration en attente, flags OFF.


**Retail #1042 tranche 24, caisse multi-sites (PR brouillon)** : `openCashSession` vérifie que la boutique de la session provient du compte Finance, rejette les `siteId` contradictoires et applique `retailFinanceReadSiteScope(..., CLOSE_CASH)` à chaque ouverture quand le cloisonnement Retail est actif. Les listes de sessions Finance et Retail filtrent `siteId` côté SQL/Prisma ; les clôtures Retail revalident comptes et sites, y compris au rejeu idempotent et lors de la décision. Les comptes Finance-only et propriétaires gardent le RBAC Finance canonique. Les clôtures inter-boutiques et les sessions historiques sans site ne sont pas automatiquement corrigées : exigence de réconciliation documentée et de recette propriétaire. QA `scripts/qa-hotfix-1042-retail-cash-site.mjs` et Quality Gates ; pas de cutover Production.


**Retail #1042 tranche 25, demandes de retour sur factures (PR brouillon)** : extension du checkout de la facture unique Finance par un registre de demandes `EnterpriseRetailInvoiceReturnRequest` et ses lignes, avec FKs composites `(organizationId, checkoutId, checkoutLineId)`, montants `Decimal`, garde des quantités encore retournables, idempotence et transactions SERIALIZABLE. Les droits `REQUEST_INVOICE_RETURN` / `APPROVE_INVOICE_RETURN` sont personnalisables par boutique et aucun rôle non propriétaire ne les reçoit par défaut ; validation indépendante `FINANCE_RECEIVABLES:approve` obligatoire. Les API de liste/création/décision sont bornées, auditables et protégées. Cette tranche ne poste ni avoir, ni mouvement de stock, ni sortie de fonds : la réconciliation atomique reste à développer et l'E2E propriétaire n'est pas autorisé sur la base de cette seule tranche.

**Retail #1042 tranche 26, inspection séparée avant validation Finance (PR brouillon)** : `EnterpriseRetailInvoiceReturnRequest` conserve une preuve de réception/inspection (`inspectedByUserId`, date, notes), sans créer de mouvement de stock. Nouveau `POST .../returns/:requestId/inspection` avec révision, `receivedAndInspected`, notes, capacité `MANAGE_STOCK` du site et identité distincte du demandeur et de l'approbateur. Une approbation Finance n'est possible qu'après `INSPECTED` avec preuve valide, tandis qu'un rejet motivé peut stopper une demande non inspectée. Les retours inspectés réservent encore leurs quantités ; le nouveau statut conserve l'idempotence/transaction SERIALIZABLE. Migration additive et QA contractuelle, sans test E2E connecté ni changement de flags. Le règlement stock + avoir + remboursement via moteurs canoniques reste bloquant.

**Retail #1042 tranche 27, interface de retour (candidat)** : dialogue Design 2.0 responsive et localisé FR/EN dans le registre des factures Retail délivrées. Création détaillée depuis les lignes de la facture, quantités revérifiées par Finance au serveur, disposition du stock, motif obligatoire et choix d'un approbateur indépendant ; historique paginé des demandes et actions d'inspection/approbation/rejet visibles seulement pour les acteurs autorisés. Nouveau `GET /retail/invoices/return-approval-candidates?siteId=...` : session + module Retail POS + boutique active + `REQUEST_INVOICE_RETURN`, réponse privée `candidates` réduite aux membres d'entreprise actifs, différents du demandeur, avec `APPROVE_INVOICE_RETURN` boutique **et** `FINANCE_RECEIVABLES:approve` ; 400 site absent, 403 accès absent/flag désactivé, réponse sans cache. `GET .../returns` garde `VIEW_SALES`, pagination 25, et renvoie `canRequest`, `canInspect`, `canDecide` sans secrets d'idempotence ; `POST .../returns` exige lignes, motif, approbateur, clé stable ; inspection (`receivedAndInspected`, notes et revision) et décision (`revision`, décision et motif de refus obligatoire) conservent le serveur comme autorité. `APPROVED` signifie **demande approuvée sans avoir, stock ni remboursement** ; aucune permission ni migration implicite, flags OFF et toujours pas d'E2E métier final.

**Retail #1042 tranche 28, précision préalable au settlement (candidat)** : les quantités retournées sont strictement supérieures à zéro (contrat Zod et transaction Prisma `greaterThan(0)` ; `isPositive()` de Decimal peut inclure zéro). Les lignes remboursables sont réservées à deux décimales, compatibles avec `money()` du moteur commun des remboursements Finance. Calcul proportionnel en précision six décimales puis arrondi financier ; le dernier retour reprend le reliquat exact pour éviter les écarts de centimes. Une ligne historique non représentable à deux décimales ou un montant inférieur à la plus petite unité monétaire Finance est bloqué explicitement, sans backfill, décaissement ni mouvement de stock. Contrats couvrant 100,00 en trois fractions 33,33/33,33/33,34, les quantités nulles et les exceptions de précision. Les flags restent OFF : l'orchestration d'avoir, d'inversion d'allocations, de stock et de paiement reste à livrer et à certifier sur PostgreSQL réel.

**Retail #1042 tranche 29, préflight transactionnel Finance/Inventory (candidat)** : `lib/enterprise/retail/invoice-return-settlement-preflight.ts` expose uniquement `assertRetailInvoiceReturnSettlementReadinessTx(tx, organizationId, invoiceId, requestId)` aux futurs services serveur, sans API publique ni effet d'écriture. Contrôles : demande approuvée après inspection avec trois acteurs distincts, facture et créance Finance canoniques, montant et lignes strictement positifs et au centime exact, paiements sources actuellement confirmés/rapprochés et affectés au bon client/devise/tenant, origine des sorties physiques par facture, ligne, dépôt, article et lot, moins les quantités des retours déjà complétés. Une anomalie lève une erreur métier avant toute préparation. L'appelant doit rester authentifié, autorisé et revalider le préflight dans sa transaction verrouillée au moment du settlement ; cet outil n'est ni une autorisation de remboursement ni une mise en réserve de fonds. QA `qa-hotfix-1042-retail-return-settlement-preflight.mjs` sur Quality Gates ; pas de nouvelles écritures, de migrations ou de changement des flags. L'orchestration Finance/Inventory de liquidation reste P0.

**Retail #1042 tranche 30, invariants Decimal stricts sur Finance/Retail (candidat)** : `Prisma.Decimal.isPositive()` inclut zéro, donc ne doit pas servir à rejeter zéro ni à déclencher une écriture positive. Conversion explicite des gardes de Finance commun (paiements, remboursements, créances/dettes, journaux, soldes d'ouverture, immobilisations, trésorerie, financement, valorisation stock) et des services Retail/Inventaire concernés en `greaterThan(0)`. Le cas d'ouverture comptable unilatérale revient au comportement prévu, et les sorties de stock/réservations/fidélité/retours zéro sont ignorées ou refusées. Contrat `qa-hotfix-1042-finance-strict-positive.mjs` branché à Quality Gates : sémantique Decimal, vrais zéros, 0/100, 100/0 et refus 0/0. Aucun backfill des écritures historiques ni changement des politiques d'approbation, du flag ou du déploiement. Les flux sectoriels non Retail conservent leur QA dédiée et ne sont pas déclarés certifiés par ce seul garde.

**Retail #1042 tranche 31, provenance de stock des retours (candidat)** : une quantité retournée d'article inventorié est validée à trois décimales au plus en UI FR/EN et serveur avant création de la demande, conformément au type `Decimal(18,3)` de `EnterpriseStockMovement` ; les lignes sans inventaire conservent la précision de la facture. Le préflight `assertRetailInvoiceReturnSettlementReadinessTx` exige la somme des sorties originales égale à la ligne facturée et construit, sans écrire en base, un `stockSourcePlan` déterministe après déduction des quantités des demandes `COMPLETED`, par mouvement/lot/dépôt/emplacement et disposition. Il interdit ainsi de préparer un retour sur un double débit de stock ou une fraction physiquement irréalisable. Le plan doit être recalculé **dans la future transaction SERIALIZABLE de remboursement et de stock** ; aucun règlement ni E2E authentifié n'en résulte.

**Retail #1042 tranche 32, ventilation Finance des sources d'un retour (candidat)** : le même préflight produit un `financeSourcePlan` pour décomposer le montant à rembourser sur les affectations `CONFIRMED` d'origine, sélectionnées après contrôle du tiers, de la devise, du compte de la boutique, du sens et du statut du paiement. L'ordre `allocatedAt/id` garantit une répartition déterministe ; les allocations à plus de deux décimales sont refusées avant toute inversion. Sur le plan Inventaire, tous les mouvements d'origine d'une même ligne doivent provenir du même dépôt/article/lot que la facture Retail : un débit surnuméraire dans un dépôt inattendu invalide également le préflight. Les deux plans restent de **simples données de vérification sans écriture** ; seul le futur exécuteur atomique dans un contexte autorisé pourra les consommer.

**Retail #1042 tranche 33, composition transactionnelle des écritures Finance (candidat)** : `customer-refund-service.ts` conserve ses contrats historiques `reverseCustomerPaymentAllocationsForRefundAmount` et `confirmCustomerRefundPayment` comme wrappers de `prisma.$transaction(..., SERIALIZABLE)` ; leurs implémentations effectives sont accessibles via `reverseCustomerPaymentAllocationsForRefundAmountTx(tx, ...)` et `confirmCustomerRefundPaymentTx(tx, ...)`. Ces variantes conservent directement les gardes Finance de client/devise/compte/site, les inversions d'allocations et de journaux POSTED, la trésorerie/caisse et la consommation de la disponibilité de remboursement dans **le `tx` fourni**, sans transaction imbriquée. Elles ne créent pas elles-mêmes la preuve d'approbation, l'avoir ni les mouvements de retour. Il faut les composer avec les autres écritures dans un orchestrateur autorisé avant de déclarer un règlement Retail réalisé ; QA de composition et tests multi-acteurs PostgreSQL encore requis.

**Retail #1042 tranche 34, liquidation atomique des retours de facture (candidat, non certifié E2E)** : migration additive `20261107200000_retail_invoice_return_finance_binding`, colonnes FK tenant-aware de remboursement et d'avoir, ventilation HT/taxes des lignes et statuts `FINANCE_PENDING`/`COMPLETED` contrôlés. `prepareRetailInvoiceReturnFinance` prépare une paire canonique paiement sortant REFUND + avoir et leurs deux approbations Finance attribuées, sous une même transaction SERIALIZABLE ; aucun mouvement physique/comptable avant approbation indépendante. `settleRetailInvoiceReturnFinance` exige les deux validations et un liquidateur indépendant, vérifie de nouveau le plan Finance et Inventory, puis compose dans **un seul `tx`** l'inversion bornée des seules allocations originales du bon compte/site, le posting de l'avoir, les balances Finance, l'inverse prêt, le remboursement et la trésorerie, ainsi que les `RETURN_IN`/valorisations des seuls articles `RESTOCK`. `QUARANTINE`/`DISPOSE` restent hors du stock vendable. Les raccourcis Finance historiques contournant le retour sont refusés. `createRetailInvoiceReturnRequest` permet des retours ultérieurs d'une facture `CREDIT_NOTE` seulement si le solde est nul et le total payé + crédité correspond au montant initial. UI FR/EN de suivi des deux validations et de liquidation. Tests de contrats et type-check locaux, migration/QA PostgreSQL GitHub et E2E humain **encore à certifier** ; les deux flags Retail restent désactivés.

**Coût de sortie source des retours #1042** : `postPaidRetailInvoiceStockTx` appelle `valueRetailInvoiceFulfillmentIssueTx` pour chaque mouvement `SALE_FULFILLMENT` de source `EnterpriseSalesInvoice`, après mouvement physique et avant marquage de livraison, dans la transaction SERIALIZABLE de la dernière allocation Finance. L'adaptateur valide la source et sélectionne la devise de la couche de coût, puis comptabilise `ISSUE/POSTED` via `valueInventoryIssueTx`. Les retours `RESTOCK` référencent cet événement et ne créent jamais de coût fictif pour les anciennes sorties non valorisées. Un échec de couche, de configuration ou de journal annule l'allocation finale et le stock issu.

# Hotfix RETAIL multiboutique — onboarding et boutiques affectées (novembre 2026)

Les cartes `Configurer mes boutiques` et `Mes boutiques` dans `RETAIL_POS` utilisent la projection canonique `lib/enterprise/retail/multi-store-onboarding.ts` et la vue serveur `retail-multi-store-onboarding.tsx`. Chaque boutique suit ses entrepôts, sa caisse dans la devise de base, ses capacités de vente/facturation/encaissement et l'isolation active, avec liens vers les modules ERP sans duplication de tables. La vue du collaborateur ne liste que les affectations actives du compte connecté ; `siteId` est un choix d'interface qui ne contourne jamais la sélection filtrée côté serveur. Voir `docs/HOTFIX_RETAIL_MULTISTORE_ONBOARDING.md` et le test `scripts/qa-retail-multistore-onboarding.mjs`.

## Retail 1.6.0 — parcours multiboutique opérationnel guidé (hotfix)

L'assistant `RetailGuidedStoreSetup` crée `EnterpriseSite`, `EnterpriseWarehouse` et `EnterpriseFinancialAccount` par les routes métier canoniques et oriente vers les affectations, stocks, comptabilité et activation MFA existants. `getRetailMultiStoreOnboarding` projette huit critères indépendants par site (dont Finance/posting, catalogue et lignes de stock disponibles) sans stocker de statut concurrent ; les sites `STORE` sont prioritaires sur le siège, avec fallback legacy sans `STORE` cohérent dans le préflight `feature-activation`. `RetailMyStores` résout exclusivement les affectations actives et ne révèle les noms des caisses qu'aux collaborateurs habilités. La clôture multiboutique dispose de `GET .../retail/daily-close/summary?date=YYYY-MM-DD` : propriétaire/admin d'entreprise et module RETAIL_DAILY_CLOSE requis, consolidation SQL des compteurs de clôtures et lignes avec écart, par site/statut/date, filtrée par tenant et sans addition multidevise. Les créations de clôture transmettent explicitement le site et refusent les comptes de plusieurs boutiques, avec compatibilité signalée pour les anciennes caisses sans site et isolation OFF ; les listes filtrées restent assujetties à `retailFinanceReadSiteScope`. Contrat, données de test et script E2E : `docs/HOTFIX_RETAIL_GUIDED_MULTISTORE_2026.md`. Pas de nouveau modèle financier, pas de nouvelle migration, pas de contournement des contrôles Finance ni de fusion sans validation E2E du propriétaire.
