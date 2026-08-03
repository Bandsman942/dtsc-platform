# Modèle de liens profonds des notifications

## Contrat

Une notification actionnable stocke ou résout une cible interne précise. La cible doit identifier l’objet lorsqu’il est connu, par exemple une invitation, une relation, une facture SaaS, un ticket ou une session.

## Résolution

1. charger la notification appartenant à l’utilisateur ;
2. normaliser l’URL interne ;
3. refuser une URL externe ou un host non autorisé ;
4. résoudre l’objet ;
5. revérifier le contexte, le membership, la permission et la propriété ;
6. ouvrir l’objet ou afficher une explication sûre.

## Hors contexte organisation

Les invitations entreprise et identités relationnelles restent visibles dans le compte global avant l’adhésion. Les autres notifications privées restent filtrées par le contexte et les memberships actifs.

## Pagination

Le centre de notifications applique la recherche et la pagination au niveau Prisma avant le rendu. Les compteurs sont calculés sur les mêmes filtres.

## Déduplication

Les producteurs d’événements doivent utiliser une clé métier stable lorsqu’un retry peut reproduire le même événement. Cette itération n’ajoute pas de colonne tant qu’un besoin de migration n’est pas démontré.
