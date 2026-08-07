# Agent Delivery Runbook

## GitHub Agent — avant développement

1. Synchroniser le dernier `origin/main`.
2. Rechercher une Issue existante ; la créer si nécessaire.
3. Appliquer type, priorité, area, impact.
4. Assigner le milestone si impact matériel.
5. Créer/vérifier la branche dédiée liée à l’Issue.

## GitHub Agent — pendant/après développement

1. Vérifier les commits Conventional Commits.
2. Créer la PR avec `Closes/Fixes/Resolves #N`.
3. Vérifier les métadonnées structurées.
4. Surveiller Delivery governance, Quality et Migration.
5. Analyser les erreurs CI ; ne jamais contourner une gate.
6. Lire/résoudre les commentaires de review actionnables.
7. Merger uniquement lorsque les critères sont satisfaits.

## Vercel Agent — après merge

1. Identifier le SHA mergé.
2. Trouver le déploiement du projet `dtsc-platform` avec `target=production` et `meta.githubCommitSha=SHA`.
3. Vérifier qu’il s’agit de Production.
4. Observer l’état final.
5. READY : transmettre id, URL, inspector URL, SHA à la Release.
6. ERROR/CANCELED : ouvrir/mettre à jour le blocker GitHub.
7. Ne jamais déclarer une livraison réussie sans preuve Production.

## GitHub Agent — après Production READY

1. Vérifier/créer la GitHub Release idempotente.
2. Vérifier la clôture des Issues via la PR.
3. Vérifier le milestone et les Known Issues.
4. Le tag, la Release et Vercel doivent pointer sur le même SHA.
