# Guide utilisateur — Documents

## Rôle du module

Le module **Documents** conserve des métadonnées privées, des fichiers réels versionnés et des liens vers les objets de travail de l'entreprise. Il réutilise le stockage canonique et les contrôles d'accès existants.

## Créer un document

Cliquez sur **Nouveau document** et renseignez :

- le titre et la description ;
- le type et la catégorie ;
- la visibilité ;
- le propriétaire et le département ;
- la date d'expiration éventuelle.

La création des métadonnées ne remplace pas le téléversement du fichier. Après création, utilisez le formulaire de version pour envoyer un fichier réel.

## Téléverser une version

Le téléversement utilise un formulaire multipart et vérifie côté serveur :

- session et contexte entreprise ;
- droits sur le document ;
- type MIME, extension et taille ;
- stockage privé ;
- révision courante du document.

Chaque fichier accepté crée une nouvelle version. Le numéro courant augmente ; l'ancien fichier reste conservé selon la politique de rétention.

## Recherche et filtres

La liste permet de rechercher et filtrer par statut, visibilité et type. Les résultats sont paginés et chargent les métadonnées utiles, pas le contenu intégral des fichiers.

## Télécharger et prévisualiser

Le téléchargement demande une URL signée après vérification des permissions. L'aperçu dépend du format et du navigateur : images et PDF peuvent être ouverts lorsque le service le permet ; les autres formats restent téléchargeables.

Une URL signée est temporaire et ne doit pas être partagée comme lien public permanent.

## Lier un document à un objet

Utilisez **Lier** pour associer le document à une tâche, demande, validation, réunion, contrat, projet, actif, fournisseur ou achat pris en charge. Le lien utilise le mécanisme canonique `EnterpriseEntityLink` ; le fichier n'est pas copié.

Un parcours métier peut aussi ouvrir le module Documents avec un contexte de source. Le document créé est alors lié à l'objet après validation du type et de l'organisation.

## Visibilité et permissions

Les visibilités prises en charge sont notamment :

- organisation ;
- département ;
- restreint.

Le créateur, le propriétaire, les accès explicites et les gestionnaires autorisés déterminent les capacités réelles. Toute route de téléchargement, version ou lien revérifie ces droits côté serveur.

## Archivage

Archiver retire le document des listes actives sans supprimer immédiatement ses fichiers, versions ou liens. Les documents historiques restent accessibles selon les permissions et les règles de conservation.

## Documents ERP

Les documents provenant d'un module ERP restent canoniques dans le même système documentaire. Le module Documents les retrouve par lien ; il ne duplique pas les fichiers pour chaque écran.

## Limites

- La restauration d'une ancienne version comme version active n'est annoncée que si l'action est exposée par le backend.
- L'indexation du contenu intégral n'est pas automatique pour tous les fichiers ; elle dépend des règles de sécurité et des services RAG activés.
- Le partage externe public n'est pas disponible par défaut.
