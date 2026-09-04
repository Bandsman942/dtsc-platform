# Hotfix #574 — Finances et budgets, Vue d’ensemble financière et Rapports

Date : 2026-09-04

Issue : #574

Branche : `fix/574-finance-budgets-overview-reports`

Baseline : `main@47ca268c6e6d32fa7d46bb9022a15fa1a6dd6e26`

## Objectif

Remettre `FINANCE_BUDGETS`, `FINANCE_OVERVIEW` et `REPORTS` au même niveau de cohérence métier, sécurité, UX et intégration que les modules ERP communs récemment stabilisés, sans créer de seconde source de vérité financière et sans migration Prisma.

## Diagnostic confirmé

### Finances et budgets

- les formulaires historiques n’utilisaient pas systématiquement le contrat `presentation="editor"` et mélangeaient parfois succès et erreur dans le même canal de feedback ;
- les références Dépenses (achats, fournisseurs, lignes budgétaires et documents) étaient chargées par fenêtres fixes, avec risque de rendre une référence réelle introuvable au-delà des premiers résultats ;
- la création d’une dépense vérifiait `achat.fournisseur === dépense.fournisseur`, mais cette contrainte n’était pas réappliquée de façon équivalente après modification de l’achat source ;
- une modification de dépense pouvait laisser des `EnterpriseEntityLink` actifs représentant des relations devenues obsolètes ;
- un justificatif était validé principalement par appartenance au tenant et non par visibilité documentaire effective de l’utilisateur Finance ;
- l’interface déduisait encore plusieurs actions depuis les statuts alors que le serveur doit rester l’autorité des capacités.

### Vue d’ensemble financière

- le KPI des paiements non affectés dépendait des 100 premiers paiements confirmés chargés côté navigateur ;
- les factures à comptabiliser ne couvraient que les factures clients approuvées et omettaient les factures fournisseurs approuvées ;
- les validations en attente étaient approximées à partir des seuls paiements au lieu du moteur commun `EnterpriseApproval` ;
- plusieurs KPI globaux provenaient de lectures séparées et hétérogènes ;
- un KPI calculé pour les factures n’était pas réellement exposé dans les métriques du workspace ;
- les erreurs de santé des projections pouvaient remonter un message trop technique à l’utilisateur.

### Rapports

- le compteur « publiés » et la date du « dernier rapport » pouvaient être dérivés de la page courante au lieu des métriques serveur globales ;
- certaines capacités d’action restaient déduites localement ;
- les formulaires génération / vue sauvegardée n’étaient pas alignés sur le contrat `editor` récent ;
- les états de mutation ne distinguaient pas toujours clairement `loading`, succès et erreur.

## Corrections

### Source de vérité et relations

- `EnterpriseBudget`, `EnterpriseExpense` et `EnterpriseReport` restent les seules sources dédiées de leur domaine ;
- aucune création implicite de paiement, facture, écriture comptable ou solde parallèle n’est ajoutée ;
- les dépenses réappliquent les invariants achat/fournisseur/budget/devise sur création, modification et soumission ;
- les liens actifs `SUPPLIER`, `REALIZES_PURCHASE`, `BUDGET_CONSUMPTION` et `SUPPORTING_DOCUMENT` sont rafraîchis pour représenter l’état courant sans supprimer l’historique audité porté par les événements ;
- les justificatifs sont revalidés dans le même `organizationId` et selon la visibilité documentaire effective de l’utilisateur.

### Lookups Finance

- ajout d’un contrat de référence paginé/recherchable pour achats, fournisseurs, lignes budgétaires et documents ;
- les options restent tenant-scoped et les références reçues sont toujours rechargées côté serveur ;
- l’interface n’est plus limitée silencieusement à une fenêtre fixe de 100 objets.

### Vue d’ensemble

- ajout d’un résumé serveur autoritaire pour les KPI globaux ;
- paiements non affectés comptés sans échantillonnage client ;
- factures à comptabiliser = factures clients approuvées + factures fournisseurs approuvées ;
- validations financières en attente dérivées de `EnterpriseApproval` pour les cibles Finance prises en charge ;
- métriques de comptage séparées des montants et aucune addition de devises différentes ;
- configuration Finance et actions de projection alignées sur les états `loading/disabled` et le feedback global.

### Rapports

- consommation des métriques serveur globales pour les compteurs ;
- capacités d’action exposées par l’API et utilisées côté workspace ;
- formulaires longs en `presentation="editor"` ;
- mutations avec état busy et feedback succès/erreur distinct ;
- snapshots `EnterpriseReport` inchangés comme vérité dérivée immuable.

## Sécurité

Les corrections conservent ou renforcent :

- session et membership actifs ;
- entitlement / permission module ;
- isolation `organizationId` ;
- ownership / visibilité ;
- `isSameOriginRequest` sur mutations ;
- validation Zod ;
- `await rateLimit` ;
- transactions serveur ;
- `ApiLog` et `AuditLog` ;
- revalidation des références client.

## Prisma / migrations

Aucune modification de schéma Prisma et aucune migration ajoutée.

## QA permanente

`scripts/qa-enterprise-finance-reports-checks.mjs` a été renforcé pour couvrir notamment :

- cohérence achat/fournisseur ;
- remplacement des liens actifs obsolètes ;
- visibilité des justificatifs ;
- résumé financier serveur ;
- absence de calcul KPI sur fenêtre client ;
- capacités serveur des workspaces ;
- lookups paginés/recherchables ;
- formulaires `editor` ;
- absence d’agrégation multi-devise fictive.

La gate ciblée reste intégrée à la régression canonique du repository.

## Dette de contribution

- Dette créée : aucune visée.
- Dette maintenue : aucune dette matérielle nécessaire au hotfix n’est volontairement masquée.
- Dette remboursée : lookups tronqués, incohérence achat/fournisseur après édition, liens actifs contradictoires, métriques Overview partielles et capacités UI non autoritaires.
- Dette reportée : aucune à ce stade.

## Validation attendue avant merge

Les preuves doivent être obtenues sur le SHA final :

- diff check ;
- Prisma generate ;
- type-check ;
- QA ciblée ;
- regression QA ;
- lint ;
- build ;
- OWNER_E2E sur `FINANCE_BUDGETS`, `FINANCE_OVERVIEW` et `REPORTS`.

Aucun Preview Vercel n’est requis ni autorisé ; Production reste exclusivement issue de `main` après merge conforme.
