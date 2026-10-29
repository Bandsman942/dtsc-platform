# UX-02B — Pagination des mouvements de stock Pharmacie (#949)

## Bug initial

`getPharmacyStockDataset` retournait au maximum **200 mouvements** et les onglets `Mouvements` et `Historique` affichaient directement ce jeu. Un mouvement plus ancien n'était donc pas consultable depuis l'interface, bien qu'existant en base.

## Nouvelle architecture

- `GET /api/enterprise/[organizationId]/pharmacy/stock/movements?page=1&pageSize=20&q=...`
- Session authentifiée et `canAccessPharmacyStock(userId, organizationId, "view")` contrôlés côté serveur.
- `organizationId` obligatoire sur les requêtes, taille plafonnée à **50**, recherche limitée à **80 caractères**, pagination serveur, ordre `createdAt DESC, id DESC`.
- Recherche dans le nom du produit, numéro de lot et motif, filtrée par organisation.
- Réponse : `{ movements, pagination: { page, pageSize, pageCount, total, totalUnfiltered } }`.
- Les vues « Mouvements » et « Historique » partagent une liste paginée, recherche avec temporisation et annulation des anciennes requêtes, états chargement/vide/erreur/réessayer.
- Le dashboard Stock conserve seulement les **cinq derniers mouvements** pour son aperçu, sans faire croire à un historique exhaustif.

Aucune mutation de mouvement ni écriture comptable n'est modifiée. Les références au stock réglementé restent rattachées aux produits et lots originaux ; aucun backfill ou schéma Prisma nouveau.

## E2E propriétaire obligatoire

1. Sur une pharmacie de test avec plus de **250 mouvements**, ouvrir « Mouvements de stock » et naviguer de la page 1 à la page 12+.
2. Rechercher le nom d'un produit ancien ; vérifier que le résultat s'affiche même s'il ne figure pas dans les cinq mouvements du dashboard.
3. Rechercher un numéro de lot, puis un motif ; contrôler la pertinence des résultats et le compteur.
4. Effacer la recherche ; vérifier le retour à la première page et les totaux globaux.
5. Ouvrir l'onglet « Historique stock » ; vérifier la même exhaustivité, le tri et la navigation.
6. Générer un ajustement autorisé de test ; vérifier le rafraîchissement des mouvements et l'absence de doublon.
7. Avec un autre tenant ou un compte sans droit de lecture, confirmer que l'API répond 403 et qu'aucune donnée d'autre entreprise n'est visible.
8. Tester FR/EN, 320/390/768/1440 px, clavier, thèmes clair/sombre, réseau indisponible et bouton Réessayer.

## QA

`node scripts/qa-ux-949-pharmacy-movement-pagination.mjs` intégré aux Quality Gates, puis `pnpm type-check`, régressions, lint et build en CI.

## Limites et suivi

Les référentiels produits/lots, les ordonnances, les totaux d'inventaire, le fuseau des KPI et la valorisation historique multidevise sont **hors scope**, suivis dans #936. Les métriques Stock existantes peuvent encore dépendre de listes bornées d'autres entités. Ne pas déclarer #936 achevée par la seule livraison de #949.

## Rollback

Revert du correctif sur branche/PR, sans migration ni suppression d'historique. Publication depuis `main` uniquement, après Quality Gates et validation propriétaire.
