# #511 — état d'implémentation

Cette note accompagne la PR de travail pendant que les contrôles automatiques sont exécutés.

## Implémenté

- contrat canonique `EnterpriseApproval` pour les cibles Finance ;
- Journal : SUBMIT → APPROVE/REJECT affectés, POST séparé ;
- Payment : SUBMIT → APPROVE affectés, CONFIRM/RECONCILE/REVERSE séparés ;
- Sales Invoice : SUBMIT → APPROVE affectés, ISSUE/posting séparé ;
- Supplier Invoice : reviewer puis approver distincts avec étape finale QUEUED ;
- Financial Close : SUBMIT → APPROVE affectés, CLOSE/REOPEN séparés ;
- Cash Session : validateur affecté lors de la soumission de clôture ;
- Reconciliation : SUBMIT → APPROVE/REJECT affectés ;
- Centre des actions : mappings et deep-links des nouvelles cibles ;
- QA structurale #511 intégrée à la régression.

## Encore en cours avant readiness

- UI de sélection des responsables sur toutes les surfaces ;
- séparation des opérations historiques `approveAndPostOpeningBalance`, `approveAndPostSalesCreditNote`, `approveAndPostSupplierCreditNote` ;
- vérification/correction des adapters workflows automatiques ;
- catalogues d'erreurs utilisateur FR/EN ;
- CI complète sur head final ;
- OWNER_E2E mobile/desktop FR/EN.

Aucun de ces éléments n'est déclaré terminé tant que la PR finale et les preuves correspondantes ne l'attestent.