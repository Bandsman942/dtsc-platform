# P0 #992 / PAY-4 #1170 — Diagnostic privé des règlements automatiques MaishaPay

**Candidat v1.17.6, non fusionné. Aucun script exécuté sur une base cliente ou Production.** L'objectif est de repérer des paiements d'abonnement organisation `Payment=PAID` dont l'écriture `HrcfoExpense` manque, double, diffère de montant/devise, référence un compte synthétique ou n'a pas de facture associée.

## Constat dans le code

`lib/subscription-payments.ts::activateOrganizationSubscriptionFromPayment` peut activer le paiement et l'abonnement, puis appeler `ensureSubscriptionSettlementAccount("MOBILE_MONEY", currency)` qui crée automatiquement un `FinancialAccount`. Une transaction Finance séparée est ensuite créée. **Un statut PAID ne démontre donc pas que les fonds ont réellement été crédités sur un compte DTSC contrôlé.**

## Sûreté

- **LECTURE SEULE** ; aucune route/API publique, aucun webhook changé, aucune activation/désactivation d'abonnement, aucune écriture comptable, suppression ou migration de données.
- La commande exige `--organization-id` et `--ack=READ_ONLY_PSP_SETTLEMENT_AUDIT`. Filtre exclusivement les paiements d'abonnement organisation MAISHAPAY au statut PAID pour le tenant ciblé.
- Pagination de 100 lignes à la fois, max 10 000 par commande et `--offset` pour reprises par fenêtres; les écritures concurrentes imposent une campagne gelée ou un snapshot pour une analyse complète.
- Le rapport contient uniquement des comptes d'anomalies : aucune référence externe, ID de paiement, email, nom, détails banque ou clé sensible dans les logs. L'accès au script doit être réservé à un opérateur avec un rôle DB en lecture seule et une autorisation justifiée.
- `SYNTHETIC_ACCOUNT` signale le nom historique `Encaissements abonnements · ...`, mais la présence d'un compte au nom différent **ne prouve pas** un compte bancaire vérifié.
- Champs `bankSettlementVerified=false`, `providerCallbackVerified=false` et `accountingPostingVerified=false` toujours présents, y compris en absence d'anomalie détectée.

## Utilisation en environnement isolé

```bash
node scripts/provider-settlement-preflight.mjs \
  --organization-id=TENANT_FICTIF --max-scanned=500 \
  --ack=READ_ONLY_PSP_SETTLEMENT_AUDIT

node scripts/provider-settlement-preflight.mjs \
  --organization-id=TENANT_FICTIF --max-scanned=500 --offset=500 \
  --ack=READ_ONLY_PSP_SETTLEMENT_AUDIT
```

- Recette QA contractuelle : `pnpm qa:provider-settlement-preflight`.
- Recette PostgreSQL localhost isolé : `pnpm qa:provider-settlement-preflight:postgres` ; deux tenants fictifs, un paiement lié au compte synthétique, un paiement sans écriture, isolation et aucune modification.
- Avant tout audit Production, revoir le périmètre, la politique d'accès, les sauvegardes et la protection des rapports ; aucune exécution automatique après merge.

## Travaux P0 nécessaires pour fermer #992

1. Validation cryptographique des webhooks et interrogation officielle PSP ; montant, devise, identité et référence réellement réglés.
2. Table de mapping / configuration RH-CFO du compte DTSC réel par PSP, devise, méthode ; contrôle de statut/réconciliation, sans création automatique.
3. État de rapprochement distinct de `PAID` ; verrou DB, clé unique de posting, transaction/outbox durable et anti-replay.
4. Remboursement/chargeback en contrepassation Finance, jamais par suppression.
5. Backfill historique audité avec sauvegarde vérifiée et corrections financières approuvées.
6. Recette E2E sandbox fournisseur, 2 devises, reprise de panne et absence de double crédit.

**Le présent lot ne ferme PAS #992 ni #1170 sans preuve externe, même si les tests passent.** Il ne doit pas être présenté comme une certification PSP.

## Versionnement

Base `main@f7d5e965` v1.17.5 ; candidat 1.17.6. La PR #1169 Santé–Finance vise aussi v1.17.6 : quelle que soit la première fusion approuvée, l'autre doit être rebasée, versionnée ensuite, re-testée et revalidée E2E. Aucun déploiement Preview, branche ou manuel Vercel.
