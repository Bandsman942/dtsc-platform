# Hotfix #1222 — RETAIL : retours, avoirs et remboursements simplifiés

> **STATUT : DRAFT — code candidat, tests E2E final non certifiés.**
> PR : https://github.com/Bandsman942/dtsc-platform/pull/1223
> Issue : https://github.com/Bandsman942/dtsc-platform/issues/1222
> Indépendant de #1215, candidat v1.24.2. **Aucune fusion ni production sans OWNER_E2E « BON ».**

## Contrat de configuration
- `mode=SIMPLIFIED`, `allowRequesterInspection=true`, `allowDelegatedSelfApproval=true`, `autoPostCreditNote=true`, `promptImmediateRefund=true`, `scope=ALL_SITES`, plafond `100.00 USD`.
- Les valeurs sont persistées sous `EnterpriseRetailConfiguration.settingsJson.retailInvoiceReturnPolicy`. Sans configuration valide, `STANDARD` reste le défaut.
- Propriétaire ou admin actif contrôle les modifications via rôle, révision optimiste, step-up et audit. Un gérant n'acquiert jamais les droits d'une autre boutique.
- Le snapshot des règles et l'identité des intervenants sont conservés par demande; chaque action recontrôle les droits présents et la politique active.

## Parcours implémentés en candidat (NON CERTIFIÉS)
1. Demande signée par un utilisateur autorisé; contrôle physique `INDEPENDENT` ou `SELF_ATTESTED` selon habilitation et affectation; décision du validateur désigné.
2. Facture émise et comptabilisée **sans encaissement**, partiellement ou totalement annulée : `payout=0`, avoir comptabilisé, créance mise à jour, aucun `EnterprisePayment` sortant. Si marchandise non livrée, libération de réservation; si livrée, inspection et comptabilisation/valorisation de stock dans le même chemin canonique.
3. Facture encaissée, remboursement `NOW` : seulement pour paiement provenant d'une source `CASH`; attestation réelle de remise, step-up, approbation express sous délégation, écritures, trésorerie, caisse et mouvements de stock transactionnels et idempotents.
4. Remboursement `LATER` : l'avoir, les allocations et le stock sont traités sans décaissement; état `REFUND_PENDING`. La sortie d'espèces est déclenchée plus tard avec step-up et attestation. Pour une source externe (BANQUE/MOBILE MONEY), la sortie doit être confirmée dans Finance **par un autre intervenant** avant de clôturer le dossier; aucun faux paiement automatique.
5. Limite `100 USD` vérifiée avant paiement express sur la somme des retours de la facture, au taux Finance actif et daté. Aucune conversion FX requise pour un remboursement nul. Exclusion des paiements externes du mode `NOW`.
6. Les notes d'avoir Finance d'origine RETAIL exposent leur facture, boutique, retour et statut; action directe « Comptabiliser » supprimée, lien ciblé vers le dossier POS. Avoir RETAIL non rapproché = incident visible et aucune émission silencieuse de pièce de remplacement.
7. Mode `STANDARD` existant conservé (quatre yeux, approbations indépendantes). Le garde `RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED` n'est pas désactivé.

## Fichiers structurants
- `lib/enterprise/retail/invoice-return-policy.ts` et `invoice-return-express-authorization.ts` : contrat, délégation, plafond, FX.
- `lib/enterprise/retail/invoice-returns.ts`, `invoice-return-unpaid-express.ts`, `invoice-return-finance.ts`, `invoice-return-settlement-preflight.ts` : orchestration.
- `lib/enterprise/accounting/customer-refund-service.ts` : exception CASH strictement limitée au retour express, paiements externes gérés par Finance.
- `app/api/enterprise/[organizationId]/retail/return-policy/route.ts` et handlers retour/decision/settle.
- `prisma/migrations/20261123160000_retail_express_return_inspection_policy/migration.sql` : colonnes audit/politique/choix, contrainte REFUND_PENDING. Migration additive, historique préservé, aucune écriture en production.
- `components/enterprise/professional/retail-invoice-return-policy-panel.tsx`, `retail-invoice-return-dialog.tsx`, `enterprise-finance-invoices-workspace.tsx` : UI Design 2.0 FR/EN.

## Matrice E2E et preuves exigées
- **E01–E06** rôles, auto-inspection, validateur désigné et révocation; **E07–E10** NOW/LATER/100 USD, finance et caisse; **E11–E16** partial paid, stocks/lots/services, sources multiples; **E17–E22** idempotence, concurrence, rollback, période, FX, preuve de confirmation externe; **E23–E30** provenance Finance, anciennes pièces, standard et multi-tenant, mobile.
- **E31** facture entièrement impayée, avoir total, solde zéro, aucune sortie d'argent.
- **E32** facture impayée, avoir partiel, reliquat exigible, aucune sortie d'argent.
- **E33** avoir RETAIL existant, facture et retour liés, aucun duplicata.
- Des tests réels HTTP + PostgreSQL + Playwright ont été **ajoutés au code** dans `tests/e2e/shop2-invoice-finance-lifecycle.spec.mjs` : impayé, partiel, NOW cash, LATER bancaire, refus de clôture frauduleuse, rapprochement et provenance. **Ajouté ≠ exécuté ni réussi.**
- QA pure/statique `pnpm qa:hotfix-1222` et non-régression RETAIL/Finance requises.
- Résultats nécessaires sur **même SHA** : migration DB propre, TypeScript, lint, build, 33 scénarios E2E réels avec logs, navigateur FR/EN, mobile et régresion des filières standard.

## Risques bloquants avant release
- L'exécution authentique de TOUS les scénarios E01–E33, et pas seulement la présence de tests sources.
- Les cas sans preuve d'identité Finance, de compte de remboursement, de cash session ou d'origine de lot doivent rester bloquants sans mutation.
- Tout passage de période close, tout financement insuffisant, toute réaffectation inter-boutiques et tout paiement externe non confirmé doivent échouer proprement.
- Le remboursement bancaire différé reste en attente jusqu'à confirmation du paiement via le moteur Finance et clôture du retour; ne pas afficher « remboursé » avant la preuve.
- Une défaillance CI interdit de présenter un « E2E final BON ».

## Statut de validation
| Contrôle | Statut |
|---|---|
| Source et contrat métier | CODÉ (non certifié) |
| Migration PostgreSQL | CI à certifier sur SHA final |
| TypeScript / qualité / build | CI à certifier sur SHA final |
| Cas HTTP/PostgreSQL/Playwright | Scripts ajoutés, exécution et preuves CI requises |
| E01–E33 exhaustifs | NON CERTIFIÉ |
| OWNER_E2E | NON VALIDÉ |
| PR fusionnée / déployée | NON |

## Politique de livraison et retour arrière
DRAFT #1223 → CI complète et E2E démontrés → propriétaire dit `E2E final BON` → merge `main` → déploiement automatique Vercel depuis `main` seulement. Aucune fusion, migration de production ni déploiement ici. Les colonnes additives ne suppriment aucune preuve historique; annuler l'activation applicative ne doit jamais effacer les écritures déjà comptabilisées.
