# Modèle de contexte du compte standard

## Contextes

- `GLOBAL_CLIENT` / personnel : données globales de l’utilisateur, invitations et relations avant adhésion.
- `DTSC_INTERNAL` : environnement interne DTSC réservé aux memberships autorisés.
- `ORGANIZATION` : espace d’une organisation cliente active.
- `COMMUNITY` : contexte global communautaire lorsqu’il est explicitement utilisé.

## Changement de contexte

`POST /api/account/context` applique :

1. contrôle same-origin ;
2. session active ;
3. limitation de débit ;
4. validation Zod ;
5. utilisateur actif ;
6. membership actif et organisation disponible ;
7. renouvellement du cookie signé ;
8. audit et log API.

## Révocation

Un membership retiré, suspendu ou lié à une organisation inactive ne peut plus être résolu. Une tentative de changement est refusée avec un reason code sûr. Les routes métier revérifient ensuite l’accès indépendamment du cookie existant.

## Navigation

Le contexte actif actualise le Dashboard, les notifications visibles, les modules entreprise et les capacités. Le compte personnel reste accessible pour traiter les invitations et relations hors contexte organisation.
