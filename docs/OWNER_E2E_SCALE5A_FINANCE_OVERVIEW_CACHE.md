# OWNER_E2E — SCALE-5A Finance Overview read cache

Issue : #586

Exécuter uniquement après gates automatiques vertes sur le HEAD final inchangé de la PR. Ne pas créer de Preview Vercel.

## Scénarios requis

1. **Lecture canonique** : ouvrir Finance > Vue d'ensemble avec une organisation autorisée et confirmer que les compteurs affichés sont cohérents avec les modules sources.
2. **Deux lectures successives** : charger deux fois la même Vue d'ensemble à quelques secondes d'intervalle sans mutation métier. La seconde lecture doit retourner exactement les mêmes valeurs et rester rapide ; la télémétrie serveur doit pouvoir distinguer MISS/FALLBACK puis HIT lorsque Redis est disponible.
3. **Mutation puis fraîcheur** : créer ou faire évoluer une donnée Finance qui influence la Vue d'ensemble (facture, paiement, caisse, rapprochement, budget/dépense/validation selon le parcours disponible), laisser le worker traiter l'événement, puis recharger. Le dashboard doit refléter la nouvelle vérité après invalidation ; si Redis est momentanément indisponible, la fenêtre maximale documentée est le TTL de 15 s.
4. **Redis indisponible / dégradation** : si un environnement de test permet de neutraliser Redis sans toucher Production, confirmer que Finance Overview reste utilisable grâce au fallback PostgreSQL. Ne pas modifier les secrets Production pour provoquer ce scénario ; à défaut, s'appuyer sur la preuve CI du contrat fallback et ne pas déclarer cette manipulation exécutée.
5. **Isolation tenant** : avec deux organisations accessibles, charger successivement leur Finance Overview et confirmer qu'aucune valeur de l'organisation A n'apparaît dans B, ni inversement.
6. **RBAC** : un utilisateur sans permission `FINANCE_OVERVIEW/view` ne doit pas obtenir la projection via la route cache.
7. **Compatibilité Workflow/Bulk** : confirmer qu'un workflow ERP normal continue à être traité et que les jobs Bulk Finance ne régressent pas après l'ajout de l'invalidation cache.
8. **Production-only** : confirmer qu'aucun déploiement Preview de la branche n'a été créé.

## Preuve

Seule une confirmation explicite du propriétaire telle que `E2E #<PR> bon` sur le HEAD final inchangé vaut `OWNER_E2E`. Tout commit ultérieur invalide cette preuve.
