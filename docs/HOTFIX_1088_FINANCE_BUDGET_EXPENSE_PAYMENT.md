# Hotfix #1088 — Flux Budgets → Dépenses → Comptabilité → Paiements

**Version candidate :** `v1.7.2` — 09/11/2026. **État :** branche hotfix ; pas de fusion ni déploiement avant validation E2E propriétaire.

## 1. Principe de gestion

L’enveloppe budgétaire, l’engagement, la comptabilisation et le règlement sont **quatre faits distincts**. Une approbation budgétaire ne crée ni trésorerie ni écriture. Une dépense approuvée consomme le budget et peut créer une dette ; le compte bancaire ou la caisse n’est diminué **qu’à la confirmation d’un paiement**.

| Étape | Événement de référence | Effet budgétaire | Effet comptable | Effet financier |
|---|---|---|---|---|
| Prévision | Ligne `EnterpriseBudgetLine` | Montant prévu | Aucun | Aucun |
| Engagement | Commande/engagement validé | Montant engagé | Selon circuit d’achat spécialisé | Aucun |
| Dépense approuvée | `EnterpriseExpense.APPROVED` | Consommation réelle | Pas encore une écriture par défaut | Aucun |
| Imputation directe | `EXPENSE_APPROVED` | Pas de nouvelle consommation | Débit charge, crédit dette/transit | Aucun |
| Ordre de paiement | `EnterprisePayment.EXPENSE_SETTLEMENT` brouillon/validé | Inchangé | Inchangé | Aucun ; montant réservé dans le reste à payer |
| Confirmation | `EXPENSE_SETTLEMENT_CONFIRMED` | Inchangé | Débit dette/transit, crédit compte de banque/caisse/Mobile Money | Trésorerie débitée une fois |
| Contrepassation | Paiement inversé autorisé | Inchangé | Écriture inverse traçable | Mouvement inverse traçable |

**Ne pas confondre** `EnterpriseBudgetLine.accountCode` (compte d’imputation dans le plan comptable) et `fundingFinancialAccountId` (banque/caisse envisagée). `EnterpriseExpense.preferredFinancialAccountId` est aussi une préférence, pas une autorisation de débit. Le compte réellement utilisé est celui du paiement validé.

## 2. Procédure utilisateur pas à pas

1. **Préparer l’entreprise.** Activez les modules Finances/Comptabilité selon les droits. Créez les comptes comptables imputables, les comptes financiers actifs et leurs journaux. Pour un règlement en espèces, ouvrez une session de caisse valide.
2. **Budgets → Nouveau budget.** Renseignez période, devise, montant de chaque ligne, compte comptable (charge ou autre destination métier) et éventuellement banque/caisse prévisionnelle de **même devise**. Soumettez au validateur ; la validation ne prélève pas les fonds.
3. **Dépenses → Nouvelle dépense.** Sélectionnez nature, boutique, date, devise, montant, ligne budgétaire, justificatif et bénéficiaire pertinent (fournisseur pour achats ou collaborateur pour remboursement). Indiquez « immédiat », « différé » ou « échelonné », échéance et compte financier envisagé si connu. Soumettez et faites approuver.
4. **Qualifier le circuit.** Une facture fournisseur va dans **Dettes fournisseurs**, liée à l’achat. Le stock doit utiliser Achats/Stock, les immobilisations le module Actifs, la fiscalité son circuit. Les charges directes non fournisseurs peuvent être comptabilisées depuis la fiche de dépense par un utilisateur ayant les permissions nécessaires.
5. **Dépense directe approuvée → Comptabiliser.** L’écriture de charge est produite une fois, dans un exercice/période autorisé : débit charge (compte de la ligne budgétaire lorsqu’il est compatible), crédit dette/transit ou dette envers le personnel. Le compte bancaire ne change pas.
6. **Préparer un règlement distinct.** Choisissez le montant (complet ou partiel), le mode, le compte de banque/caisse/Mobile Money à débiter et la date. DTSC refuse toute réservation dépassant le solde non encore payé ou réservé. Un ordre est créé en brouillon dans **Paiements**.
7. **Paiements → Soumettre → Approuver → Confirmer.** Les permissions et la séparation des tâches s’appliquent. À la confirmation, l’écriture de règlement est postée et le mouvement de trésorerie créé **dans la même transaction**, avec vérification de la devise, de la boutique et du solde disponible. Une défaillance annule toute la transaction.
8. **Vérifier.** Dans la fiche de dépense, contrôlez les règlements confirmés et en attente. Dans Trésorerie et Comptabilité, rapprochez le paiement, le mouvement financier et le journal. Aucun double débit de charge n’est admissible.

### Exemple SHOP BCN Multi Test

- Budget « Connectivité » : `300 USD`, compte de charge « Internet » de l’entreprise, compte prévisionnel « Banque USD — Boutique Gombe » (facultatif).
- Dépense mensuelle internet : `120 USD`, affectée à la boutique Gombe, pièce justificative et approbateur désigné.
- Après approbation : réalisé budgétaire `120 USD`, **sortie de banque 0 USD**. Après comptabilisation directe : charge +120 / dette-transit +120 ; banque inchangée.
- Préparer deux règlements `70 USD` et `50 USD` ; ils ne font aucun retrait avant confirmation. Après le premier : banque −70, dette restante 50. Après le second : banque −120 en cumulé, dette 0. La consommation budgétaire reste `120 USD`, jamais `240 USD`.

Pour un **achat d’accessoires en stock**, ne comptabilisez pas une charge Internet : suivez l’achat, le stock et la facture fournisseur jusqu’au paiement de la dette. Le règlement ne doit pas créer un deuxième coût de stock.

## 3. Contrat technique et garde-fous

- Migration additive `20261109093000_finance_budget_expense_settlement`, clés composites incluant `organizationId` pour compte financier prévu et paiement lié, index des consultations et montant restant.
- Nouveau sélecteur privé `GET /api/enterprise/:organizationId/budgets/references` : comptes financiers actifs, comptes comptables imputables, employés ; sans solde, identifiant bancaire complet ni autre tenant ; module `FINANCE_BUDGETS` obligatoire.
- `EnterpriseBudgetLine.fundingFinancialAccountId` vérifié actif, tenant et devise ; `EnterpriseExpense` enregistre `beneficiaryEmployeeId`, `settlementMode`, `paymentDueDate`, `preferredFinancialAccountId` après validation.
- `EXPENSE_APPROVED` comptabilise **une seule fois** la dépense directe. Les dépenses avec fournisseur, achat, facture fournisseur ou de nature Stock/Actif/Taxe ne passent pas par ce raccourci, pour ne pas doubler `FINANCE_PAYABLES` ou un module métier.
- `EXPENSE_SETTLEMENT` lie un paiement à une dépense approuvée et déjà comptabilisée, verrouille la dépense lors de la réservation et limite les ordres actifs au montant total ; les statuts `CANCELLED` et `REVERSED` libèrent cette disponibilité.
- La confirmation réévalue devise, boutique et solde ; journal de liquidation, mouvement `EnterpriseTreasuryTransaction` et mise à jour `EnterpriseFinancialAccount` sont atomiques et sous registre de posting idempotent ; inversion auditable, période comptable clôturée non modifiable.
- Les sommes présentées dans le détail sont des `aggregate` sur **tous** les paiements, tandis que l’historique récent est borné à 50 lignes. Les droits Finance distincts gouvernent lecture des règlements, création et imputation.
- Pas de donnée migrée ni de contre-écriture automatique des dépenses historiques. Aucun traitement automatique de stock ou d’immobilisation n’est prétendu ici.

## 4. Recette de validation avant autorisation de fusion

- [ ] Créer budget avec compte comptable et compte financier de même devise ; refuser compte d’autre entreprise, inactif ou dans une autre devise.
- [ ] Budget approuvé : aucun mouvement `EnterpriseTreasuryTransaction`, aucune écriture générée par l’approbation seule.
- [ ] Dépense approuvée : consommations/engagements corrects ; dossier sans fournisseur et dossier avec fournisseur ; justificatifs, site et bénéficiaire RH.
- [ ] Charge directe : une écriture débit charge/crédit transit ; deuxième tentative refusée ; période fermée refusée.
- [ ] Facture fournisseur : le circuit Dettes fournisseurs fonctionne ; la dépense liée ne peut pas être comptabilisée une deuxième fois.
- [ ] Stock, immobilisation, taxe : affichage du circuit spécialisé et blocage du posting direct.
- [ ] Paiement : deux règlements partiels plafonnés ; ordres en attente ne débitent rien ; troisième ordre excessif refusé, y compris en concurrence.
- [ ] Confirmation : rôle et séparation des tâches, caisse ouverte, compte/site/devise corrects, solde disponible ; journal et trésorerie liés **une fois**.
- [ ] Annulation d’un brouillon, contrepassation d’un confirmé : réservation/solde/journal cohérents ; audit préservé.
- [ ] Multi-boutiques et multi-tenant : accès à la dépense, compte de banque et personne autorisé ; aucun croisement d’organisation.
- [ ] Français/anglais, mobile, faible débit : étapes, toasts, champs obligatoires et erreurs contextuelles lisibles.
- [ ] Lancer Prisma (génération/validation), TypeScript, lint, QA #1088 et régressions, CI, puis obtenir la décision humaine « E2E final BON ».

**Politique :** branche dédiée → Quality Gates → recette propriétaire → merge sur `main` seulement après feu vert ; la Production Vercel suit exclusivement le merge `main`.
