# Architecture des domaines standards DTSC

## Principe

DTSC Platform reste une seule application Next.js à ce stade, mais ses surfaces sont réparties entre cinq hosts fonctionnels : public, app, account, console et support. `lib/domains.ts` demeure l’autorité des URL et `lib/modules/standard-module-registry-data.json` déclare le host de chaque module.

## Frontières

- **PUBLIC** : contenu public, services, solutions, ressources, newsletter et formulaires publics.
- **ACCOUNT** : inscription, connexion, récupération et retour sécurisé vers le produit d’origine.
- **APP** : Dashboard, collaboration, notifications, annonces, profil, paramètres, contexte entreprise et modules standards entreprise.
- **CONSOLE** : administration globale DTSC et fonctions internes autorisées.
- **SUPPORT** : tickets utilisateur et opérations Support autorisées.

## Règle de source unique

Le registre standard décrit les surfaces non ERP. Le registre ERP décrit les modules ERP. Une entrée standard peut consommer un module ERP via `erpDependencies`, mais ne peut pas dupliquer son modèle, ses statuts, ses calculs, ses permissions ou ses écritures.

## Déploiements

Les hosts partagent actuellement le même artefact et les mêmes contrats de session. Toute extraction future doit préserver les codes canoniques, les deep links, les reason codes d’accès et la compatibilité des aliases.
