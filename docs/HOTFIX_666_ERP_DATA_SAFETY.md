# Hotfix #666 — ERP Data Safety

## Objet

Ce hotfix protège les mutations ERP contre deux valeurs implicites qui pouvaient modifier le sens métier d’une opération : une devise USD inventée et une date dérivée du jour UTC au lieu du jour de l’entreprise.

Le correctif introduit un contexte métier canonique, résolu côté serveur depuis :

- `Organization.timezone` pour la date métier ;
- `EnterpriseFinanceConfiguration.functionalCurrencyCode` pour la devise fonctionnelle ;
- l’organisation active et l’appartenance active pour l’accès au contexte depuis le navigateur.

Aucune migration Prisma n’est ajoutée.

## Contrat

`lib/enterprise/business-context.ts` est la primitive serveur de référence.

- `getEnterpriseBusinessContext()` résout le fuseau et la devise fonctionnelle.
- `formatEnterpriseBusinessDate()` produit un `YYYY-MM-DD` dans le fuseau de l’entreprise avec `Intl.DateTimeFormat(..., { timeZone })`.
- `resolveEnterpriseBusinessDate()` est utilisé pour les références métier visibles.
- `requireEnterpriseFunctionalCurrency()` échoue avec `ENTERPRISE_CURRENCY_CONFIGURATION_REQUIRED` lorsqu’une opération exige une devise fonctionnelle mais que Finance n’est pas configuré.
- un fuseau invalide échoue avec `ORGANIZATION_TIMEZONE_INVALID`.

Les erreurs sont traduites par le contrat de domaine existant ; aucune exception technique brute n’est destinée à l’utilisateur.

## Périmètre migré

Le hotfix retire les fallbacks USD silencieux des schémas Budget, Achat et réapprovisionnement Manufacturing, du dispatcher Core v2, de la création de dépenses et des principaux formulaires actifs Finance/RH/Paie/Achats/Projets/Manufacturing.

Les références visibles de Procurement, Budgets, Dépenses, Rapports Finance, Manufacturing, Tailoring et Gaming utilisent désormais la date métier de l’entreprise.

Les formulaires Finance actifs de facturation et paiement consomment le contexte métier via l’endpoint tenant-scoped `/api/enterprise/[organizationId]/business-context`.

## Compatibilité

Les valeurs déjà persistées ne sont pas réécrites. Le changement est volontairement fail-closed pour les nouvelles opérations : lorsqu’une devise obligatoire n’est pas disponible, l’utilisateur doit corriger la configuration plutôt que créer une donnée en USD par défaut.

Les usages d’USD qui représentent une vraie coupure monétaire, une donnée de démonstration, un référentiel de pays ou un historique existant ne sont pas supprimés par ce hotfix.

## Rollback

Le rollback applicatif consiste à revert la PR du hotfix. Aucun rollback de schéma ou de données n’est nécessaire.

## Validation

CI attendue :

- `pnpm qa:hotfix-666`
- `pnpm qa:regression`
- `pnpm type-check`
- `pnpm lint`
- `pnpm build`

La recette OWNER_E2E est documentée dans `docs/OWNER_E2E_666_ERP_DATA_SAFETY.md`.
