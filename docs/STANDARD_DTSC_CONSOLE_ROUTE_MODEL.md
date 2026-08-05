# Modèle de routes Console DTSC

La source canonique est `lib/console/console-routes.ts`.

| Canonique | Aliases historiques |
|---|---|
| `/admin` | `section=overview` |
| `/admin/module-maturity` | `/admin/erp-readiness`, `erpReadiness` |
| `/admin/organizations` | `clientOrganizations` |
| `/admin/subscriptions` | `billing` |
| `/admin/content` | `publications` |
| `/admin/security-audit` | `audits` |
| `/admin/platform-settings` | `settings` |
| `/admin/support` | `activity` |
| `/admin/hr-cfo` | `hrCfo` |
| `/admin/legal` | `la` |

Les filtres sont conservés lors de la normalisation. Un alias ne redirige qu’une fois et ne produit jamais de boucle. Les liens du registre, de la navigation et des guides utilisent les routes canoniques.
