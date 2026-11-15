# HOTFIX #1184 — RETAIL POS : auto-validation contrôlée et audit bilingue
**Version candidate : v1.18.2 · 15 novembre 2026 · E2E final du propriétaire requis.**

## 1. Affectations par boutique
L'interface RETAIL POS > Accès des collaborateurs expose trois droits distincts, désactivés par défaut : SELF_APPROVE_INVOICE, SELF_APPROVE_PAYMENT, SELF_APPROVE_INVOICE_RETURN. Seul un membre d'entreprise de rôle **OWNER** peut attribuer, modifier ou révoquer ces droits. Les droits préalables PREPARE_INVOICE/COLLECT_PAYMENT ou REQUEST_INVOICE_RETURN+APPROVE_INVOICE_RETURN et rôle MANAGER sont obligatoires selon le cas.

Le serveur revalide pour chaque action le membre actif, l'affectation active, la boutique exacte, le feature flag d'isolation et la disponibilité de la facturation. Une délégation ne donne jamais un accès transversal à d'autres boutiques.

## 2. Facturation
Facturier autorisé : préparation → SUBMIT avec soi-même comme approbateur → APPROVE via **EnterpriseApproval** et Finance (même transaction). Après validation, l'émission ISSUE est conditionnée à son droit natif gérant, à une permission ISSUE_INVOICE, ou à un habilité Finance ; l'auto-approbation seule ne donne jamais le droit d'émettre. La créance, les stock holds et les journaux restent dans le service canonique Finance ; pas de second registre POS.

## 3. Encaissements
Caissier autorisé : DRAFT → SUBMIT avec soi-même comme approbateur → APPROVE par le service Finance → CONFIRM seulement pour son propre paiement Retail CUSTOMER_PAYMENT INBOUND de la même boutique, suivi de l'affectation de créance. Vérifications transactionnelles de la boutique, du créateur, du paiement, du compte financier, de la caisse, du statut, de la révision et de la délégation encore active ; FINANCE global conserve sa séparation des fonctions normale.

Les paiements de remboursement, les dépenses et les paiements d'autres secteurs ne sont pas concernés.

## 4. Facture encaissée / annulation motivée
Aucune suppression d'une facture payée ni du grand livre. Le gérant habilité peut demander puis approuver sa propre demande de retour/annulation, **après une inspection physique indépendante**. Il doit disposer des droits RETAIL REQUEST_INVOICE_RETURN + APPROVE_INVOICE_RETURN, du droit propre SELF_APPROVE_INVOICE_RETURN accordé par OWNER, ainsi que des approbations FINANCE_RECEIVABLES et FINANCE_PAYMENTS requises par le circuit existant.

Les opérations postérieures d'avoir/remboursement et de réintégration/quarantaine/destruction du stock restent assurées par des acteurs distincts. Les prélèvements proviennent des comptes d'origine, avec contrôles de montant/devise, créance et posting atomique.

**Limite existante préservée pour éviter les écritures incorrectes :** seules les factures intégralement réglées et dont la livraison du stock est confirmée sont traitées par le workflow actuel. Une annulation de service pur, d'acompte ou de facture partiellement payée requiert une extension métier distincte avant activation.

## 5. Audit
Administration entreprise > Audit et cohérence : libellés de l'événement, résultat, risque, motif et entité traduits selon l'UI FR ou EN, y compris dans les exports. Le code brut n'est jamais réécrit et reste visible sur chaque événement, permettant recherche et preuve. La création/modification des droits consigne explicitement avant/après et les décisions sont tracées avec utilisateur, boutique et document.

## QA & matrice propriétaire
```bash
pnpm qa:hotfix-1184
pnpm qa:hotfix-1042-site-staff
pnpm qa:hotfix-1042-retail-invoice-payments
pnpm qa:hotfix-1042-retail-invoice-return-requests
pnpm qa:hotfix-1086-invoice-workflow
pnpm type-check
```

1. Créer 2 boutiques A/B, un facturier, un caissier, un gérant, un inspecteur et les validateurs Finance indépendants.
2. Propriétaire active chacun des trois droits pour collaborateur A ; admin tente le même changement (403). Collaborateur A ne voit ni ne valide factures/paiements B.
3. Facture propre : SUBMIT vers soi, APPROVE ; essayer ISSUE sans ISSUE_INVOICE (403), puis avec droit correct. Vérifier unique créance et écriture.
4. Encaissement propre : DRAFT → SUBMIT → APPROVE → CONFIRM ; caisse/compte de A, trésorerie et créance liés. Sans droit et après révocation, APPROVE/CONFIRM doivent échouer (403).
5. Paiement REFUND/non Retail : refus d'auto-confirmation malgré l'exception RETAIL. Tester double clic, révisions périmées, retries et montants concurrents.
6. Facture A intégralement payée : demande de retour motivée par gérant, inspecteur différent, approbation du gérant si droit et approbations Finance, puis préparation, validation et liquidation par autres utilisateurs ; vérifier avoir, remboursements, caisse et stock.
7. Sans inspection, sans droit ou pour B : refus. Vérifier qu'aucun paiement/débit/stock n'est modifié avant liquidation complète.
8. Consulter événements dans Administration FR puis EN ; vérifier libellés, filtres, export et codes bruts, ancien et nouveau log.
9. Vérifier mobile (Samsung Internet) : cases owner-only, formulaire compact, actions accessibles, toasts explicites.
10. Ne pas fusionner tant que E2E final propriétaire BON et CI sur SHA courant ne sont pas confirmés.

**Déploiement :** uniquement après fusion de la PR autorisée vers main ; Vercel auto production, jamais `--prod` manuel. Aucune migration Prisma et aucune variable d'environnement nouvelle.