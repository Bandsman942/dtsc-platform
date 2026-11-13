# P0 #992 — Compte de réception des règlements manuels SaaS DTSC

**Version candidate : 1.17.4** · **État : réconciliation du delta #1040 depuis main 1c9ad02 ; brouillon non fusionné.**

## Contrat de sécurité

- Le validateur distinct du demandeur doit désigner le `settlementAccountId` du compte DTSC qui a réellement reçu les fonds et attester la vérification du justificatif externe avant d'approuver.
- Le compte est revalidé et verrouillé dans la transaction de création de l'abonnement, du paiement, de la facture et de `HrcfoExpense`. Contrôles : compte actif, type BANK/CASH/MOBILE_MONEY compatible avec la méthode, même devise USD/CDF/EUR, aucune anomalie de rapprochement.
- Les comptes générés automatiquement par les anciens flux (`Encaissements abonnements ·`, `acct-banque`, `acct-caisse-principale`) ne sont pas recevables. Les comptes internes sont administrés dans RH & CFO ; aucune création automatique pendant l'approbation manuelle.
- La colonne nullable préserve les dossiers historiques. Aucune écriture rétrospective, aucun backfill, aucune validation automatique de l'historique. Un dossier encore en attente peut être lié au compte choisi à la validation.
- MFA step-up, contrôle de validateur distinct, idempotence et statut `PENDING_VALIDATION` restent opposables. Le filtre d'interface ne remplace pas le contrôle serveur. Le service refuse lui aussi une approbation initiale sans attestation explicite de réception des fonds. L'attestation humaine ne constitue pas une preuve bancaire automatique : les rapprochements restent à développer.

## OWNER_E2E #992-1 — NON EXÉCUTÉ

1. Créer des comptes internes RH & CFO actifs : BANK en USD et MOBILE_MONEY en CDF, distincts des comptes générés automatiquement.
2. Soumettre un abonnement personnel BANK_TRANSFER USD puis entreprise MOBILE_MONEY CDF ; valider avec un autre collaborateur, preuve des fonds et MFA. Contrôler les factures, les paiements, la trésorerie et le nom du compte lié au dossier.
3. Vérifier que sans compte, sans attestation, avec mauvais type, devise, compte inactif, compte technique ou ID forgé, aucun abonnement ni mouvement financier n'est enregistré.
4. Tester un refus, un rejeu, deux approbations simultanées, une demande historique encore en attente et un historique déjà approuvé. Aucune double comptabilisation ni réécriture d'historique.
5. Tester les vues FR/EN, mobile/desktop, l'audit, les notifications et les permissions DTSC.

## Tests et livraison

Exécuter `pnpm qa:hotfix-1041-settlement`, `pnpm qa:regression`, Prisma generate, TypeScript, lint, build, migrations PostgreSQL en CI et E2E propriétaire. La CI exécute aussi `pnpm qa:hotfix-1041-settlement:postgres` sur PostgreSQL localhost isolé (compte actif/type/devise/anomalie/compte automatique/FK historique nullable). Le test contractuel et cette preuve DB ne remplacent **pas** le E2E humain ni un rapprochement bancaire ou PSP réel.

Après CI verte et OWNER_E2E BON, fusionner sur main seulement ; livraison Vercel Production et GitHub Release SemVer après READY sur le même SHA. Le rollback conserve la migration additive, sans suppression de colonne.

**Lots restants #992 :** contrôle du compte de destination des paiements automatiques MaishaPay, rapprochement bancaire/mobile-money, preuve de règlement native, audit historique en lecture seule et réparation contrôlée, testing de concurrence PostgreSQL et contrepassations.

## Réconciliation depuis l'ancienne PR #1040

- Source initiale vérifiée : `fix/992-internal-subscription-settlement-account`, PR #1040, ses deltas limités aux champs/service/API/UI/contrats. `main` du départ : `1c9ad02b3402eb4300bc6420f2d0f70b08e1286d`.
- Nouvelle branche `fix/1041-manual-settlement-main-reconciliation`, migration additive datée du 14/11/2026, version candidate 1.17.4. L'ancienne migration du 6 novembre non fusionnée ne doit pas être appliquée à nouveau sous un autre nom ; elle reste hors du main.
- La PR historique #1040 reste en brouillon jusqu'à clôture administrative après validation des différences et correction des gates ; **pas de fusion automatique**.
- Cas test manquant avant acceptation finale : paiement personnel et entreprise avec vrais rôles, facture, abonnement, compte RH/CFO, contrepassements, contre-épreuves de concurrence et confirmation du propriétaire (lien E2E à ajouter).
