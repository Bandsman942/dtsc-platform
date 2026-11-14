# P0 #1150 / #1167 — Préflight de facturation médicale avant convergence ERP Finance

**Statut : candidat sur branche, non fusionné, aucune action en production.** Ce lot réalise uniquement un audit en lecture seule. Il ne répare aucun paiement, n'émet aucune écriture comptable et ne certifie pas un rapprochement bancaire, PSP ou assurance.

## Source de vérité et risques

Dans `main@f7d5e965b`, les factures médicales sont dans `HealthMedicalInvoice`, leurs reçus dans `HealthMedicalInvoicePayment`. L'invariant local est : `patientAmount = paidAmount + balanceAmount`, avec `patientAmount = totalAmount - insuranceAmount`, et `paidAmount = somme des paiements CONFIRMED`.

Un solde `PAID` ne prouve **pas** un mouvement canonique du compte financier, ni un journal général POSTED. Il reste à concevoir la convergence Finance, les compensations et le modèle payeur assuré/patient. L'audit de ce lot ne lit pas le ledger financier commun.

## Procédure (organisations fictives / Neon isolé)

- Un opérateur autorisé lance `node scripts/health-billing-finance-preflight.mjs --organization-id=TENANT_TEST --max-scanned=500 --ack=READ_ONLY_HEALTH_BILLING_AUDIT`.
- Le diagnostic se limite à une entreprise et à 100 lignes par page ; 10 000 factures au maximum par invocation.
- Pour continuer une lecture au-delà du plafond, utiliser `--offset=N` avec la valeur `nextOffset` agrégée du rapport. **Aucune pagination par ID affiché**.
- Avant toute lecture Production, vérifier autorisation, périmètre, accès DB restreint, traitement confidentiel et absence d'écritures concurrentes pendant la campagne d'audit. Les fenêtres ne constituent pas une transaction instantanée unique.
- Le résultat indique le nombre agrégé de factures incohérentes et de codes `PATIENT_ALLOCATION_MISMATCH`, `CONFIRMED_PAYMENT_SUM_MISMATCH`, `PAID_STATUS_WITH_BALANCE`, `PARTIAL_STATUS_INCONSISTENT`, `CANCELLED_WITH_CONFIRMED_PAYMENT`, `DUPLICATE_PAYMENT_REFERENCE`, etc.
- **Aucun identifiant patient, facture, reçu, référence bancaire, nom ou diagnostic n'est écrit dans les journaux.** Le programme ne propose aucun mode APPLY.

## Critères QA / couverture

- `node scripts/qa-health-05-finance-preflight.mjs` : décimales exactes via BigInt, anomalies stables, non-divulgation de PHI, code en lecture seule.
- `node scripts/qa-health-05-finance-preflight-postgres.mjs` : PostgreSQL localhost isolé, deux entreprises et patients entièrement fictifs, une facture saine, une incohérente, rejet sans attestation, paginations, preuve que les montants ne sont pas modifiés.
- CI : Prisma generate, migrations propres, PostgreSQL, type-check, QA de régression, lint, build, E2E propriétaire et fusion gouvernée.

## Fermeture de #1150 : RESTE À FAIRE

1. Identifier les véritables modèles Finance canoniques du runtime DTSC pour ventes, créances, encaissements et écritures (ne pas inventer un modèle `EnterpriseSalesInvoice` qui n'existe pas dans Prisma actuel).
2. Cartographier les référentiels de patient/facture/assureur et les comptes financiers site/devise/activité.
3. Contrat d'idempotence et transaction de création d'une facture Finance et de son règlement, avec une source de vérité et un événement durable de l'opération.
4. Annulation et remboursement : contrepassation canonique sans supprimer les écritures et sans double crédit.
5. Contrôles multi-tenant, RBAC clinique et limites de données sensibles vers Finance et les exports.
6. Reconciliation historique à blanc sur sauvegarde isolée ; migration/cutover progressive avec retour arrière documenté.
7. Recette complète patient + assureur + partielle + espèces + mobile money + devises + caisse + refus + rejouabilité + accès.

## Gouvernance de publication

Branche indépendante née de `main@f7d5e965b` (version 1.17.4) ; si la PR P0 Finance #1166 livre d'abord 1.17.6, rebaser ce lot sur le nouveau main, bump SemVer suivant et réexécuter la CI complète et E2E propriétaire avant fusion. Ne jamais fusionner deux PR candidate de même version. Aucun déploiement preview ou depuis une feature branch.
