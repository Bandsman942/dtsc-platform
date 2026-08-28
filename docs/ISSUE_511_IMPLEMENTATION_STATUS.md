# #511 — état d'implémentation

Cette note accompagne la PR de travail et distingue les éléments implémentés des preuves encore requises avant readiness.

## Implémenté

- contrat canonique `EnterpriseApproval` pour les cibles Finance ;
- Journal : SUBMIT → APPROVE/REJECT affectés, POST séparé ;
- Payment : SUBMIT → APPROVE affectés, CONFIRM/RECONCILE/REVERSE séparés ;
- Sales Invoice : SUBMIT → APPROVE affectés, ISSUE/posting séparé ;
- Supplier Invoice : reviewer puis approver distincts avec étape finale QUEUED ;
- Financial Close : SUBMIT → APPROVE affectés, CLOSE/REOPEN séparés ;
- Cash Session : validateur affecté lors de la soumission de clôture ;
- Reconciliation : SUBMIT → APPROVE/REJECT affectés ;
- Opening Balance : approbation affectée puis POST séparé ;
- Sales Credit Note : approbation affectée puis POST séparé ;
- Supplier Credit Note : approbation affectée puis POST séparé ;
- UI de sélection explicite des responsables sur les soumissions concernées, y compris caisse et rapprochement ;
- adapters Finance : les workflows automatiques ne prennent plus les décisions humaines d'approbation et ne peuvent exécuter que les opérations strictes autorisées après validation ;
- Centre des actions : mappings et deep-links des nouvelles cibles ;
- QA structurale #511 intégrée à la régression, avec garde des flux UI caisse/rapprochement et des statuts de filtrage ;
- recettes Accounting production-like alignées sur l'affectation explicite des approbateurs sans réintroduire l'auto-approbation.

## Encore requis avant readiness

- validation finale des messages d'erreur utilisateur FR/EN sur l'ensemble des parcours #511 ;
- CI complète verte sur le head final ;
- OWNER_E2E mobile/desktop FR/EN sur le head final.

Aucune CI finale ni aucun OWNER_E2E n'est déclaré réussi sans preuve attachée au SHA final.