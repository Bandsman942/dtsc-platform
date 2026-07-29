# Calendar-specific agent rules

Ces règles complètent le `AGENTS.md` racine pour tout travail sous `app/calendar` et les APIs calendrier associées.

- Les collaborateurs `DTSC_INTERNAL` gèrent uniquement leurs propres disponibilités récurrentes, exceptions de planning et absences. La cible d'écriture doit toujours être résolue depuis la session (`session.userId -> HrcfoEmployee.id`), jamais depuis un `collaboratorId` arbitraire fourni par le navigateur.
- Une visibilité managériale n'accorde jamais la propriété d'écriture. CEO, COO, HR & CFO et les administrateurs autorisés peuvent disposer d'une lecture adaptée sans PATCH/DELETE/POST au nom d'un autre collaborateur dans le workflow métier normal.
- La disponibilité est une donnée de planification. Elle ne doit jamais être assimilée au temps travaillé, à une prestation réelle, à une timesheet ou à une donnée de paie.
- Les absences et exceptions datées doivent rester distinctes des disponibilités hebdomadaires habituelles dans les contrats métier, validateurs, API et UX, même lorsqu'elles partagent encore une table physique de compatibilité.
- La détection des conflits calendrier DTSC doit utiliser la disponibilité effective après application des exceptions et absences, avec la timezone utilisateur. Ne pas revenir à une lecture directe et naïve d'une seule ligne `CollaboratorAvailability`.
- Les données historiques ne doivent pas être réécrites silencieusement. Une évolution future du planning doit préserver les versions/périodes d'effet et les suppressions utiles à l'audit doivent rester logiques ou temporelles.
- Les motifs privés d'absence ne doivent pas être exposés dans les vues opérationnelles collectives ni dans les Web Push. Le type opérationnel peut être visible selon les permissions; le détail RH reste restreint.
- Les règles `ORGANIZATION` des entreprises clientes ne doivent pas être réinterprétées par un changement destiné uniquement à `DTSC_INTERNAL` sans migration et décision produit explicites.
- Ne pas introduire ici de `Timesheet`, `TimeEntry`, `ClockIn`, `ClockOut`, `WorkSession`, validation COO des prestations ou calcul paie : ces sujets appartiennent aux Sprints 4 et 5.
