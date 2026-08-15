# Delivery incident — 15 août 2026

## Résumé

Pendant une opération de maintenance GitHub liée au hotfix reporting #317/#318, une écriture connector non intentionnelle a créé le commit direct `77071a75e2ad3bea49ca582280d846f39e72405a` sur `main`.

Ce commit n’ajoutait qu’un fichier racine vide nommé `DOES_NOT_EXIST`. Il ne modifiait aucun code applicatif, aucune configuration, aucune migration, aucune donnée et aucun secret.

## Confinement GitHub

Le ref `main` a été restauré immédiatement sur le SHA canonique précédent :

`fa7fcef2ac9714fdc517aad86c538854ee005941`

Le fichier parasite n’existe donc plus dans l’arbre Git canonique.

## Impact Vercel

La politique Production-only a fonctionné conformément à sa configuration : comme le commit parasite a momentanément atteint `main`, Vercel a lancé un déploiement Production.

Déploiement concerné :

`dpl_2jHqmCLdsLNnuUy2tCmHugQkRuan`

Le déploiement a atteint `READY`. Son arbre applicatif était identique au dernier stable à l’exception du fichier vide non utilisé.

Aucune Preview Vercel de branche n’est impliquée dans cet incident.

## Réconciliation

Cette documentation est livrée par le flux gouverné normal :

1. Issue #319 ;
2. branche `chore/319-production-reconcile` depuis le `main` canonique ;
3. PR dédiée ;
4. CI GitHub ;
5. fusion sur `main` uniquement après validation automatique ;
6. vérification du nouveau déploiement Vercel Production sur le SHA de merge.

La fusion de la PR de réconciliation doit produire un nouveau SHA Production gouverné dont l’arbre ne contient pas `DOES_NOT_EXIST`.

## Données et sécurité

Aucun impact sur :

- Prisma ou les migrations ;
- données clients ;
- RBAC ;
- isolation multi-tenant ;
- authentification ;
- secrets ;
- Finance, Retail, Paie ou Pharmacie ;
- APIs ou contrats métier.

## Prévention

Les mises à jour de métadonnées GitHub doivent utiliser exclusivement les actions dédiées aux Issues/PR. Toute écriture de fichier doit toujours préciser explicitement une branche non-`main` et un chemin existant ou intentionnel.

Pour les incidents de livraison, la remise en conformité Production doit repasser par Issue → branche → PR → CI → `main`, sauf impossibilité technique documentée.
