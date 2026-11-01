# 2026-11-01 — DTSC Payments PAY-0 (#371)

## Livré sur la branche de travail

- Contrat de domaine `docs/DTSC_PAYMENTS_ARCHITECTURE.md` : inventaire vérifié des modèles, flux, statuts, responsabilités, routes, services et risques.
- Distinction explicite entre paiement d'abonnement DTSC (`Payment`), paiement ERP client (`EnterprisePayment`) et trésorerie interne DTSC (`HrcfoExpense`). Aucun modèle principal ni double source de vérité supplémentaire.
- Matrice de conformité PAY-0 à PAY-9, rôles tenant-scoped, garde-fous MaishaPay, limites comptables actuelles et plan de cutover sectoriel.
- QA statique dédiée `pnpm qa:dtsc-payments-contract` et index de la documentation technique.

## Hors scope

- Aucun changement d'API métier, composant, schéma Prisma, migration, compte, transaction, callback ou variable d'environnement.
- Aucun provider déclaré certifié ; aucun test de paiement réel ni OWNER_E2E revendiqué.

## Suite / risques

- PAY-1 #372 : service de paiement SaaS commun et transitions serveur, sans refonte du moteur ERP client.
- PAY-2 #373 : facturation, preuve et validation cohérentes ; préserver les hotfixes #994 et #1001.
- PAY-3 #374 + #992/#993 : intégrité comptable, comptes par devise et rapprochement interne.
- PAY-4 #375 : callback MaishaPay fail-closed, montant/devise authentifiés, concurrence et finalisation idempotente.

## Revenir en arrière

Revert documentaire et de la commande QA par une PR contrôlée ; aucune migration ou donnée à restaurer. Production uniquement depuis `main` après revue et CI.
