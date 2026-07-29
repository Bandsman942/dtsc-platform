import fs from "node:fs";

const files = {
  technical: "docs/TECHNICAL_DOCUMENTATION.md",
  qa: "docs/QA_REGRESSION_CHECKLIST.md",
  changelog: "docs/CHANGELOG.md",
  agents: "AGENTS.md",
};

const sections = {
  technical: `

<!-- SPRINT_03_WORK_SCHEDULE -->
## Sprint 3 — disponibilités DTSC, exceptions, absences et calendrier effectif

Le planning interne DTSC sépare désormais trois concepts métier : **disponibilité hebdomadaire habituelle**, **exception ponctuelle** et **absence**. La table physique \`CollaboratorAvailability\` reste conservée pour préserver les données historiques, mais les nouveaux contrats métier/API/UI sont distincts et documentés dans \`docs/DTSC_WORK_SCHEDULE.md\`.

Principes techniques :

- écriture \`DTSC_INTERNAL\` strictement self-service : la cible est résolue par \`session.userId -> HrcfoEmployee.id\`; un \`collaboratorId\` arbitraire ne donne aucun droit d'écriture ;
- lecture organisationnelle séparée pour CEO, COO et HR & CFO sans transfert de propriété d'écriture ;
- disponibilité hebdomadaire canonique : \`Hebdomadaire + Disponible + dayOfWeek + effectiveFrom/effectiveUntil\` ;
- exception/absence canonique : entrée datée \`Aucune + specificDate + recurrenceUntil\` avec type contrôlé ;
- historique protégé par périodes d'effet et soft delete ; les données passées ne sont pas réécrites silencieusement ;
- \`detectCalendarConflicts()\` résout désormais la disponibilité effective en tenant compte des absences/exceptions et de la timezone utilisateur ;
- niveaux de conflit : blocage pour absence/congé/maladie/indisponibilité, avertissement pour mission/formation/chevauchement, information hors disponibilité déclarée ;
- notifications centralisées et sobres : absence significative vers COO/HR & CFO, mission/formation vers COO, sans motif privé dans le Web Push ;
- les entreprises clientes \`ORGANIZATION\` conservent le comportement calendrier historique dans ce Sprint afin d'éviter une réinterprétation arbitraire ;
- aucun lien planning → prestation → paie n'est créé. Les prestations réelles appartiennent au Sprint 4, la paie au Sprint 5.

Nouvelles routes :

- \`GET /api/calendar/my-schedule\` ;
- \`POST/PATCH/DELETE /api/calendar/availabilities\` pour le planning hebdomadaire self-service DTSC ;
- \`GET/POST/PATCH/DELETE /api/calendar/exceptions\` pour exceptions et absences DTSC.

La migration versionnée \`20260729011500_sprint03_work_schedule_boundaries\` est non destructive. Elle ne tente pas de convertir aveuglément les anciens statuts ambigus (par exemple une mission récurrente). Le resolver maintient une compatibilité de lecture avec les anciennes lignes.
<!-- /SPRINT_03_WORK_SCHEDULE -->
`,
  qa: `

<!-- SPRINT_03_WORK_SCHEDULE_QA -->
## Sprint 3 — planning DTSC / disponibilités / exceptions

### Autorisation critique

- [ ] CEO → PATCH disponibilité d'un autre collaborateur = 403.
- [ ] COO → DELETE disponibilité d'un autre collaborateur = 403.
- [ ] HR_CFO → POST avec \`collaboratorId\` d'un autre collaborateur = 403 ou cible serveur forcée sur soi.
- [ ] Collaborateur → CRUD de sa propre disponibilité = succès.
- [ ] COO/CEO/HR_CFO → lecture équipe autorisée selon leur rôle, sans boutons Modifier/Supprimer sur autrui.
- [ ] Une organisation ne peut jamais lire/écrire le planning d'une autre organisation.

### Planning et resolver

- [ ] Rejeter \`14:00 → 10:00\` et toute plage vide.
- [ ] Rejeter deux disponibilités hebdomadaires qui se chevauchent.
- [ ] Accepter des plages adjacentes sans fusion silencieuse.
- [ ] Disponibilité 08:00–17:00 + réunion 10:00–11:00 = pas de conflit de disponibilité.
- [ ] Disponibilité 08:00–17:00 + absence 08:00–12:00 + réunion 10:00 = conflit bloquant.
- [ ] Disponibilité 08:00–12:00 + réunion 15:00 = information hors disponibilité.
- [ ] Disponibilité exceptionnelle 18:00–20:00 + réunion 19:00 = créneau couvert.
- [ ] Absence partielle 08:00–12:00 sur planning 08:00–17:00 laisse 12:00–17:00 effectif.
- [ ] Absence multi-jours 3→7 août s'applique correctement à chaque journée.
- [ ] Tester une timezone non UTC, au minimum \`Africa/Kinshasa\`, sans hardcoder cette timezone comme seule valeur.

### Historique / confidentialité / notifications

- [ ] Une modification future versionne/clôture l'ancienne plage au lieu de réécrire le passé.
- [ ] PATCH/DELETE d'une exception déjà passée est refusé dans le workflow self-service.
- [ ] Le motif privé d'une absence n'est pas visible dans la vue opérationnelle CEO/COO.
- [ ] Le Web Push d'absence ne contient aucun détail médical ou motif privé.
- [ ] Un changement ordinaire de disponibilité ne spamme pas les responsables.

### UI / régressions

- [ ] \`Mon planning\` sépare Disponibilités habituelles / Exceptions / Absences.
- [ ] Vue équipe lecture seule avec filtres collaborateur lorsque autorisée.
- [ ] Mobile 320/375/390/414, tablette 768/1024, desktop 1440 : formulaires et menus restent utilisables.
- [ ] Clavier iOS, dropdowns, dialogues hauts, safe areas et bottom navigation ne régressent pas.
- [ ] Affichage explicite : disponibilité ≠ temps travaillé ≠ paie.
- [ ] \`pnpm prisma:generate\`, \`pnpm type-check\`, \`pnpm qa:regression\`, \`pnpm lint\` et \`pnpm build\` sont verts avant merge.
<!-- /SPRINT_03_WORK_SCHEDULE_QA -->
`,
  changelog: `

<!-- SPRINT_03_WORK_SCHEDULE_CHANGELOG -->
## 29 juillet 2026 — Sprint 3 : planning opérationnel DTSC

### Ajouté

- Workspace \`Mon planning\` avec disponibilités hebdomadaires, exceptions et absences séparées.
- API self-service DTSC et résumé hebdomadaire sans assimilation au temps travaillé.
- Resolver de disponibilité effective timezone-aware utilisé par les conflits calendrier.
- Absences partielles et multi-jours, disponibilité exceptionnelle, mission et formation.
- Vue équipe en lecture seule pour les responsables autorisés et confidentialité des motifs privés.
- Audit \`WORK_AVAILABILITY_*\` et \`WORK_SCHEDULE_EXCEPTION_*\`.
- Notifications sobres COO/HR & CFO selon l'impact opérationnel.
- Migration Prisma non destructive et documentation \`docs/DTSC_WORK_SCHEDULE.md\`.
- QA dédiée \`qa:work-schedule\` intégrée à la régression globale.

### Sécurité / corrections

- CEO, COO, HR & CFO et ADMIN ne peuvent plus utiliser une permission générique de gestion des personnes pour modifier le planning personnel d'un autre collaborateur DTSC.
- Les mutations résolvent le collaborateur depuis la session et refusent les écritures croisées.
- Les modifications futures préservent l'historique temporel ; les données passées ne sont pas réécrites silencieusement.
- Le comportement calendrier des organisations clientes reste compatible et isolé du durcissement \`DTSC_INTERNAL\`.

### Hors périmètre

- Aucun timesheet, pointage, prestation réelle, validation COO des prestations ni calcul de paie n'est introduit. Ces sujets restent réservés aux Sprints 4 et 5.
<!-- /SPRINT_03_WORK_SCHEDULE_CHANGELOG -->
`,
  agents: `

<!-- SPRINT_03_WORK_SCHEDULE_RULES -->
## Règles DTSC — planning de travail et disponibilités

- Les collaborateurs \`DTSC_INTERNAL\` gèrent uniquement leurs propres disponibilités récurrentes, exceptions de planning et absences. La cible d'écriture doit être dérivée de la session et du \`HrcfoEmployee\` actif, jamais d'un \`collaboratorId\` navigateur arbitraire.
- Les managers peuvent disposer d'une visibilité de lecture adaptée sans obtenir la propriété d'écriture sur le planning personnel d'autrui. Ne jamais réutiliser une permission générique comme \`canManagePeople\` pour autoriser l'édition des disponibilités DTSC.
- La disponibilité est une donnée de planification, jamais du temps travaillé, une prestation réelle ou une donnée de paie.
- Les absences et exceptions datées doivent rester distinctes des disponibilités hebdomadaires habituelles dans les validateurs, services, API et UX, même lorsqu'une table physique de compatibilité est conservée.
- Les contrôles de conflit calendrier DTSC doivent utiliser la disponibilité effective après application des exceptions/absences et respecter la timezone utilisateur.
- Les données historiques de planning ne doivent pas être réécrites silencieusement ; privilégier périodes d'effet, versionnement raisonnable et soft delete.
- Les motifs privés d'absence ne doivent pas être exposés dans les vues opérationnelles collectives ou dans les notifications Web Push.
- Un chantier ciblé \`DTSC_INTERNAL\` ne doit pas réinterpréter arbitrairement les règles calendrier des entreprises clientes \`ORGANIZATION\`.
- Ne pas introduire de timesheet, pointage, prestation réelle, validation COO des prestations ou calcul paie dans le Sprint 3.
<!-- /SPRINT_03_WORK_SCHEDULE_RULES -->
`,
};

function appendIfMissing(file, marker, section) {
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(marker)) return false;
  fs.writeFileSync(file, `${current.trimEnd()}${section}\n`, "utf8");
  return true;
}

const changed = [
  appendIfMissing(files.technical, "SPRINT_03_WORK_SCHEDULE -->", sections.technical),
  appendIfMissing(files.qa, "SPRINT_03_WORK_SCHEDULE_QA -->", sections.qa),
  appendIfMissing(files.changelog, "SPRINT_03_WORK_SCHEDULE_CHANGELOG -->", sections.changelog),
  appendIfMissing(files.agents, "SPRINT_03_WORK_SCHEDULE_RULES -->", sections.agents),
].some(Boolean);

console.log(changed ? "Sprint 3 documentation updated." : "Sprint 3 documentation already synchronized.");
