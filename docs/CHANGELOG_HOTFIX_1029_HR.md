# CHANGELOG — Hotfix RH #1029

- Espace personnel Paie/Temps Design 2.0 avec bulletins approuvés PDF natifs, pagination, historiques, FR/EN, sombre/mobile.
- Horodatage entrée/sortie serveur et conservation immuable du début de session, fin contrôlée avec révision.
- Rapport individuel via `EnterpriseTimesheet`, approbateur indépendant et validation métier existante.
- Scoping des listes paie, timesheets et présences pour éviter la fuite des données d'autrui aux lecteurs non gestionnaires.
- Cache interdit pour les données privées, PDF audit et isolation stricte tenant/membership.
- Migration additive et garde-fous QA intégrés dans `qa:regression`.
- Aucun paiement financier créé ni déploiement feature branch.
