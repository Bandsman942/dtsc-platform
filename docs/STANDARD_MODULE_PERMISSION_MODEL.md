# Modèle d’accès et de capacités des modules standards

## Autorité

`lib/modules/standard-module-access.ts` fournit une décision structurée. Cette fondation ne remplace pas les autoriseurs métier existants ; elle normalise la décision de module avant l’autorisation d’objet et d’action.

## Entrées

- module et action demandée ;
- authentification et rôle global ;
- contexte actif ;
- organisation et membership ;
- poste officiel ;
- permissions explicites ;
- plan et abonnement ;
- dépendances actives ;
- propriété éventuelle.

## Sortie

La décision expose : `allowed`, `reasonCode`, message français, code canonique, plan requis, dépendances manquantes et capacités.

Capacités prévues : voir, créer, modifier, supprimer, archiver, restaurer, inviter, commenter, modérer, envoyer/télécharger, exporter, appeler, configurer, gérer, soumettre, approuver, rejeter et relancer.

## Invariants

- Le frontend masque ou désactive les actions selon les capacités, mais le serveur les revérifie.
- Un rôle global ne donne aucun accès implicite aux données privées d’une organisation.
- Les modules entreprise exigent le membership et le contexte approprié.
- Les modules internes DTSC exigent le contexte interne et le poste/permission documenté.
- Un identifiant client est toujours revalidé dans le même tenant.
- Un refus ne révèle ni l’existence ni le contenu d’un objet non autorisé.
