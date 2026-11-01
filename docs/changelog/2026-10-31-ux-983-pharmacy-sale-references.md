# UX-02F / #983 — Référentiels de vente Pharmacie paginés

## Problème

La réponse de l'API Ventes chargeait tous les produits actifs, tous les lots disponibles et toutes les ordonnances valides. Cette opération augmente avec la taille des référentiels, même lorsque l'utilisateur consulte seulement douze ventes.

## Correctif

- `GET /api/enterprise/[organizationId]/pharmacy/sales/references?kind=products|batches|prescriptions&q=&page=&pageSize=&selectedId=&productId=`.
- Accès : session, organisation active, module Ventes Pharmacie et permission lecture via `canAccessPharmacySales`. Refus 401/403 ; nature non autorisée 400. Aucun patient, prescripteur ou détail clinique n'est envoyé au sélecteur d'ordonnances.
- Recherche limitée à 100 caractères ; pages entre 1 et 10 000 ; `pageSize` 1 à 25 (défaut 20), tri déterministe, `count` SQL. Une recherche peut inclure séparément la référence déjà sélectionnée dans le même tenant, même lorsqu'elle n'apparaît pas sur la page courante.
- Les lots exigent le produit choisi, un stock positif, un état vendable, l'absence de quarantaine/rappel, une date d'expiration future et un tri FEFO. La règle FEFO reste revalidée côté serveur lors de la création de la vente.
- Le formulaire permet recherche, pagination, états chargement/vide/erreur FR/EN ; changer de produit efface le lot précédent ; les références choisies restent visibles lors d'une nouvelle recherche.
- La réponse principale Ventes ne livre plus de référentiels globaux. Elle ne charge que les noms des produits nécessaires aux lignes de ventes présentes sur la page.

## Sécurité / volume / rollback

Aucune donnée ni schéma modifié. Les requêtes sont isolées par `organizationId`. Les paramètres fournis par le client ne deviennent jamais une autorisation de lecture ou de vente. La sélection d'une référence obsolète est toujours rejetée par les validations métier. Revenir par PR de revert, sans backfill ni migration.

## QA / E2E propriétaire

`node scripts/qa-ux-983-pharmacy-sale-references.mjs` teste un référentiel simulé > 500, les bornes, tenant, permissions, FEFO, sélection conservée et absence de données cliniques. L'E2E #983 reste requis : 500+ références, recherche d'un produit lointain, changement de page, lot FEFO, ordonnance, fermeture/réouverture, pertes réseau, mobile 320/390, FR/EN, clair/sombre et refus inter-tenant. Les autres référentiels volumineux du programme #936 restent ouverts.
