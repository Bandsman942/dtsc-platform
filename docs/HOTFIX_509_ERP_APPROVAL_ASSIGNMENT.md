# Hotfix #509 — Affectation des validateurs ERP

## Objectif

Le hotfix #509 remplace les sélecteurs de membres non qualifiés et les validations implicites par un contrat transverse : une action soumise à validation possède un validateur explicite, vérifié côté serveur dans la même entreprise et selon les droits du module concerné. Les validations ouvertes sont matérialisées par `EnterpriseApproval` et deviennent visibles dans le Centre des actions en cours.

## Contrat d’affectation

La primitive `lib/enterprise/approval-assignment.ts` vérifie, dans cet ordre :

1. l’organisation et le module canonique ;
2. l’accès `submit` du demandeur ;
3. le membership actif du validateur dans la même organisation ;
4. l’accès `approve` réel du validateur, après entitlement, activation du module et permissions de poste/rôle ;
5. l’absence d’un autre validateur admissible avant toute auto-validation de secours ;
6. l’activation explicite de la politique d’auto-validation pour ce module.

La liste de candidats affichée à l’utilisateur vient de `/api/enterprise/[organizationId]/approval-candidates`. Le client ne transmet jamais une permission technique à interpréter comme autorité.

## Auto-validation de secours

La dérogation est **désactivée par défaut**. Elle est enregistrée dans `Organization.settingsJson.approvalPolicy.selfApprovalModuleCodes` et configurée dans Administration entreprise > Rôles & permissions.

Même activée, elle n’autorise pas une auto-validation générale : elle ne devient utilisable que si aucun autre membre actif de la même entreprise ne possède encore la capacité d’approuver le module. Le backend revalide cette condition au moment de la décision. Son utilisation est enregistrée dans l’historique métier/audit.

Cette règle constitue l’exception gouvernée à la séparation des fonctions pour les entreprises mono-utilisateur ou temporairement sans second validateur. Elle ne doit jamais être transposée à une autre action sensible sans passer par le même contrat.

## Centre des actions en cours

`EnterpriseApproval` reste la source de vérité des validations ouvertes. Le centre présente les objets métier avec leur libellé, leur module et un lien profond. Les familles actuellement résolues comprennent notamment : transferts de trésorerie, tâches, demandes, réunions, achats, budgets, dépenses, incidents qualité pharmacie, congés, contrats de travail, feuilles de temps et paies.

Une validation décidée ou annulée sort de la file `PENDING` ; elle n’est donc plus présentée comme action ouverte.

## Rôles et postes guidés

Les rôles et postes personnalisés ne demandent plus de saisir des permissions telles que `enterprise.*`. L’administrateur choisit des capacités métier localisées — consulter, créer/soumettre, modifier, approuver/valider, administrer — uniquement pour les modules actifs et autorisés de l’entreprise. Le backend dérive les permissions techniques à partir du registre canonique et refuse tout module hors catalogue tenant.

## Sécurité

- toutes les lectures/écritures restent filtrées par `organizationId` ;
- un validateur doit rester membre actif au moment de l’affectation et de la décision ;
- l’UI n’est jamais la barrière de sécurité ;
- les permissions globales DTSC ne sont pas exposées ni acceptées comme entrée client ;
- la concurrence continue d’utiliser les révisions des agrégats et des validations ;
- aucune migration destructive ni backfill n’est introduit par ce hotfix.

## QA opposable

Le contrat statique transverse est vérifié par :

```bash
node scripts/qa-erp-approval-assignment-509.mjs
```

Il est également injecté en tête de `scripts/run-regression-qa-ci.mjs`. Les Quality Gates restent la preuve pour type-check, migrations, régression, lint et build. L’OWNER_E2E reste requis avant merge pour les parcours rendus, en desktop/mobile et FR/EN.

## Rollback

Un revert applicatif suffit. La clé additive `approvalPolicy` reste sans effet sur une version antérieure. Aucune donnée métier ou historique de validation ne doit être supprimé pendant un rollback.
