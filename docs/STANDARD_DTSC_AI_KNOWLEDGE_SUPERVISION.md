# Supervision RAG/CAG et signaux de sécurité IA — AI-CONSOLE-04

Le Centre IA `/admin/ai-control-center` affiche uniquement des agrégats de métadonnées sous la permission `CONSOLE_AI_READ` et le contexte `DTSC_INTERNAL`, sans aucune donnée privée d'entreprise ou de personne.

## Sources canoniques

- `KnowledgeDocument.status` : sources personnelles, selon `createdAt`.
- `EnterpriseAiKnowledgeSource.status` : sources entreprises non archivées, selon `createdAt`.
- `AiModelCall` : échecs et annulations classés par code motif, distincts des tentatives de fournisseur.
- `AiToolExecution` : refus de passerelle outillée, classés par code motif et non par identité utilisateur.
- `buildAiCagPack` : utilisation CAG sans compteur persistant certifié à ce jour, donc `NOT_INSTRUMENTED`.
- Alertes configurables de sécurité : `NOT_CONFIGURED` tant qu'une source d'autorité auditée n'a pas été livrée.

La période est bornée, le rafraîchissement visible et chaque panne de requête doit produire `null` / « indisponible », sans afficher des zéros trompeurs. Le statut documentaire `READY` signifie une indexation enregistrée comme complète, pas la preuve que le retrieval a abouti ou qu'une citation a été effectivement utilisée.

## Hors de portée de cette première tranche

Aucune nouvelle table de documents ni index parallèle. Aucune extraction ou reindexation globale déclenchée. Les alertes gouvernées, la preuve de citations et les versions d'index suivront dans cette même issue #804, sans valeurs extrapolées.

## QA et E2E

`pnpm qa:console-ai-knowledge`, `pnpm qa:standard-dtsc-console`, `pnpm qa:regression`, type-check, lint, build ; E2E #804 seulement lorsque les critères d'acceptation sont entièrement satisfaits (RAG personnel/entreprise, refus de lecture tenant, sources vides, sources échouées, FR/EN, mobile, absence de données privées).

**Rollback** : revert des composants de consultation sans modification du stockage de connaissance, sans backfill ni révocation de tokens.
