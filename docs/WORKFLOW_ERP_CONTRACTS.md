# WF-01 — Contrats ERP et catalogue (#814)

## Contrat unique

`getWorkflowContractReadiness` relie le graphe, les champs typés, événements, actions, textes autorisés et la fonction de création d’approbation de l’adaptateur. Le catalogue et la publication exécutent ce même contrôle. Une compatibilité structurelle ne remplace pas les vérifications d’affectation, d’habilitation, de tenant, de séparation des tâches, de révision et d’état métier à l’exécution.

| Modèle livré | Compatibilité | Service / limite |
|---|---|---|
| REQUEST_MANAGER_APPROVAL | Disponible en brouillon | `createEnterpriseApproval`, demande soumise, responsable de département distinct ; tâche et notification après décision |
| PURCHASE_APPROVAL | Disponible en brouillon | `createEnterprisePurchaseApproval` ; après soumission, rattachement de la demande existante au même approbateur |
| BUDGET_APPROVAL | Disponible en brouillon | `createEnterpriseBudgetApproval` ; rattachement de la validation budgétaire existante |
| EXPENSE_APPROVAL | Disponible en brouillon | `createEnterpriseExpenseApproval` ; rattachement de la validation de dépense existante |
| SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING | Disponible comme suivi de validations | Deux approbations canoniques distinctes `EnterpriseSupplierInvoiceReview` puis `EnterpriseSupplierInvoiceApproval`, rattachées au même objet ; `POST` demeure humain et contrôlé dans Factures fournisseurs |
| SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION | Disponible comme suivi de validation | Suivi de `EnterprisePayment` sans recréer de validation ; `CONFIRM` reste une action distincte du module Paiements, avec SoD et caisse active |
| CASH_SESSION_INDEPENDENT_CLOSE | Disponible comme suivi de validation | `EnterpriseCashSession` est validée par le service Caisse, sans exposer de `VALIDATE` générique |
| MANUAL_JOURNAL_APPROVAL_POSTING | Disponible comme suivi de validation | `EnterpriseJournalEntry` est approuvée dans Comptabilité ; `POST` reste une action canonique et séparée |
| FISCAL_PERIOD_CLOSE_REVIEW | Disponible comme suivi de validation | L'objet workflow est **`EnterpriseFinancialClose`** (pas `EnterpriseFiscalPeriod`) et suit l'approbation liée ; la fermeture définitive reste une action ERP distincte |

Les neuf modèles deviennent structurellement compatibles. Les cinq modèles Finance ajoutés dans le hotfix #861 **suivent seulement des approbations humaines canoniques déjà créées dans le module ERP**. Ils ne créent aucune demande d'approbation et ne déclenchent aucun POST, CONFIRM ou CLOSE automatique. Les intitulés et descriptions précisent que ces opérations restent à effectuer dans l'ERP par un acteur distinct et habilité. Le serveur bloque l'exécution si l'approbation canonique précise est absente, rattachée à un autre workflow, non habilitée, ou si la séparation des tâches est violée. La publication reste distincte de l'activation. Une modification de configuration non autorisée demeure incompatible et bloque la publication.

Les cibles supplémentaires Task et Meeting utilisent la même fonction canonique d’approbation Core v2. Report et les dix cibles financières n’exposent pas `createApproval`. Les actions financières déjà autorisées restent déléguées à leurs services existants, avec leurs contrôles métier inchangés.

## Transitions et état courant

- Les champs autorisés sont une `ReadonlyMap` avec type STRING, NUMBER, DATE ou BOOLEAN ; les sélections Prisma chargent ces mêmes champs.
- Les montants acceptent des nombres ou des chaînes décimales et se comparent avec `Prisma.Decimal`. Les dates acceptent une date ISO ou un instant ISO avec fuseau. Une liste doit être non vide et homogène. EXISTS/NOT_EXISTS n’ont pas de valeur. Une valeur source absente ne vaut jamais zéro ou une chaîne vide.
- Chaque transition est vérifiée, y compris celles extérieures aux étapes CONDITION. Les résultats doivent être possibles pour le type d’étape. Chaque résultat, dont CANCELLED pour une validation, doit avoir une suite sans condition après les branches conditionnelles. Des priorités identiques applicables au même résultat, ou une branche masquée par un repli précédent, bloquent la publication. Le validateur ne prétend pas démontrer que deux prédicats arbitraires couvrent tous les cas.
- Après DOMAIN_ACTION ou retour de CREATE_APPROVAL, le moteur recharge l’objet dans le tenant source avant de choisir la transition. Il refuse une autre identité, un autre tenant ou une révision inférieure à la révision connue. Une révision plus récente est évaluée telle quelle ; le service de la prochaine action revérifie son état et sa révision.
- Les correspondances source/module viennent de `cross-module/deep-links.ts`, puis sont résolues par le registre ERP canonique. Le workflow n’entretient plus de table de modules concurrente. Les règles sectorielles et d’abonnement restent celles des services canoniques.

## Compatibilité et livraison

Aucune migration, aucun backfill, aucune mutation des versions publiées ni du catalogue `EnterpriseWorkflow` historique. Les brouillons existants peuvent présenter de nouveaux bloqueurs à corriger avant publication. Les contrôles runtime de champs et capacités s’appliquent aussi aux versions déjà publiées ; aucun statut métier n’est réparé automatiquement.

WF-00 (#813 / PR #831) a été livré sur `main@393d681` ; WF-01 est réconcilié depuis cette base et les deux suites PostgreSQL sont obligatoires avant fusion. La création d’une **nouvelle** validation requiert toujours la capacité `adapter.createApproval` et les gardes du service métier canonique. En revanche, la récupération après crash d’une validation **déjà liée** au run et à sa step est une preuve persistée tenant-scoped : elle doit pouvoir reprendre même si l’adaptateur ne permet plus de créer une validation nouvelle. Cette exception de réconciliation n’autorise aucune nouvelle approbation et est couverte par la suite PostgreSQL WF-00.

Rollback par revert applicatif, après arrêt des nouveaux lancements si nécessaire ; conserver les définitions et l’historique. Ne jamais forcer une approbation financière ou rejouer une action pour contourner un blocage. Production uniquement depuis `main`, sans Preview Vercel. OWNER_E2E requis.

## Preuves

- `qa:workflow-contracts` : neuf modèles réels, dix-sept adaptateurs, fonctions canoniques observées à leur frontière, types confrontés au schéma Prisma, conditions/branches, rechargement et messages FR/EN. Les services métier y sont des espions, pas une preuve de leur exécution.
- `qa:workflow-contracts:postgres` : services d’approbation réels sur PostgreSQL, six cibles, décisions concurrentes, tenant/acteur/révision/rôle, neuf créations de modèles et exécution complète des quatre modèles compatibles, publication immuable, contrôles sectoriels et choix post-action par le moteur réel. Seuls l’abonnement de test et le push externe sont simulés ; les services de comptabilisation non sollicités refusent tout appel.
- Les jobs Quality et Migration exécutent la suite PostgreSQL. Aucun E2E propriétaire, affichage navigateur ou déploiement n’est déduit de ces résultats. La matrice de preuve de la PR consigne les exécutions effectivement terminées.


## HOTFIX #861 — raccordement strict aux services comptables (sans auto-comptabilisation)

Les nouvelles étapes `CREATE_APPROVAL` disposent d'un attribut typé optionnel `canonicalApprovalTarget`, dont les seules valeurs sont les six cibles de décision Finance documentées ci-dessus. Cette option est **réservée au rattachement d'une demande existante**, non à sa création. Les cibles autorisées proviennent de l'adaptateur canonique du type source ; source, identifiant métier, organisation cliente, appartenance active, approbateur et permission `approve` sont vérifiés. L'absence de demande métier crée une erreur explicite ; aucune validation fictive n'est créée.

Le cas de revue des factures fournisseurs est une chaîne de deux étapes distinctes. La deuxième demande canonique devient admissible après la revue par le service financier. Le moteur ne saute pas une revue, ne forge pas d'approbation et ne modifie pas l'état financier. Le worker reprend uniquement une validation dont le statut et les liens persistants satisfont toutes les contraintes. Plusieurs événements pour la même décision ne doivent pas doubler la notification ni les effets.

La clôture de période utilise dorénavant `EnterpriseFinancialClose` et son événement `FINANCIAL_CLOSE_SUBMITTED`. Une version publiée avec l'ancien type reste épinglée et immuable ; elle ne se transforme pas automatiquement en nouveau template. Les cinq codes de templates demeurent stables mais affichent des libellés adaptés à la limite réelle : le workflow est terminé lorsque la **validation** est terminée, et non lorsque l'opération comptable indépendante est exécutée. Cette distinction doit être montrée aux utilisateurs et validée en E2E.

## Préflight du worker et contrôle du backlog

Le hotfix #861 protège `/api/internal/workflows/process` par `WORKFLOW_WORKER_ENABLED=true` en Production en plus d'un secret. L'endpoint authentifié `GET ...?dryRun=1` ne traite aucun événement. Le claim PostgreSQL ne revendique jamais, en production, un événement précédant `WORKFLOW_EVENT_CUTOVER_AT` ; si cette variable est absente ou invalide, **aucun ancien événement n'est revendiqué**. Une validation déjà décidée avec lien `workflowRunId/workflowStepRunId` peut néanmoins être rapprochée par `resumeWaitingRuns` après activation contrôlée.

Le backlog de 424 anciens événements observé le 17/10/2026 reste à auditer par catégorie/ancienneté/tenant. Aucun rejeu massif de paiement, facture, stock, notification ou opération comptable ; ne pas changer directement la colonne processingStatus pour forcer leur traitement. La reprise d'une approbation déjà décidée dépend des liens canoniques, pas du ré-envoi de l'action ERP.
