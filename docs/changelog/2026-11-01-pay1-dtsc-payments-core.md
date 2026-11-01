# 2026-11-01 — DTSC Payments PAY-1 (#372) — socle en cours

## Livrable technique isolé

- Six modules de base dans `lib/payments/` ; aucune table `DtscPayment` ni écriture dans `EnterprisePayment`.
- `Payment` SaaS : création transactionnelle de paiement/abonnement personnel ou entreprise, et rattachement transactionnel d'un paiement à une facture émise.
- Référence stable par scope, tenant et requestId ; détection de rejeu conflictuel (propriétaire, provider, devise, montant et plan) ; contrainte unique PostgreSQL existante.
- Transitions explicites `PENDING`/`ACCEPTED`/`PAID`/`FAILED`/`CANCELED`, avec retry explicite et CAS (`updateMany` sur statut attendu).
- Contrôles d'accès : session signée à nouveau vérifiée lors des mutations, origine identique, limite async, compte actif, organisation active, membership OWNER/ADMIN, contexte interne DTSC et capacité ou validateur RH actif.
- Facturation SaaS accessible même à une entreprise **dont l'abonnement a expiré** ; interdiction de réutiliser une entitlement ERP pour verrouiller le renouvellement.
- Pages de paiement bornées à 100 lignes, filtre date/statut ; résumé par couple devise/statut sans addition des devises.
- ApiLog/AuditLog transactionnels lors des créations, annulations et retries. Les décisions manuelles délèguent au finaliseur déjà en place (puis aux routes auditées existantes).
- QA : `pnpm qa:dtsc-payments-core`, tests unitaires état/idempotence et RBAC/tenant à dépôt simulé, régression globale.

## Limitations réelles et suite

- Aucun nouveau endpoint public : ces modules ne sont pas encore branchés aux routes `checkout`, `organization-checkout`, `manual-subscription-payments` ni aux callbacks PSP.
- `markPaymentPaid` **ne peut pas finaliser un paiement non soldé** ; il vérifie uniquement un règlement et sa facture déjà consolidés. L'activation/facture/trésorerie atomique sera traitée avec PAY-2/PAY-3/PAY-4, après preuve de signature, montant et devise du provider.
- La preuve bancaire textuelle `externalReference` **n'est pas un document uploadé**. Le justificatif privé avec accès RBAC est réservé à PAY-2.
- Le flux manuel continue d'utiliser les contrôles historiques du validateur, son transactionnel dédié et les notifications de route ; il reste à raccorder au service et à renforcer l'audit transactionnel unique.
- Tests DB de concurrence, tests HTTP authentifiés, E2E client/Console, provider réel et `OWNER_E2E` requis avant de certifier PAY-1. Ni Preview ni Production depuis cette branche.
- Les liens comptables DTSC `HrcfoExpense` et les ERP clients `EnterprisePayment` restent inchangés. Aucun remboursement/solde partiel multi-factures inventé.

## Revenir en arrière

Revert de ce service sans changement de schéma ou de données. Aucun backfill ni migration ; `main` demeure l'unique source de déploiement Production.
