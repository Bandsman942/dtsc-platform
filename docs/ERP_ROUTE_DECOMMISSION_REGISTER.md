# ERP — Registre de décommissionnement des routes

| Route | État | Remplacement | Comportement Release A |
|---|---|---|---|
| `POST /api/enterprise/:organizationId/core` | RETIRED | routes Core v2 dédiées | `410 Gone`, audit de tentative |
| `PATCH /api/enterprise/:organizationId/core/:id` | RETIRED | routes Core v2 dédiées | `410 Gone`, audit de tentative |
| `POST /api/enterprise/:organizationId/healthcare` | RETIRED | APIs Health dédiées | `410 Gone`, aucune donnée clinique journalisée |
| `POST /api/enterprise/:organizationId/pharmacy` | RETIRED | APIs Pharmacy dédiées | `410 Gone` |
| mutation workflow via `/administration` | RETIRED | Workflow Engine v2 | `410 Gone` |
| `GET` Core/Sector historique | READ_ONLY | archive | lecture paginée, permissions et tenant obligatoires |
| anciens liens de modules | REDIRECT/ALIAS | registre canonique | Redirection uniquement si destination autorisée |
| `/documents` | REDIRECT | `/company` | compatibilité historique documentée |

## Règles de redirection

Une Redirection conserve uniquement les paramètres utiles, vérifie l’accès à la destination, ne crée pas de boucle et ne transforme jamais une ancienne mutation en succès silencieux. Les nouvelles notifications utilisent seulement les routes canoniques ; les anciennes notifications peuvent conserver un alias de lecture historique.

## Observabilité

Chaque appel mutant retiré produit une réponse explicite, un `ApiLog` avec `deprecatedRouteHit` et un `AuditLog` avec l’action bloquée. Les lectures normales ne génèrent pas de log verbeux supplémentaire.
