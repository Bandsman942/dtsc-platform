# Contrat de navigation multidomaine des modules standards

## Hosts canoniques

- `dtsc-platform.com` : PUBLIC
- `app.dtsc-platform.com` : APP
- `account.dtsc-platform.com` : ACCOUNT
- `console.dtsc-platform.com` : CONSOLE
- `support.dtsc-platform.com` : SUPPORT

Les valeurs réelles d’environnement sont résolues par `lib/domains.ts`. Aucune logique métier ne doit reconstruire ces URL en concaténant des chaînes.

## Règles

1. Utiliser `buildUrlForHostType`, `getSignInUrl`, `getDashboardUrl`, `getConsoleUrl`, `getSupportUrl` et `getPublicUrl`.
2. Les liens internes au même produit peuvent rester relatifs.
3. Les traversées de produit utilisent un helper central.
4. Le paramètre `next` est limité aux destinations internes fiables.
5. Le contexte actif n’est transmis que lorsqu’il est nécessaire et autorisé.
6. Un module `HIDDEN`, `RETIRED` ou sans route n’est pas cliquable.
7. Un module `PLANNED` est présenté comme planifié, jamais comme opérationnel.
8. Un accès refusé produit une explication humaine sans fuite de données.
9. Un plan insuffisant produit une information commerciale honnête, pas une fausse erreur technique.
10. Les routes legacy utilisent une redirection explicite et traçable.

## Liens profonds

Le helper `buildStandardModuleDeepLink` construit un lien à partir de : module, host, route, contexte, organisation, objet, section et action. Les valeurs sont bornées et validées. Le lien ne remplace jamais le contrôle d’accès à l’ouverture.

## Environnements

En local et Preview, les helpers conservent des chemins relatifs lorsque les bases URL ne sont pas configurées. En Production, les aliases doivent pointer vers l’unique déploiement provenant de `main`.
