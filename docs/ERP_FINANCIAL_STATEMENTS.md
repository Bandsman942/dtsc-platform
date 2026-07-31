# États financiers communs

## Source

Les états utilisent uniquement `EnterpriseJournalEntry.status = POSTED` et les lignes associées, filtrées par `organizationId`, date, devise fonctionnelle et dimensions autorisées.

## États disponibles

- balance générale ;
- grand livre et journaux ;
- compte de résultat ;
- bilan ;
- flux de trésorerie par classification directe documentée ;
- balance âgée clients ;
- balance âgée fournisseurs ;
- budget vs réalisé ;
- synthèse des taxes ;
- registre des immobilisations ;
- valorisation du stock commun.

## Équations

Le service contrôle : `Actifs = Passifs + Capitaux propres` et `Résultat = Produits - Charges`, sous réserve du signe normal des comptes. Une différence hors tolérance est signalée et n’est jamais masquée.

## Performance

Les rapports utilisent agrégations SQL, pagination et fenêtres de dates. Ils ne chargent pas toutes les lignes comptables en mémoire. Les états multidevises sont séparés ; les rapports internes officiels utilisent la devise fonctionnelle.

## Snapshots

`EnterpriseFinancialStatementSnapshot` conserve type, période, devise, filtres, payload, checksum, auteur et publication. Un snapshot publié est immuable. Une nouvelle publication crée un nouveau snapshot au lieu d’écraser l’ancien.

## Flux de trésorerie

La première version utilise une classification directe des comptes et transactions de trésorerie. Elle doit rester clairement identifiée comme méthode interne configurable tant que toutes les classifications locales ne sont pas validées.
