# Règles locales — `prisma/`

Ces règles complètent le `AGENTS.md` racine pour les schémas et migrations Prisma.

- Toute modification du schéma Prisma doit avoir une migration versionnée sous `prisma/migrations/`; `prisma db push` n'est jamais la stratégie de production.
- Les migrations ERP doivent être additives et non destructives par défaut. Ne pas supprimer `EnterpriseCoreRecord` ni ses colonnes tant que les Sprints 7 et 8 n'ont pas migré les domaines restants.
- `EnterpriseTask`, `EnterpriseRequest`, `EnterpriseApproval` et `EnterpriseMeeting` sont les sources de vérité dédiées Sprint 6. Ne pas ajouter une deuxième table éditable représentant le même objet métier.
- Toute entité ERP d'organisation porte `organizationId` et les indexes doivent suivre les filtres réellement utilisés par les listes serveur.
- Les modèles modifiables concurremment doivent conserver un mécanisme de révision ou une garde atomique équivalente.
- Les participants de réunion imposent l'unicité `(meetingId, userId)` et les relations de réunion doivent être supprimées en cascade uniquement lorsque la réunion elle-même est réellement supprimée par la base.
- Les relations transversales vers des objets sectoriels restent validées côté service par `organizationId`; ne pas ajouter de foreign keys cross-domain trompeuses lorsque les modèles sont volontairement polymorphes.
- Un backfill historique Sprint 6 n'est acceptable que lorsqu'il est déterministe. Un `metadataJson` ambigu reste legacy ; ne jamais inventer une relation pour satisfaire une migration.
- La CI doit pouvoir appliquer toutes les migrations depuis une base vide avant merge.
