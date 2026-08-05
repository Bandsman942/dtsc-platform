# Modèle d’accès Console DTSC

La décision serveur combine : session, contexte `DTSC_INTERNAL`, rôle global, bloc administratif, poste interne, permission individuelle et capacité demandée.

`requireConsoleCapability()` est l’autorité pour les API. La visibilité d’une section ne donne aucune mutation. Les reason codes incluent `UNAUTHENTICATED`, `NOT_DTSC_INTERNAL`, `SECTION_FORBIDDEN`, `CAPABILITY_REQUIRED`, `LAST_ADMIN_PROTECTED` et les codes métier.

Les données sensibles ont un contrôle additionnel : export, webhook, paramètres, rôle, organisation et facturation. Un utilisateur `CLIENT` ne reçoit jamais un accès Console. Le dernier administrateur global ou organisationnel est protégé.
