# HOTFIX RH #1028 — tranche 2 : archive et restauration des contrats

Statut : développement en PR, `OWNER_E2E` requis avant fusion. Base : `main@cd595a1`.

## But métier

Les contrats ne sont jamais effacés physiquement. Un responsable RH habilité peut archiver un contrat non actif, consulter sa fiche dans les archives et le restaurer. Les accords actuellement `ACTIVE` doivent d'abord être terminés/remplacés via le circuit RH normal.

## Accès et sécurité

- `HUMAN_RESOURCES:manage` est exigé côté serveur pour archiver, restaurer et consulter les archives ; le simple droit `read` ne révèle pas les contrats archivés.
- Chaque requête vérifie session, tenant `organizationId`, même origine, limitation de débit, saisie Zod, révision optimiste et audit sans montant salarial.
- La route de consultation ordinaire conserve `archivedAt: null`. Le filtre `archived=1` n'est accessible qu'aux gestionnaires.
- Archivage `DELETE /api/enterprise/{organizationId}/employment-contracts/{contractId}` avec `{revision,reason}` : mutation logique `archivedAt`, aucun `delete` SQL et aucun effet sur les paies historiques.
- Les validations de contrat `PENDING` sont rendues `SUPERSEDED` avec une trace ; un approbateur ne peut plus les valider après archivage.
- Restauration `POST /api/enterprise/{organizationId}/employment-contracts/{contractId}/restore` avec `{revision}`. Un contrat anciennement en attente revient `DRAFT` sans approbation automatique.
- Les conflits de révision renvoient `409`; archive introuvable `404`; contrat actif `409`. Les messages FR/EN sont contextualisés.
- Les révisions immuables, liens de succession, historiques de paie et journaux restent conservés ; aucun schéma supplémentaire nécessaire.

## UI Design 2.0

Dans Ressources humaines → Contrats, le gestionnaire bascule entre contrats courants et archives. Les lignes affichent actions Archiver/Restaurer selon droits et état ; confirmation explicite et motif obligatoire avant archivage. La fiche d'un contrat archivé porte un indicateur daté. UI FR/EN et responsive.

## E2E propriétaire — tranche 2

1. Créer un contrat `PENDING_APPROVAL`, archiver avec un motif, vérifier qu'il disparaît de la liste courante et apparaît dans Archives.
2. Vérifier que la validation ancienne ne reste pas possible (approbation `SUPERSEDED`).
3. Restaurer : retour en `DRAFT` sans activation, puis confirmer que la resoumission exige un validateur indépendant.
4. Tenter d'archiver un contrat `ACTIVE` : refus `409`, aucune mutation.
5. Vérifier `403` pour lecteur RH non gestionnaire sur `archived=1`, `DELETE` et restauration, et `404` pour identifiant d'un autre tenant.
6. Simuler deux mutations avec la même révision : une seule réussit, l'autre est refusée.
7. Contrôler l'intégrité des révisions antérieures et des bulletins historiques après l'archivage.
8. Vérifier FR/EN, sombre/clair, clavier, 320–1024 px et toasts.

## Mise en production et rollback

Branche de travail → PR → CI (dont `qa:hotfix-1028-archive`) → `OWNER_E2E` → merge `main` → Vercel production uniquement. Aucune Preview Vercel, aucune variable nouvelle ni migration. En cas de régression, revert applicatif depuis `main` sans altérer les lignes archivées.

## Travail restant dans l'issue #1028

CRUD contextualisé complet des postes/départements dans Organisation et validation des deep links intermodules. L'issue #1028 reste ouverte tant que ces points ne sont pas certifiés.
