# #1226 — Intégrité financière et rapprochement intelligent

**DRAFT — tranche A, non certifiée, non fusionnable.** Aucune donnée client dans ce dépôt public.

## Contrat
- Le détail comptable utilise l'autorité de capacités commune aux listes. La mutation conserve les gardes serveur, séparation des acteurs, période et audit.
- Le deep link EnterpriseJournalEntry ouvre l'identifiant exact, pas une recherche paginée.
- Pour CASH, la clôture Retail affiche uniquement la session OPEN du caissier déjà résolue par le dashboard. Le solde affiché est openingAmount + entrées - sorties de session. Les comptes non cash restent distincts.
- La nouvelle soumission transmet cashSessionId et expectedSessionAmount ; le serveur revalide la session et le montant dans la transaction. Compatibilité temporaire des anciens clients sans ces champs.
- Posting CASH_VARIANCE_POSTED : dimension site provenant de la session ou du compte, conflit explicite si divergence. Aucune mutation des écritures historiques.
- **Non résolu par A** : qualification distincte avant posting, régularisation métier, passations, consolidation et rapprochements physiques/bancaires/opérateur, imports et suggestions, état jamais rapproché, refonte Design 2.0 et audit historique. Ces lots sont bloquants dans #1226.

## Recette obligatoire avant release
1. Deux caissiers, même compte : chacun voit son montant propre, y compris plusieurs comptes/devises et site différent. Session absente/fermée non sélectionnable.
2. Mouvement concurrent entre comptage et soumission : rejet 409 et nouvelle lecture. Aucune écriture du comptage périmé.
3. Clic KPI vers écriture exacte, hors pagination; identifiant d'un autre tenant refusé. Détail inaccessible affiche erreur.
4. Détail et liste retournent capacités cohérentes ; acteur initial ne peut pas contrepasser ; autorisé indépendant peut utiliser l'action sous gardes serveur. Vérifier révision pour transitions.
5. Écart réel, positif/négatif : site correct, conflit de site refusé ; ne pas altérer journal historique.
6. Restants : clôture sans posting non qualifié, correction tracée, rapprochement partiel/groupé/idempotent, imports privés XLSX/CSV, approbation indépendante, couverture et soldes datés, responsive 320–1024 FR/EN clair/sombre; non-régression Health/Pharmacy/Finance/Retail.
7. QA locale/CI, migrations, OWNER_E2E et revue : NOT_EXECUTED à ce stade.
Rollback avant fusion : abandon de la branche; après fusion suivre la procédure officielle de hotfix, sans supprimer d'historique.

## Tranche B1 — séparation du comptage et du posting (candidate)
- Approbation des clôtures Finance et Retail : les écarts passent à PENDING_QUALIFICATION sans posting automatique. Le détail de caisse indique la qualification en attente; le formulaire Retail précise le comportement. La commande de qualification et régularisation reste à implémenter. Aucun changement historique et aucune mutation production.
- QA ciblée étendue. La qualification, le rapprochement complet et E2E propriétaire restent bloquants.
