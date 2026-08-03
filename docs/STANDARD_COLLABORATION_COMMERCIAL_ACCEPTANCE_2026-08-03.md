# Acceptation commerciale — Collaboration et Annonces

**Date :** 3 août 2026  
**Propriétaire :** Dr Jonathan NTUMBA  
**Modules :** `COLLABORATORS`, `ANNOUNCEMENTS`

## Décision propriétaire

Le propriétaire a exécuté plusieurs campagnes E2E authentifiées en Production sur les conversations, groupes, accusés de lecture, réponses et annonces. Il a signalé les écarts observés, demandé leur correction, puis autorisé explicitement la promotion des deux modules vers `COMMERCIAL_READY` à la fin de cette stabilisation, sous réserve du respect intégral de la CI/CD et d’un déploiement Production provenant de `main`.

## Stabilisation finale exigée

- liens web externes reconnus dans les messages comme dans les annonces ;
- mentions individuelles mises en évidence et actionnables ;
- notifications et compteurs de mentions non lues ;
- `@tous` résolu côté serveur pour tous les membres actifs et réservé aux responsables de groupe ;
- double accusé cyan en lecture partielle et vert lorsque tous les destinataires actifs ont lu ;
- filtres directs et listes personnalisées persistées par utilisateur ;
- interlignes et espacements de paragraphes dans l’éditeur riche partagé ;
- documentation, migration additive, audits et Quality Gates mis à jour.

## Conditions de promotion

La promotion devient effective uniquement après :

1. migration PostgreSQL réussie depuis une base vide ;
2. génération Prisma et type-check réussis ;
3. régression complète et audits dédiés réussis ;
4. lint et build Next.js réussis ;
5. fusion de la PR officielle dans `main` ;
6. déploiement Vercel Production `READY` correspondant exactement au SHA fusionné ;
7. absence d’erreur runtime critique liée au déploiement.

Cette preuve est la décision propriétaire versionnée requise par le registre canonique. Une régression critique future impose le déclassement immédiat du module concerné jusqu’à correction.

La validation commerciale est accordée par le propriétaire sous les conditions ci-dessus.
