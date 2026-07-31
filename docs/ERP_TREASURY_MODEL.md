# Modèle de trésorerie ERP

## Périmètre

La trésorerie commune des entreprises clientes repose sur `EnterpriseFinancialAccount`, `EnterpriseTreasuryTransaction`, `EnterpriseAccountTransfer`, `EnterprisePayment`, `EnterpriseCashSession`, `EnterpriseBankStatement` et `EnterpriseReconciliationSession`.

Les comptes financiers internes DTSC, les caisses Pharmacy et les paiements Health restent séparés jusqu’aux itérations prévues.

## Sources de vérité

- Mouvement reconnu : `EnterprisePayment.status = CONFIRMED`.
- Mouvement opérationnel de trésorerie : `EnterpriseTreasuryTransaction`.
- Solde comptable : lignes `POSTED` du grand livre.
- Solde rapproché : transactions et lignes de relevé confirmées dans une session de rapprochement.
- Solde disponible : projection opérationnelle explicitement nommée, jamais un champ ambigu unique.

## Comptes financiers

Types autorisés : `CASH`, `BANK`, `MOBILE_MONEY`, `CLEARING`. Chaque compte appartient à une organisation, une devise et un compte du grand livre. Les références externes sont masquées. Aucun mot de passe, secret bancaire ou clé fournisseur n’est persisté dans ces modèles.

## Paiements

Cycle : `DRAFT -> PENDING_APPROVAL -> APPROVED -> CONFIRMED -> RECONCILED`. Les annulations précèdent la confirmation ; après confirmation, la correction utilise une inversion métier. L’initiateur ne peut pas approuver son propre paiement. Les allocations sont tenant-aware, bornées par le montant non affecté et par le solde ouvert de la créance ou dette.

Un paiement non affecté est une avance. Il utilise les mappings `CUSTOMER_ADVANCE` ou `SUPPLIER_ADVANCE`, puis une allocation produit une écriture de reclassement idempotente.

## Transferts

Un transfert interne est atomique : sortie source, entrée destination, snapshot de taux si multidevise, puis écriture équilibrée. Une erreur annule toute la transaction. Les devises différentes ne sont jamais additionnées directement.

## Caisse

Une transaction `CASH` exige une session ouverte du même compte financier. Le caissier soumet le comptage mais ne valide pas sa propre clôture. Un écart crée `EnterpriseCashDiscrepancy`, une justification, une validation et, si nécessaire, une écriture dédiée ; il ne modifie jamais silencieusement une vente ou un paiement.

## Banque et rapprochement

Les relevés importés sont privés, validés par type/taille et convertis en lignes inertes : aucune formule ou instruction n’est exécutée. Les suggestions utilisent montant, devise, date et référence, mais restent `SUGGESTED` jusqu’à confirmation autorisée. Frais et intérêts nécessitent une action explicite et une règle comptable statique.

## Audit et rollback

Toutes les transitions écrivent `ApiLog`, `AuditLog` et `EnterpriseOperationalEvent`. Le rollback désactive les modules et nouvelles confirmations, tout en conservant paiements, transactions, rapprochements et consultation historique.
