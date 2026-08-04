# Guide utilisateur — Documents

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
