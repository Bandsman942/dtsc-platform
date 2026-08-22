# Hotfix #475 — Administration entreprise

## Périmètre

Ce hotfix concerne exclusivement le module **Administration entreprise** des organisations clientes de DTSC Platform. Il ne modifie pas les workspaces ERP/sectoriels eux-mêmes et ne change pas le catalogue commercial des abonnements.

## Contrat utilisateur

### Paramètres de l’entreprise

- le logo est choisi depuis un fichier local PNG, JPG ou WebP de 2 Mo maximum ;
- un nouveau logo est envoyé vers un chemin candidat distinct afin que le logo actif ne soit pas écrasé avant la réussite de l’enregistrement global ;
- la couleur principale est choisie visuellement dans une palette DTSC et devient l’accent de l’environnement privé de l’entreprise ;
- la langue de l’entreprise (`fr` ou `en`) pilote la présentation du module Administration, notamment l’audit ;
- chaque champ possède une aide contextuelle ;
- le formulaire reste ouvert après un échec et se ferme uniquement après succès complet.

### Centre de configuration

La checklist est calculée à partir des données persistées. Elle est séparée en :

1. paramètres de l’entreprise ;
2. configuration des modules et prérequis opérationnels.

Elle expose un pourcentage réel, une barre de progression, une explication par étape et un lien direct vers la configuration concernée. Lorsque les modules Finance sont actifs, les comptes financiers et les budgets applicables sont intégrés aux contrôles.

### Modules

Le menu d’un module permet :

- d’ouvrir le module lorsqu’il est accessible ;
- de consulter les utilisateurs et les actions réellement autorisées ;
- de consulter les informations générales et dépendances ;
- d’activer/désactiver le module selon le contrat existant ;
- de suspendre temporairement l’accès d’un collaborateur et de le rétablir.

Une restriction temporaire est une **restriction négative** : elle peut retirer un accès existant, mais ne peut jamais accorder un droit refusé par le rôle, le poste, l’abonnement ou le registre canonique. Le résolveur serveur reste l’autorité.

### Départements

- création ;
- consultation en détail plein écran ;
- modification ;
- désactivation non destructive ;
- responsable choisi parmi les collaborateurs actifs de l’entreprise ;
- département parent choisi parmi les départements actifs du même tenant ;
- conservation de l’historique et des rattachements lors d’une désactivation.

Aucun identifiant technique n’est demandé à l’administrateur : les codes internes sont générés côté serveur.

### Sécurité de l’organisation

Les règles exposées restent propres à l’entreprise et ne remplacent pas les politiques globales DTSC. Le hotfix applique côté serveur :

- la durée de validité des invitations ;
- le nombre maximal d’invitations en attente ;
- la restriction aux domaines e-mail approuvés ;
- le rôle d’invitation par défaut ;
- les restrictions temporaires par utilisateur et module via le résolveur canonique.

### Audit et cohérence

L’interface d’audit présente :

- le nom de l’utilisateur lorsqu’il peut être résolu ;
- une formulation client des actions et résultats ;
- les dates localisées ;
- les incohérences de modules formulées comme actions de configuration.

Les noms de tables, identifiants internes, `reasonCode`, routes et types techniques ne sont pas utilisés comme libellés principaux côté client.

### Actions en cours

Le bloc « Demandes récentes » est remplacé par le **Centre des actions en cours**. Il regroupe les tâches, demandes et validations non clôturées utiles à l’utilisateur connecté.

Pour un élément rattaché à un module, la visibilité nécessite l’accès serveur réel à ce module. Une affectation personnelle ne contourne donc ni le RBAC ni une restriction temporaire. Pour un élément sans module source, seuls les utilisateurs directement impliqués le voient.

### Suppression du bloc sectoriel

Le bloc « Modules sectoriels » est supprimé du module Administration entreprise. Les modules Health, Pharmacy, Shop et autres secteurs continuent d’exister dans leurs workspaces dédiés et dans le registre canonique.

## Isolation et sécurité

- toutes les nouvelles routes revalident `organizationId` côté serveur ;
- les références de responsables, parents et utilisateurs sont revalidées dans l’organisation active ;
- les mutations sensibles conservent same-origin, rate-limit et audit ;
- aucun droit n’est calculé uniquement dans l’UI ;
- les listes chargées par le centre d’actions sont bornées ;
- aucune nouvelle variable d’environnement ni aucun secret n’est introduit.

## Base de données

Aucune nouvelle migration Prisma. Le hotfix réutilise les modèles et champs existants. Les restrictions temporaires sont conservées dans les paramètres JSON de l’organisation et consommées par le résolveur d’accès.

## Rollback

Le rollback applicatif consiste à revert la PR #476 depuis une nouvelle PR/hotfix conforme. Aucune migration ou backfill n’est à inverser. Les données existantes restent compatibles avec la version précédente.

## Recette E2E propriétaire requise avant merge

Tester au minimum dans une entreprise cliente de test :

- paramètres : couleur, changement de langue, logo valide, logo invalide, erreur serveur ;
- fermeture uniquement après succès ;
- checklist et deep links, avec et sans modules Finance actifs ;
- menu `...` d’au moins un module ;
- consultation des accès par utilisateur ;
- restriction temporaire puis restauration et vérification qu’un deep link direct est refusé pendant la restriction ;
- création, modification, détail plein écran et désactivation d’un département ;
- sécurité : domaines autorisés, limite et expiration d’invitation ;
- audit avec noms utilisateurs en français puis anglais ;
- centre d’actions avec utilisateur autorisé et utilisateur non autorisé ;
- absence du bloc « Modules sectoriels » dans Administration entreprise ;
- clair/sombre et largeurs 320, 360, 375, 390, 414, 768 et 1024 px.

La validation visuelle propriétaire reste `NOT_EXECUTED` tant qu’elle n’est pas explicitement confirmée.