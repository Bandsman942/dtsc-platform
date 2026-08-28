# Issue #511 — Orchestration des validations comptables

## Objectif

Étendre le contrat partagé `EnterpriseApproval` aux validations humaines Finance sans affaiblir les barrières d'exécution comptable.

## Source de vérité

`EnterpriseApproval` reste l'unique source commune pour une validation ouverte. L'objet métier garde son propre statut et sa révision, mais aucune décision humaine migrée par #511 n'est autorisée sans affectation explicite et revalidation backend du validateur.

## Cibles

| Domaine | Cible EnterpriseApproval | Module | Étape d'exécution conservée séparée |
| --- | --- | --- | --- |
| Écriture | `EnterpriseJournalEntry` | `FINANCE_ACCOUNTING` | POST |
| Paiement | `EnterprisePayment` | `FINANCE_PAYMENTS` | CONFIRM / REVERSE |
| Facture client | `EnterpriseSalesInvoice` | `FINANCE_RECEIVABLES` | ISSUE / posting |
| Facture fournisseur — revue | `EnterpriseSupplierInvoiceReview` | `FINANCE_PAYABLES` | POST |
| Facture fournisseur — approbation | `EnterpriseSupplierInvoiceApproval` | `FINANCE_PAYABLES` | POST |
| Clôture financière | `EnterpriseFinancialClose` | `FINANCE_CLOSE` | CLOSE / REOPEN |
| Session de caisse | `EnterpriseCashSession` | `FINANCE_CASH` | posting des écarts après validation |
| Rapprochement | `EnterpriseReconciliationSession` | `FINANCE_RECONCILIATION` | mise à jour finale après validation |

Les soldes d'ouverture et avoirs client/fournisseur ont des cibles dédiées et leur approbation doit être séparée du posting avant activation du contrat commun.

## Facture fournisseur multi-étapes

La soumission choisit deux responsables distincts : reviewer puis approver. La revue est créée `PENDING`. L'approbation finale est créée `QUEUED`, donc absente du Centre des actions, puis activée en `PENDING` uniquement après la décision de revue. L'éligibilité de l'approbateur final est revalidée au moment de cette activation.

## Self-approval

Le contrat de #509 reste opposable : une auto-validation n'est admissible que si aucun autre candidat éligible existe et si la politique d'organisation autorise explicitement la dérogation pour le module. Cette dérogation ne s'applique jamais aux étapes POST, CONFIRM, REVERSE, CLOSE ou REOPEN.

## Multi-tenant et RBAC

- `organizationId` est imposé sur les lectures et écritures ;
- le candidat est issu du backend via le contrat `approval-candidates` ;
- membership actif et permission du module sont revalidés au moment de la décision ;
- aucune affectation cross-tenant ;
- aucune permission globale DTSC implicite.

## Centre des actions

Toutes les cibles #511 possèdent une projection module + deep-link canonique dans `lib/enterprise/approval-targets.ts`. Les validations `QUEUED` ne sont pas exposées tant qu'elles ne sont pas activées.

## Rollback

Le changement est applicatif et n'ajoute aucune migration Prisma. Un revert restaure les anciennes routes de décision. Les `EnterpriseApproval` déjà créées restent auditables ; aucune donnée métier n'est supprimée.

## Validation

La QA #511 doit vérifier les affectations, la séquence fournisseur, la revalidation tenant/RBAC, le Centre des actions et l'absence de contournement des barrières d'exécution. OWNER_E2E FR/EN mobile + desktop est obligatoire avant merge.