# P0 #992 — Compte de réception des règlements manuels SaaS DTSC

**Version candidate : 1.2.4** · **État : code en branche, non fusionné.**

## Contrat de sécurité

- Le validateur distinct du demandeur doit désigner le `settlementAccountId` du compte DTSC qui a réellement reçu les fonds et attester la vérification du justificatif externe avant d'approuver.
- Le compte est revalidé et verrouillé dans la transaction de création de l'abonnement, du paiement, de la facture et de `HrcfoExpense`. Contrôles : compte actif, type BANK/CASH/MOBILE_MONEY compatible avec la méthode, même devise USD/CDF/EUR, aucune anomalie de rapprochement.
- Les comptes générés automatiquement par les anciens flux (`Encaissements abonnements ·`, `acct-banque`, `acct-caisse-principale`) ne sont pas recevables. Les comptes internes sont administrés dans RH & CFO ; aucune création automatique pendant l'approbation manuelle.
- La colonne nullable préserve les dossiers historiques. Aucune écriture rétrospective, aucun backfill, aucune validation automatique de l'historique. Un dossier encore en attente peut être lié au compte choisi à la validation.
- MFA step-up, contrôle de validateur distinct, idempotence et statut `PENDING_VALIDATION` restent opposables. Le filtre d'interface ne remplace pas le contrôle serveur. L'attestation humaine ne constitue pas une preuve bancaire automatique : les rapprochements restent à développer.

## OWNER_E2E #992-1 — NON EXÉCUTÉ

1. Créer des comptes internes RH & CFO actifs : BANK en USD et MOBILE_MONEY en CDF, distincts des comptes générés automatiquement.
2. Soumettre un abonnement personnel BANK_TRANSFER USD puis entreprise MOBILE_MONEY CDF ; valider avec un autre collaborateur, preuve des fonds et MFA. Contrôler les factures, les paiements, la trésorerie et le nom du compte lié au dossier.
3. Vérifier que sans compte, sans attestation, avec mauvais type, devise, compte inactif, compte technique ou ID forgé, aucun abonnement ni mouvement financier n'est enregistré.
4. Tester un refus, un rejeu, deux approbations simultanées, une demande historique encore en attente et un historique déjà approuvé. Aucune double comptabilisation ni réécriture d'historique.
5. Tester les vues FR/EN, mobile/desktop, l'audit, les notifications et les permissions DTSC.

## Tests et livraison

Exécuter `pnpm qa:hotfix-992-settlement`, `pnpm qa:regression`, Prisma generate, TypeScript, lint, build, migrations PostgreSQL en CI et E2E propriétaire. Le test de contrat statique ne constitue **pas** une preuve PostgreSQL ni E2E.

Après CI verte et OWNER_E2E BON, fusionner sur main seulement ; livraison Vercel Production et GitHub Release SemVer après READY sur le même SHA. Le rollback conserve la migration additive, sans suppression de colonne.

**Lots restants #992 :** contrôle du compte de destination des paiements automatiques MaishaPay, rapprochement bancaire/mobile-money, preuve de règlement native, audit historique en lecture seule et réparation contrôlée, testing de concurrence PostgreSQL et contrepassations.
