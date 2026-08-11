# Modèle de contexte du compte standard

## Contextes

- `GLOBAL_CLIENT` / personnel : données globales de l’utilisateur, invitations et relations avant adhésion.
- `DTSC_INTERNAL` : environnement interne DTSC réservé aux memberships autorisés.
- `ORGANIZATION` : espace d’une organisation cliente active.
- `COMMUNITY` : contexte global communautaire lorsqu’il est explicitement utilisé.

## Connexion et choix explicite de l’espace

La connexion suit désormais un parcours volontaire en trois temps :

1. l’utilisateur renseigne son adresse email et son mot de passe ;
2. il choisit **Charger mes espaces** afin d’afficher les espaces accessibles avec son compte ;
3. il sélectionne explicitement **Mon espace personnel**, l’espace DTSC ou une entreprise autorisée, puis utilise **Se connecter**.

La simple saisie des identifiants ne doit jamais créer une session ni choisir silencieusement un espace. Le backend exige qu’un choix d’espace soit présent dans la demande de connexion et revalide toute organisation demandée avant de signer la session.

Un choix personnel explicite reste `GLOBAL_CLIENT`, y compris pour un utilisateur qui possède aussi un accès DTSC interne. L’accès DTSC interne est obtenu en choisissant explicitement l’organisation DTSC proposée dans la liste des espaces autorisés.

Les libellés visibles de cette étape restent orientés utilisateur : **espace**, **espace personnel**, **espace de travail**, **Charger mes espaces**. Les identifiants techniques, codes de rôles, notions de tenant ou noms de champs backend ne doivent pas être exposés dans l’interface.

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

Le sélecteur d’espace permet aussi de revenir explicitement à **Mon espace personnel**. Sur mobile, il est placé dans la navigation supérieure après les groupes de navigation, donc après l’entrée DTSC lorsqu’elle est visible, et avant **Déconnexion**.

## Révocation

Un membership retiré, suspendu ou lié à une organisation inactive ne peut plus être résolu. Une tentative de changement est refusée avec un reason code sûr. Les routes métier revérifient ensuite l’accès indépendamment du cookie existant.

## Navigation

Le contexte actif actualise le Dashboard, les notifications visibles, les modules entreprise et les capacités. Le compte personnel reste accessible pour traiter les invitations et relations hors contexte organisation.
