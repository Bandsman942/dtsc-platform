# Hotfix #576 — Ventes & créances, Achats & dettes et Paiements

Date : 2026-09-05

Issue : #576

Branche : `fix/576-finance-receivables-payables-payments`

Baseline : `main@929dfc701196d98e35a5bdbc7983907c28d9b919`

## Objectif

Remettre `FINANCE_RECEIVABLES`, `FINANCE_PAYABLES` et `FINANCE_PAYMENTS` au même niveau de cohérence métier, sécurité, UX, pagination, validation et intégration cross-module que les modules ERP communs récemment stabilisés, sans créer de seconde source de vérité financière et sans migration Prisma.

## Diagnostic confirmé

### Listes, filtres, KPI et échéanciers

- plusieurs KPI étaient dérivés de `collection.items`, donc uniquement de la page courante ;
- les vues `overdue`, `ageing`, `inbound`, `outbound` et `unallocated` appliquaient une partie de leur logique après pagination côté navigateur ;
- l’échéancier clients/fournisseurs pouvait donc être incomplet et produire des pages vides ou des compteurs trompeurs ;
- les agrégats monétaires devaient rester séparés par devise et ne jamais additionner USD, CDF ou EUR dans un même montant ;
- les deep links facturaient implicitement la présence de l’objet dans la page déjà chargée.

### Achats & dettes

- la file `to-approve` masquait la phase `PENDING_REVIEW` alors que le workflow fournisseur distingue revue puis approbation ;
- `EnterpriseSupplier` et `EnterpriseBusinessParty` pouvaient diverger sur d’anciennes dettes, rendant les allocations fournisseur ambiguës ;
- certaines références de facture fournisseur (achat, réception, projet, actif) étaient persistables sans revalidation suffisamment explicite dans le même tenant ;
- les relations Dépense/Actif prises en charge par le backend n’étaient plus correctement exposées dans le formulaire stabilisé.

### Ventes & créances

- commande, livraison, contrat et projet de facturation devaient être revalidés explicitement avant persistance ;
- les références de lignes Catalogue existaient dans le modèle mais n’étaient plus correctement exploitables dans le nouveau formulaire ;
- un avoir pouvait rester approuvé pendant qu’un paiement ou un autre avoir réduisait le solde ouvert, puis tenter de produire un solde négatif au moment du posting.

### Paiements

- plusieurs référentiels nécessaires au formulaire étaient chargés avec des plafonds fixes ;
- un paiement de paie devait référencer un `EnterprisePayrollRun` approuvé et non une simple période de paie ;
- le vocabulaire UI mélangeait parfois annulation métier et rejet d’une validation ;
- l’allocation doit rester bornée par organisation, sens, type de paiement, tiers, devise, paiement non affecté et solde ouvert.

### Validation, collaboration, abonnement et IA

- certaines actions visibles étaient encore trop dépendantes du statut ou d’un rôle large, au lieu de l’affectation réelle `EnterpriseApproval` ;
- Documents/commentaires utilisaient un type d’entité dérivé du module parent et non toujours l’objet réellement ouvert ;
- `FINANCE_RECEIVABLES`, `FINANCE_PAYABLES` et `FINANCE_PAYMENTS` doivent rester BUSINESS/Croissance+ selon le registre canonique ;
- les outils IA `FINANCE_RECEIVABLES_READ`, `FINANCE_PAYABLES_READ` et `FINANCE_PAYMENTS_READ` doivent réutiliser les mêmes gates module/entitlement/membership/permission et lire les mêmes tables canoniques que l’interface.

## Corrections

### Filtres, pagination, KPI et multi-devises

- `overdue`, buckets d’ageing, inbound/outbound, unallocated et files de validation sont filtrés côté serveur avant pagination ;
- les deep links utilisent `recordId` côté API et résolvent un objet autorisé indépendamment de la page courante ;
- les métriques monétaires sont groupées par `currencyCode` ;
- l’ageing utilise une frontière UTC déterministe et les buckets `TO_DUE`, `D1_30`, `D31_60`, `D61_90`, `D90_PLUS` ;
- les résumés des trois modules sont calculés côté serveur sur la population autorisée et non sur la page client.

### Références recherchées et revalidation serveur

- ajout de `finance/reference-options` pour rechercher à la demande, par fenêtres de 30 résultats, les clients, fournisseurs, commandes, livraisons, contrats, achats, réceptions, projets, dépenses, actifs, catalogue, comptes financiers, paies approuvées, employés et comptes de charges ;
- `FinanceReferenceSelect` réutilise ce contrat avec recherche débouncée et filtrage parent ;
- les formulaires factures/paiements n’utilisent plus les caches globaux tronqués pour leurs références critiques ;
- chaque ID reçu reste rechargé et revalidé côté serveur dans le même `organizationId` ;
- les contraintes de tiers, fournisseur, commande, livraison, contrat, achat, réception, projet, actif et devise sont réappliquées avant création.

### Ventes & créances

- les lignes de facture peuvent référencer le Catalogue canonique ;
- commande, livraison, contrat et projet sont validés explicitement avant persistance ;
- les avoirs clients exposent des capacités de workflow affectées et leur posting exécute un préflight sérialisable du solde ouvert ;
- un avoir ne peut plus être posté lorsque son montant dépasse le solde disponible au moment du préflight.

### Achats & dettes

- `to-approve` couvre `PENDING_REVIEW` et `PENDING_APPROVAL` selon l’étape réelle ;
- les capacités `canReview`, `canApprove`, `canReject`, `canPost` sont dérivées des permissions effectives et de l’affectation `EnterpriseApproval` ;
- `EnterpriseSupplierPartyLink` est la relation canonique de convergence fournisseur/tiers ;
- une facture/dette historique sans `businessPartyId` peut être réparée tenant-scoped juste avant posting/allocation ;
- Dépense approuvée, Actif, Projet, Achat et Réception sont réexposés comme sources explicites et revalidées ;
- les avoirs fournisseurs bénéficient de la même protection de solde avant posting.

### Paiements

- compte financier, client/fournisseur, collaborateur et paie sont sélectionnés par recherche serveur ;
- les paiements de paie référencent les `EnterprisePayrollRun` `APPROVED`, respectent la devise de la paie et ne peuvent dépasser le net restant ;
- `CANCEL` reste une annulation métier et n’est plus présenté comme un rejet ;
- les allocations utilisent un sélecteur de solde canonique recherché et restent vérifiées côté serveur par tiers/devise/sens/type/montants ;
- les actions sensibles visibles sont dérivées des capacités serveur par objet.

### Documents et commentaires

- la collaboration détermine le type d’entité réellement ouvert : facture, créance, dette, avoir ou paiement ;
- les pièces et commentaires ne sont plus artificiellement rattachés à la facture parente lorsqu’un autre objet canonique est consulté.

### Abonnement et Assistant IA

- le registre canonique reste l’autorité des dépendances et du niveau BUSINESS des trois modules ;
- aucune permission Finance n’est élargie par un rôle global ;
- `FINANCE_RECEIVABLES_READ`, `FINANCE_PAYABLES_READ` et `FINANCE_PAYMENTS_READ` exigent leur module correspondant ;
- l’autorisation Tool Gateway combine l’accès IA effectif et `resolveEnterpriseModuleAccess` ;
- les exécuteurs Finance lisent `EnterpriseReceivable`, `EnterprisePayable` et `EnterprisePayment` avec leurs dimensions de devise, sans calcul de solde parallèle ni Prisma dynamique exposé.

## Sécurité

Les corrections conservent ou renforcent :

- session et membership actifs ;
- abonnement/module/entitlement via le registre canonique ;
- permission par action ;
- approbateur réellement affecté ;
- isolation `organizationId` ;
- revalidation des références client ;
- same-origin sur les mutations ;
- validation Zod ;
- `await rateLimit` ;
- transactions sérialisables pour les mutations sensibles ;
- `ApiLog` / `AuditLog` ;
- séparation des rôles entre création, approbation, confirmation, allocation, rapprochement et reverse.

## Prisma / migrations

Aucune modification de schéma Prisma et aucune migration ajoutée.

La convergence fournisseur/tiers utilise le modèle existant `EnterpriseSupplierPartyLink` et ne crée aucune seconde identité fournisseur.

## QA permanente

Le hotfix ajoute ou renforce :

- `scripts/qa-hotfix-576-finance-receivables-payables-payments.mjs` pour le contrat statique fonctionnel/sécurité/IA ;
- `scripts/qa-hotfix-576-finance-owner-e2e-contract.mjs` pour protéger l’existence et la portée du OWNER_E2E ;
- `tests/e2e/hotfix-576-finance-owner.spec.mjs` pour l’acceptation authentifiée réelle des trois modules ;
- l’import des deux contrats #576 depuis `scripts/qa-regression-checks.mjs`, lui-même inclus dans `qa:regression` ;
- le job navigateur manuel de `.github/workflows/quality-gates.yml`, qui exécute le OWNER_E2E #576 après la suite ERP existante et le OWNER_E2E #574.

Le OWNER_E2E #576 couvre notamment :

- `FINANCE_RECEIVABLES` overdue + métrique USD + deep link facture ;
- `FINANCE_PAYABLES` file `PENDING_REVIEW` affectée + overdue + métrique USD ;
- `FINANCE_PAYMENTS` unallocated + métrique USD + deep link paiement ;
- convergence recherchée `EnterpriseSupplier` → `EnterpriseBusinessParty` ;
- viewport mobile 390 px, absence d’exception client et absence de débordement horizontal.

## Dette de contribution

- Dette créée : aucune dette de schéma ou seconde source de vérité visée.
- Dette remboursée : KPI/page partiels, filtres post-pagination, ageing partiel, deep links page-bound, lookups tronqués, actions UI trop larges, ambiguity fournisseur/tiers, références cross-module insuffisamment revalidées et rattachement Documents/commentaires par module plutôt que par objet.
- Dette maintenue : le moteur historique comptabilise l’écriture d’un avoir puis applique le sous-ledger dans une transaction distincte. Un préflight sérialisable du solde est maintenant exécuté juste avant le posting, mais ce hotfix ne revendique pas une atomicité globale que le moteur de posting ne fournit pas encore nativement.
- Dette reportée : aucune nouvelle fonctionnalité hors scope n’est stockée « pour plus tard ». Toute nécessité de refactor transversal d’atomicité sera décidée sur preuve séparée si elle devient matériellement bloquante.

## Validation attendue avant merge

Les preuves doivent être obtenues sur le SHA final :

- `git diff --check` ;
- `pnpm prisma:generate` ;
- migrations appliquées depuis une base propre ;
- `pnpm type-check` ;
- QA #576 ciblée ;
- `pnpm qa:regression` / runner CI canonique ;
- `pnpm lint` ;
- `pnpm build` ;
- OWNER_E2E dédié pour `FINANCE_RECEIVABLES`, `FINANCE_PAYABLES` et `FINANCE_PAYMENTS`.

Aucune réussite n’est déclarée avant preuve réelle CI/OWNER_E2E.

## Politique Vercel

Aucun Preview Vercel n’est requis ni autorisé pour la branche ou la PR. Production reste exclusivement issue du commit fusionné sur `main` après Quality Gates, revue et OWNER_E2E conformes.
