# Inventaire des guides utilisateurs ERP

| Famille | Guides embarqués | État |
|---|---|---|
| Référentiels, CRM, ventes, contrats | aide entreprise et guides professionnels | alignement vérifié par QA |
| Achats, stock, RH, temps, paie, projets, actifs | guides de module et aide contextuelle | alignement vérifié par QA |
| Finance | `lib/enterprise/finance-user-guides.ts`, dont `FINANCE_OVERVIEW` | guide exact requis |
| Health | `lib/enterprise/sector-user-guides.ts` | guide spécialisé exact requis |
| Pharmacy | `lib/enterprise/sector-user-guides.ts` | guide spécialisé exact requis |
| Consolidation | `ERP_FINAL_CONSOLIDATION_USER_GUIDE.md` | nouveau |

La QA refuse un module professionnel sans guide accessible depuis le module. Un guide ne doit citer ni bouton, ni permission, ni workflow inexistant. Les changements fonctionnels exigent une mise à jour simultanée du guide.

Codes audités : `HEALTH` et `PHARMACY`.
