# WF-01 — Contrats ERP et catalogue (#814)

## Contrat unique

`getWorkflowContractReadiness` relie le graphe, les champs typés, événements, actions, textes autorisés et la fonction de création d’approbation de l’adaptateur. Le catalogue et la publication exécutent ce même contrôle. Une compatibilité structurelle ne remplace pas les vérifications d’affectation, d’habilitation, de tenant, de séparation des tâches, de révision et d’état métier à l’exécution.

| Modèle livré | Compatibilité | Service / limite |
|---|---|---|
| REQUEST_MANAGER_APPROVAL | Disponible en brouillon | `createEnterpriseApproval`, demande soumise, responsable de département distinct ; tâche et notification après décision |
| PURCHASE_APPROVAL | Disponible en brouillon | `createEnterprisePurchaseApproval` ; après soumission, rattachement de la demande existante au même approbateur |
| BUDGET_APPROVAL | Disponible en brouillon | `createEnterpriseBudgetApproval` ; rattachement de la validation budgétaire existante |
| EXPENSE_APPROVAL | Disponible en brouillon | `createEnterpriseExpenseApproval` ; rattachement de la validation de dépense existante |
| SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING | Incompatible | Le workflow ne crée pas les validations Finance de revue/approbation ; REVIEW et APPROVE ne sont pas autorisés |
| SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION | Incompatible | Le workflow ne demande pas la validation Finance du paiement ; APPROVE non autorisé |
| CASH_SESSION_INDEPENDENT_CLOSE | Incompatible | Validation indépendante dans le service de caisse ; aucune action VALIDATE dans l’adaptateur |
| MANUAL_JOURNAL_APPROVAL_POSTING | Incompatible | Approbation par le service comptable ; aucune action APPROVE automatisée |
| FISCAL_PERIOD_CLOSE_REVIEW | Incompatible | La validation appartient à la clôture financière, pas directement à la période |

Les modèles incompatibles restent identifiables dans le catalogue, avec une raison FR/EN et un bouton de création désactivé. Le serveur refuse aussi la création, sans brouillon orphelin. Les brouillons existants sont conservés et leur publication échoue avec les mêmes bloqueurs. Aucune action financière ni autorisation n’est ajoutée pour rendre ces modèles exécutables.

Les cibles supplémentaires Task et Meeting utilisent la même fonction canonique d’approbation Core v2. Report et les dix cibles financières n’exposent pas `createApproval`. Les actions financières déjà autorisées restent déléguées à leurs services existants, avec leurs contrôles métier inchangés.

## Transitions et état courant

- Les champs autorisés sont une `ReadonlyMap` avec type STRING, NUMBER, DATE ou BOOLEAN ; les sélections Prisma chargent ces mêmes champs.
- Les montants acceptent des nombres ou des chaînes décimales et se comparent avec `Prisma.Decimal`. Les dates acceptent une date ISO ou un instant ISO avec fuseau. Une liste doit être non vide et homogène. EXISTS/NOT_EXISTS n’ont pas de valeur. Une valeur source absente ne vaut jamais zéro ou une chaîne vide.
- Chaque transition est vérifiée, y compris celles extérieures aux étapes CONDITION. Les résultats doivent être possibles pour le type d’étape. Chaque résultat, dont CANCELLED pour une validation, doit avoir une suite sans condition après les branches conditionnelles. Des priorités identiques applicables au même résultat, ou une branche masquée par un repli précédent, bloquent la publication. Le validateur ne prétend pas démontrer que deux prédicats arbitraires couvrent tous les cas.
- Après DOMAIN_ACTION ou retour de CREATE_APPROVAL, le moteur recharge l’objet dans le tenant source avant de choisir la transition. Il refuse une autre identité, un autre tenant ou une révision inférieure à la révision connue. Une révision plus récente est évaluée telle quelle ; le service de la prochaine action revérifie son état et sa révision.
- Les correspondances source/module viennent de `cross-module/deep-links.ts`, puis sont résolues par le registre ERP canonique. Le workflow n’entretient plus de table de modules concurrente. Les règles sectorielles et d’abonnement restent celles des services canoniques.

## Compatibilité et livraison

Aucune migration, aucun backfill, aucune mutation des versions publiées ni du catalogue `EnterpriseWorkflow` historique. Les brouillons existants peuvent présenter de nouveaux bloqueurs à corriger avant publication. Les contrôles runtime de champs et capacités s’appliquent aussi aux versions déjà publiées ; aucun statut métier n’est réparé automatiquement.

Dépend de WF-00 (#813 / PR #831). Rebaser depuis main après livraison de WF-00, résoudre les chevauchements du moteur et rejouer les deux suites PostgreSQL avant fusion. Les fixtures WF-00 utilisant un adaptateur simulé doivent alors porter le tenant/identité de l’objet et la fonction `createApproval` correspondant à la nouvelle interface. Ne pas affaiblir ces vérifications pour conserver un faux adaptateur incomplet.

Rollback par revert applicatif, après arrêt des nouveaux lancements si nécessaire ; conserver les définitions et l’historique. Ne jamais forcer une approbation financière ou rejouer une action pour contourner un blocage. Production uniquement depuis `main`, sans Preview Vercel. OWNER_E2E requis.

## Preuves

- `qa:workflow-contracts` : neuf modèles réels, dix-sept adaptateurs, fonctions canoniques observées à leur frontière, types confrontés au schéma Prisma, conditions/branches, rechargement et messages FR/EN. Les services métier y sont des espions, pas une preuve de leur exécution.
- `qa:workflow-contracts:postgres` : services d’approbation réels sur PostgreSQL, six cibles, décisions concurrentes, tenant/acteur/révision/rôle, neuf créations de modèles et exécution complète des quatre modèles compatibles, publication immuable, contrôles sectoriels et choix post-action par le moteur réel. Seuls l’abonnement de test et le push externe sont simulés ; les services de comptabilisation non sollicités refusent tout appel.
- Les jobs Quality et Migration exécutent la suite PostgreSQL. Aucun E2E propriétaire, affichage navigateur ou déploiement n’est déduit de ces résultats. La matrice de preuve de la PR consigne les exécutions effectivement terminées.
