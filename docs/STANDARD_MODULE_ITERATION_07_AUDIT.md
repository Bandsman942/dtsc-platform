# Audit des modules standards — Itération 07

**Baseline :** `338ac9ab30b5c4280692efc5488b181aa66f2971`
**PR temporaire #74 :** fermée sans fusion ; uniquement un workflow d’export.
**Dette constatée :** page monolithique, aliases divergents, limites fixes, mutations de réconciliation et bootstrap au rendu, guides Console absents.

## Correction

- architecture par section et routes canoniques ;
- lectures sans effet de bord ;
- pagination serveur ;
- capacités Console explicites ;
- protection des derniers administrateurs ;
- versionnement plans/publications ;
- support SLA ;
- incidents et feature flags persistés ;
- retries webhook idempotents et redacted ;
- exports bornés et audités ;
- i18n, guides et Kanban itération 7.

## Limites honnêtes

Les E2E propriétaire restent non exécutés. Les connecteurs externes non présents ne produisent aucun faux KPI. Les exports volumineux asynchrones restent une extension future au-delà du seuil synchrone de 5 000 lignes.
