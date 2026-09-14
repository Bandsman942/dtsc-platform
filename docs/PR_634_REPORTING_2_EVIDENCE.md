# Issue #634 / PR #635 — Reporting 2.0 evidence

Ce document suit la convention de preuve de `docs/CONTRIBUTING.md`. Une inspection de code ou l’ajout d’un script QA ne vaut pas exécution.

## Matrice de preuves avant CI

| Contrôle | Statut | Preuve |
|---|---|---|
| diff check | NOT_EXECUTED | À produire par CI ou environnement local autorisé |
| Prisma generate | NOT_EXECUTED | À produire par CI |
| migrations / scratch parity | NOT_EXECUTED | Migration additive présente ; exécution à prouver par CI |
| type-check | NOT_EXECUTED | À produire par CI |
| lint | NOT_EXECUTED | À produire par CI |
| QA ciblée `qa-reporting-2-634.mjs` | NOT_EXECUTED | Script ajouté et branché à la régression ; non exécuté ici |
| `qa-professional-reports-317.mjs` | NOT_EXECUTED | Régression historique à exécuter en CI |
| regression QA | NOT_EXECUTED | À produire par CI |
| build | NOT_EXECUTED | À produire par CI |
| OWNER_E2E | NOT_EXECUTED | Requis avant fusion |

## Invariants inspectés dans le diff

Ces éléments décrivent le code présent ; ils ne sont pas présentés comme des tests réussis :

- catalogue serveur comme source des types/filtres ;
- revalidation tenant des références ;
- `REPORT_NO_DATA` avant création d’un snapshot vide ;
- budget vs réalisé v2 avec montants séparés par devise ;
- PDF v2 multi-page ;
- planification additive et idempotente par `(organizationId, scheduleId, dueAt)` ;
- réutilisation de `enqueueFinanceReportGeneration` ;
- sécurité manager-only pour les destinataires de planification ;
- outil IA `ERP_REPORT_ANALYSIS_READ` branché au gateway canonique ;
- visibilité `REPORTS`, plan et permission IA conservés ;
- analyse IA bornée au snapshot persisté ;
- anti-causalité et `INSUFFICIENT_DATA` explicites.

## Checklist OWNER_E2E

- [ ] Rapport avec données réellement généré et consultable.
- [ ] Périmètre vide : message métier, aucun rapport vide créé.
- [ ] Cross-tenant négatif sur budget/département/fournisseur.
- [ ] Mobile 320 px.
- [ ] Mobile 360 px.
- [ ] Mobile 375 px.
- [ ] Mobile 390 px.
- [ ] Mobile 414 px.
- [ ] Tablette 768 px.
- [ ] Desktop 1024 px et plus.
- [ ] Aucun overflow horizontal global.
- [ ] PDF ouvert dans un lecteur réel, multi-page et lisible.
- [ ] XLSX ouvert dans Excel/LibreOffice-compatible, feuilles et graphique lisibles.
- [ ] CSV ouvert et données cohérentes.
- [ ] Planification quotidienne/hebdomadaire/mensuelle au moins sur un scénario représentatif.
- [ ] Pause/reprise/archivage d’une planification.
- [ ] Livraison e-mail si Zoho est configuré.
- [ ] État métier correct si e-mail indisponible.
- [ ] Utilisateur sans `REPORTS.manage` ne voit pas les destinataires/planifications.
- [ ] DTSC AI analyse un rapport visible et cite les valeurs pertinentes.
- [ ] DTSC AI refuse un rapport non visible ou un utilisateur sans accès.
- [ ] DTSC AI indique clairement que l’interprétation est générée par IA.
- [ ] DTSC AI n’invente pas une cause absente du snapshot.
- [ ] DTSC AI retourne/signale données insuffisantes sur un snapshot sans preuve exploitable.
- [ ] FR.
- [ ] EN.
- [ ] Mode clair.
- [ ] Mode sombre.
- [ ] Clavier/focus/cibles tactiles.

## Mise à jour de ce document

Après les Quality Gates, remplacer uniquement les statuts réellement prouvés par `CI_PROVEN` et référencer les workflow runs correspondants. Après validation manuelle du propriétaire, marquer uniquement les scénarios réellement exécutés `OWNER_E2E` dans la PR et conserver la référence de la validation.
