# PUBLIC-UX-04 — Ressources (Issue #970)

## Première livraison sur branche
- Bibliothèque éditoriale compacte FR/EN, mise à la une et catalogue sans cartes obligatoires.
- Filtres catégorie avec compteurs réels, recherche par titre/extrait/catégorie/slug, tri chronologique et liens URL partageables.
- Pagination serveur de 12 contenus (au lieu des 80 chargés d'un coup), calcul des totaux DB et états vides.
- Les brouillons ne sont pas interrogés. Le nom d'auteur est affiché uniquement si publicProfileConsent est vrai.
- Les dates utilisent publishedAt si disponible; createdAt reste le fallback des données historiques.
- La page continue d'utiliser PublicHeader et PublicFooter partagés, sans modifier les modules privés.

## Règles de livraison
Rester sur branche feature jusqu'à la preuve CI, contrôles responsive 320/360/375/390/414/768/1024 et E2E propriétaire.
Vérifier les scénarios 0/1/12/13/80/>80 articles, catégories vides, recherche insensible à la casse, pages invalides, old/new, permission et cache.
Après #967, relire la base main avant merge et réconcilier le nouveau catalogue de catégories.
Rollback: revert de la PR; pas de schéma Prisma ou changement de données.
