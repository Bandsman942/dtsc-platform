# Hotfix #523 — Historique FX Mobile Money et diagnostic comptable

## Incident

Une conversion entre deux wallets Mobile Money du même opérateur pouvait être durablement confirmée côté Trésorerie tout en restant absente de l’historique Mobile Money. Dans le contrat historique, lorsque le posting comptable échouait après ce commit, l’API renvoyait `PENDING`, mais la cause précise pouvait être perdue et l’interface afficher un avertissement Finance générique.

## Causes historiques

- l’historique Mobile Money chargeait uniquement `EnterpriseMobileMoneyTransaction` et ignorait `EnterpriseMobileMoneyFxTransfer` ;
- la route FX pouvait jeter/ignorer la cause du posting après un transfert déjà durable ;
- `postBusinessEvent()` devait conserver les `EnterpriseAccountingError` sur un batch durable pour permettre une reprise explicable ;
- le message générique pouvait faire croire qu’une configuration sans rapport, par exemple la fiscalité, était nécessaire au posting FX.

## Contrat corrigé et évolution #602

- toute conversion FX durable reste présente dans l’historique Mobile Money ;
- l’historique distingue une conversion comptabilisée, une conversion contrepassée et un ancien transfert durable dont la comptabilisation reste en attente ;
- la ligne conserve le montant source, le montant cible, la paire de devises, le taux, l’opérateur et la date ;
- les erreurs comptables structurées des parcours récupérables sont conservées dans `EnterprisePostingBatch.errorCode` sans changement de schéma ;
- les messages de reprise `PENDING` restent spécifiques au blocker réel : journal Mobile Money, période comptable, taux Finance, compte ledger, mapping ou configuration comptable ;
- les messages restent bilingues et n’exposent ni stack, ni SQL, ni détails Prisma ;
- le GET d’historique reste strictement en lecture seule et ne tente jamais de posting ;
- l’endpoint dédié de reprise reste tenant-scoped et idempotent : il reposte un transfert durable existant sans recréer ni rejouer ses mouvements de wallets.

Depuis #602, **une nouvelle conversion FX manuelle ne suit plus le modèle deux-phases**. La création du transfert, les mouvements Trésorerie et le posting comptable sont exécutés dans la même transaction. Un échec de posting rollbacke donc la tentative locale entière et la route de création ne renvoie plus de `PENDING` comptable post-commit. Une création réussie expose directement `accounting.status = POSTED` et l’identifiant de l’écriture postée.

La reprise et les diagnostics #523 restent nécessaires pour les transferts durables hérités du contrat précédent ou tout objet historique déjà présent avant le cutover #602.

## Fiscalité

La fiscalité n’est pas un blocker global de `assertFinanceReady()` pour `RETAIL_MOBILE_MONEY_FX_POSTED`. Une fiscalité incomplète ne doit donc pas être présentée comme la cause du blocage d’une conversion FX sauf si un futur contrat comptable l’exige explicitement.

## Données / Prisma

Aucune migration. Les colonnes `errorCode` et `errorMessage` existent déjà sur `EnterprisePostingBatch`. #602 ne modifie aucune migration historique.

## Dette suivie

#602 clôt le cutover atomique pour la **création FX Mobile Money manuelle**. Les autres flux encore deux-phases, notamment certains parcours historiques ou impliquant un provider externe, restent suivis dans la dette comptable globale #521/#599 et ne doivent pas être confondus avec ce cutover.
