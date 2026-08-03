# Architecture — Espace personnel standard

## Objectif

L’espace personnel est un parcours unifié reliant le compte global, le contexte actif, les actions attendues, l’abonnement, les organisations, les invitations, les relations, les notifications et les préférences.

## Source d’agrégation

`lib/account/personal-workspace.ts` construit un résumé serveur borné et parallèle. Il consomme les sources canoniques sans les dupliquer :

- session signée et contexte actif ;
- memberships et organisations ;
- invitations entreprise ;
- identités relationnelles et consentements ;
- notifications visibles ;
- abonnement personnel et entitlements organisation ;
- usage réel, documents, conversations et tickets support.

## Flux

```text
session + utilisateur
  -> résolution du contexte
  -> filtres d’accès
  -> requêtes parallèles limitées
  -> actions priorisées
  -> Dashboard et liens profonds
```

## Performance

Les listes sont limitées, les compteurs utilisent `count` ou `aggregate`, les sélections Prisma sont minimales et aucun dataset complet n’est chargé pour calculer le Dashboard.

## Sécurité

Le Dashboard ne constitue jamais une autorité. Toute route cible revérifie la session, le membership, l’entitlement, la permission et la propriété de l’objet.

## Observabilité

Les mutations de contexte et d’invitation produisent des logs API et des audits avec reason codes. Les données sensibles ne sont pas copiées dans les métadonnées.
