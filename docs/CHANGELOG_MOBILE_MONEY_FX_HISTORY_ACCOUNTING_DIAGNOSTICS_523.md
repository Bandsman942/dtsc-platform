# Hotfix #523 — Historique FX Mobile Money et diagnostic comptable

## Incident

Une conversion entre deux wallets Mobile Money du même opérateur pouvait être durablement confirmée côté Trésorerie tout en restant absente de l’historique Mobile Money. Lorsque le posting comptable échouait, l’API renvoyait correctement `PENDING` depuis #522 mais supprimait la cause précise et l’interface affichait un avertissement Finance générique.

## Causes

- l’historique Mobile Money chargeait uniquement `EnterpriseMobileMoneyTransaction` et ignorait `EnterpriseMobileMoneyFxTransfer` ;
- la route FX faisait `void accountingError` après un échec de posting ;
- `postBusinessEvent()` ne persistait pas les `EnterpriseAccountingError` sur un batch durable lorsque la transaction de posting était annulée ;
- le message générique pouvait faire croire qu’une configuration sans rapport, par exemple la fiscalité, était nécessaire au posting FX.

## Contrat corrigé

- toute conversion FX durable est présente dans l’historique Mobile Money ;
- l’historique distingue une conversion comptabilisée, une conversion contrepassée et une conversion dont la comptabilisation reste en attente ;
- la ligne conserve le montant source, le montant cible, la paire de devises, le taux, l’opérateur et la date ;
- les erreurs comptables structurées sont conservées dans `EnterprisePostingBatch.errorCode` sans changement de schéma ;
- le toast `PENDING` utilise un message métier spécifique au blocker réel : journal Mobile Money, période comptable, taux Finance, compte ledger, mapping ou configuration comptable ;
- les messages restent bilingues et n’exposent ni stack, ni SQL, ni détails Prisma ;
- le GET d’historique reste strictement en lecture seule et ne tente jamais de posting ;
- l’idempotence existante reste l’autorité pour une reprise : un retry du même transfert ne rejoue pas les mouvements de wallets.

## Fiscalité

La fiscalité n’est pas un blocker global de `assertFinanceReady()` pour `RETAIL_MOBILE_MONEY_FX_POSTED`. Une fiscalité incomplète ne doit donc pas être présentée comme la cause du blocage d’une conversion FX sauf si un futur contrat comptable l’exige explicitement.

## Données / Prisma

Aucune migration. Les colonnes `errorCode` et `errorMessage` existent déjà sur `EnterprisePostingBatch`. Le hotfix ne modifie aucune migration historique.

## Dette suivie

L’atomicité complète entre mouvement métier/Trésorerie et posting comptable reste suivie dans #521. Le présent hotfix améliore la visibilité, la récupération et la vérité UI sans introduire une transaction imbriquée risquée.
