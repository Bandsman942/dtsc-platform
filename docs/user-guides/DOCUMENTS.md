# Guide utilisateur — Documents
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Documents** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Rôle du module

Le module **Documents** conserve des métadonnées privées, des fichiers réels versionnés et des liens vers les objets de travail de l’entreprise.

Le bouton **Guide utilisateur** ouvre ce guide directement dans l’application.

## Créer un document

Renseignez le titre, la description, le type, la catégorie, la visibilité, le propriétaire, le département et la date d’expiration éventuelle.

La création des métadonnées ne remplace pas le téléversement d’un fichier réel.

## Téléverser une version

Chaque téléversement vérifie :

- la session ;
- l’organisation active ;
- les permissions ;
- le type MIME ;
- l’extension ;
- la taille ;
- le stockage privé ;
- la révision courante.

Chaque fichier accepté crée une nouvelle version. L’ancienne version reste conservée.

## Recherche, aperçu et téléchargement

La liste est paginée et filtrable. Le téléchargement utilise une URL signée temporaire créée après contrôle d’accès.

Les images et PDF peuvent être prévisualisés lorsque le navigateur et le service le permettent. Une URL signée ne constitue jamais un lien public permanent.

## Lier un document

Un même document peut être relié à plusieurs tâches, demandes, validations, réunions, contrats, projets, actifs, fournisseurs ou achats sans dupliquer le fichier.

Le lien canonique utilise l’identifiant de l’objet et son organisation.

## Versions et historique

Le détail affiche les versions, numéros, noms de fichiers, auteurs et dates. Une nouvelle version ne remplace pas silencieusement l’historique.

## Indexation documentaire avancée

L’indexation avancée est protégée par une configuration serveur.

Lorsque le fournisseur n’est pas configuré :

- l’état `NOT_CONFIGURED` est enregistré ;
- l’utilisateur reçoit une explication ;
- aucune erreur non contrôlée n’est produite ;
- aucune fausse indexation n’est annoncée.

Lorsque le fournisseur est configuré, le serveur :

1. revérifie les permissions ;
2. génère une URL signée courte pour la version ;
3. appelle le fournisseur depuis le serveur ;
4. conserve le fournisseur, le statut, le checksum, le nombre de segments et la référence d’index ;
5. n’expose jamais la clé API au client.

## Comparaison visuelle de versions

La comparaison exige deux versions différentes du même document.

Sans fournisseur configuré, la fonction reste désactivée proprement.

Avec un fournisseur configuré, le serveur transmet deux URLs signées temporaires, enregistre le statut, le résumé et la référence du résultat visuel, puis audite l’opération.

## Visibilité et sécurité

Les capacités dépendent du créateur, du propriétaire, du département, de la visibilité, des accès explicites et des permissions du module.

Toutes les routes de lecture, version, lien, indexation et comparaison revérifient les droits côté serveur.

## Archivage

L’archivage retire le document des listes actives sans supprimer immédiatement les fichiers, versions ou liens historiques.

## Accès et permissions

- Ouvrez le module depuis la navigation du contexte actif.
- Les boutons et actions dépendent du rôle, du poste officiel, des permissions individuelles, du tenant actif et de l’état du module.
- Une action masquée dans l’interface reste également refusée par le serveur lorsqu’elle n’est pas autorisée.
- Sur mobile, utilisez le parcours liste → détail plein écran → formulaire plein écran → retour.

## Statuts, validations et traçabilité

- Les statuts visibles correspondent aux états réellement persistés ; les codes techniques ne sont pas présentés comme libellés métier.
- Les validations, refus, annulations, réouvertures et actions sensibles conservent leur auteur, leur date et, lorsque requis, leur motif.
- Une action répétée avec la même clé métier ne doit pas produire de doublon ni un second impact.

## Sécurité et confidentialité

- Les données sont limitées à l’utilisateur ou à l’organisation autorisée.
- Les références reçues du navigateur sont revérifiées côté serveur dans le même contexte.
- Les documents et informations sensibles utilisent les routes privées et les contrôles d’accès prévus par le module.

## Dépannage

- Actualisez la vue si une opération validée n’apparaît pas immédiatement.
- Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau.
- En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.
