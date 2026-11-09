# Hotfix #1086 — circuit de validation/émission RETAIL et factures clients imprimables

**Date :** 9 novembre 2026
**Version candidate :** 1.7.1
**Ticket :** [#1086](https://github.com/Bandsman942/dtsc-platform/issues/1086)
**Statut :** branche candidate, **OWNER_E2E requis avant merge**.

## Objet et frontières métier

La facture est un document Finance canonique `EnterpriseSalesInvoice` de bout en bout : le POS ne possède ni second registre de créances ni système de journal indépendant. L'espace « Factures clients » commun aux secteurs exploite le même modèle. Le statut « À valider / En attente de validation » indique le nom de l'approbateur actif affecté, et une notification de soumission le dirige vers la facture.

```text
Facturier (boutique A) : préparation de la facture, aperçu provisoire
    → soumission au validateur nommé (EnterpriseApproval PENDING)
Validateur désigné et habilité Finance : APPROVE / REJECT / REQUEST_CORRECTION
    → décision + statut facture dans une seule transaction SERIALIZABLE
Gérant de la boutique A OU habilité Finance post : émission uniquement si APPROVED
    → création de la créance et comptabilisation canonique dans la transaction d'émission
Caissier habilité de la boutique A : encaissement de la facture ISSUED
    → paiements/allocation, caisse, trésorerie et comptabilité dans la transaction Finance existante
```

Les factures préparées, en attente ou simplement approuvées ne figurent pas dans la file d'encaissement. Aucun accès au menu ou à une URL ne remplace la vérification serveur des permissions et du site réel de la facture.

## Permissions et séparation des fonctions

| Profil | Préparer | Valider | Émettre après validation | Encaisser |
|---|---|---|---|---|
| Facturier affecté à A | A (`PREPARE_INVOICE`) | Non | Non | Non, sauf droit distinct |
| Validateur Finance explicitement désigné | Si droit distinct | Oui, dans son périmètre, jamais sa propre facture | Seulement si droit Finance post distinct | Si droit distinct |
| Gérant `MANAGER` affecté à A | Selon ses droits | Non par défaut | **A, droit natif `ISSUE_INVOICE`** | Selon ses droits |
| Collaborateur avec droit Finance de comptabilisation | Selon ses droits | Uniquement si approbateur distinct nommé | Boutiques autorisées par son périmètre Finance | Selon ses droits |
| Administrateur/propriétaire du tenant | Selon modules/permissions applicables | Si désigné et contrôle d'indépendance respecté | Selon droit d'administration | Selon droits de caisse |

Un rôle de gérant ne confère **pas** la permission `FINANCE_RECEIVABLES.approve`. Une attribution **explicite** de `ISSUE_INVOICE` à un autre poste de la boutique peut également autoriser l'émission ; elle ne donne pas le droit d'approuver. Les affectations multi-boutiques restent étanches : un manager A ne peut émettre ni prévisualiser la facture de B. Un titulaire Finance possédant des affectations RETAIL limitées conserve cette limite pour les factures de boutique ; le droit Finance complet n'est pas une passerelle inter-boutiques implicite.

## Écrans et API

- `RETAIL_POS?section=approvals` : deux onglets, « À valider par moi » (approbateur affecté) et « Validées · à émettre » (gérant/Finance habilité). Recherche par numéro et articles ; filtres boutique, date précise ou plage et pagination SQL. Les décisions demandant un motif le vérifient côté UI et API.
- `GET /api/enterprise/:organizationId/retail/invoices/workflow` : `view=approvals|issue`, `q`, `siteId`, `dateFrom`, `dateTo`, `page`, `pageSize`. Statuts et affectation filtrés **côté serveur** avant pagination ; pas de données des boutiques non autorisées.
- `POST /api/enterprise/:organizationId/retail/invoices/:invoiceId/transition` : `SUBMIT`, `APPROVE`, `REJECT`, `REQUEST_CORRECTION`, `ISSUE`, `CANCEL` ; `revision` positive obligatoire, motif obligatoire pour refus/correction. L'émission appelle `transitionSalesInvoice` et non une mutation dédiée au POS.
- `FINANCE_RECEIVABLES` → « Factures clients » : badge `En attente de validation (Nom)`, boutons `Aperçu A4` depuis la ligne et le détail ; actions communes cohérentes avec le validateur affecté.
- `GET /api/enterprise/:organizationId/sales-invoices/:invoiceId/print` : facture professionnelle A4, FR/EN, logo privé de l'entreprise, identité, client, désignations, montants, règlement, reste dû et statut. En-tête « document non émis » obligatoire pour DRAFT/PENDING_APPROVAL/APPROVED. RBAC Finance pour tous les secteurs ; fallback RETAIL du seul manager autorisé à émettre, sur sa boutique. En-têtes privés, échappement HTML des données métier.
- Actions génériques `EnterpriseApproval` : décision de facture routée vers le même service canonique, sans second `recordApprovalDecision` ; notifications au demandeur et lien direct vers la facture.

## Pré-requis

- Module RETAIL et facturation/encaissement activés pour la boutique, mécanisme `siteStaffIsolationEnabled` / `invoiceCheckoutEnabled` suivant le runbook RETAIL.
- Affectation active par boutique dans Administration/Configuration POS et validation Finance désignée à une personne autorisée.
- Paramétrage de comptabilisation Finance, devise, période, journaux et règles de posting. En leur absence, l'émission doit échouer **sans** création partielle de créance ou d'écriture.
- Logo entreprise facultatif ; s'il est enregistré dans la zone prévue, il est affiché depuis la route privée de logo, jamais par URL externe arbitraire.

## Recette E2E propriétaire — deux boutiques (SHOP BCN)

1. Affecter Alice `INVOICER` à BCN-GOMBE et Bruno `MANAGER` à BCN-GOMBE ; laisser Chantal `MANAGER` sur BCN-LIMETE. Attribuer à David le droit de validation Finance et le désigner comme validateur d'une facture créée par Alice.
2. Alice crée une facture 48 000 CDF à Gombe, contrôle son A4 marqué **non émis**, puis la soumet à David. Dans « Factures clients », constater `En attente de validation (David)` et une notification adressée à David.
3. Bruno ne peut pas la valider ; Chantal ne peut ni voir ni émettre cette facture Gombe. David la trouve dans « À valider par moi » avec filtres date/boutique, puis l'approuve. L'approbation ne crée pas encore de créance exigible.
4. Bruno la trouve dans « Validées · à émettre », ouvre l'aperçu A4 provisoire et clique Émettre. Il ne peut pas émettre une facture encore en attente ou non affectée à sa boutique.
5. La facture devient `ISSUED` et apparaît dans `Encaissements`. Le caissier de Gombe enregistre le paiement en CDF. Contrôler sur le **même identifiant** la créance/son solde, les allocations, la session de caisse, la trésorerie et l'écriture comptable ; aucun doublon après double-clic ou répétition réseau.
6. Répéter avec rejet motivé puis demande de correction. Vérifier la notification du facturier et la resoumission ou recréation contrôlée d'une facture corrigée. Les documents non émis restent visiblement provisoires.
7. Depuis un autre secteur (ex. services), ouvrir « Factures clients » et imprimer une facture A4. Vérifier logo, client, taxes/remises et absence de tout champ RETAIL propre à un autre tenant.
8. Tester le refus API par `403` sur boutique non autorisée, session expirée, permission retirée et approbation par la personne non affectée. Comparer les totaux des rapports Finance avant/après paiement.
9. Contrôler sur mobile les onglets, les dates précises/plages, la recherche, la pagination, les toasts et l'impression A4.

## Commandes QA et rollback

```bash
pnpm qa:hotfix-1086-invoice-workflow
pnpm qa:hotfix-1042-retail-invoice-finance
pnpm qa:hotfix-664-finance-approval-collaboration
pnpm type-check
pnpm lint
```

Aucune migration Prisma, aucun nouveau champ financier ni activation de feature flag ne sont requis pour ce hotfix. **Rollback :** ne pas fusionner la branche en cas d'échec. Après fusion, appliquer un correctif réversible via PR et migration contrôlée seulement si nécessaire ; ne supprimer aucune facture, aucun paiement ni journal. Ne jamais exécuter de `--prod` manuel : Vercel production uniquement depuis `main` après `OWNER_E2E BON`.
