# Modèle standard de gestion documentaire

## Autorité canonique

La gestion documentaire réutilise les modèles déjà déployés :

- `EnterpriseDocument` pour les métadonnées, la visibilité, le propriétaire, l'état et la version courante ;
- `EnterpriseDocumentVersion` pour chaque fichier stocké ;
- `EnterpriseDocumentAccess` pour les accès explicites ;
- `EnterpriseEntityLink` pour relier un document à plusieurs objets métier.

L'itération 4 n'ajoute pas une deuxième table de documents, de fichiers ou de liens documentaires.

## Téléversement

Une version est téléversée dans le stockage privé sous un chemin tenant-scoped. Le serveur vérifie le membership, les capacités, la taille, le type MIME, l'extension, la révision et calcule le checksum prévu. Aucun `getPublicUrl` n'est utilisé pour les documents privés.

## Versionnement

Chaque version possède un numéro unique par document, le fichier, l'auteur, la date et les métadonnées de stockage. Le document pointe vers sa version courante. Une nouvelle version ne supprime pas l'ancienne.

## Liens multiples

La route de liaison utilise `createEnterpriseLink` avec :

- source `DOCUMENTS / EnterpriseDocument / documentId` ;
- cible autorisée : contrat, projet, actif, tâche, demande, validation, réunion, fournisseur ou achat ;
- organisation, type de lien, libellé et auteur.

La cible est validée côté serveur dans le même tenant. Le binaire n'est jamais copié pour créer un lien supplémentaire.

## Accès

La lecture, le téléchargement, la création de version, la modification et la liaison sont déterminés par :

- le rôle de gestion ;
- le créateur ou propriétaire ;
- la visibilité organisation/département/restreinte ;
- les accès explicites ;
- l'état archivé.

Une URL signée est créée uniquement après ce contrôle et reste temporaire.

## Recherche et performance

Les listes chargent les métadonnées, utilisent la pagination et ne téléchargent pas les fichiers. Les versions et liens sont chargés à la demande. L'indexation du contenu intégral est séparée du système de stockage et doit respecter les mêmes permissions.

## Archivage et conservation

L'archivage est logique : les fichiers, versions, liens et audits sont conservés. La suppression physique ou la rétention légale nécessitent une politique dédiée et ne sont pas déclenchées par un simple bouton de liste.

## Limites

- La restauration d'une version historique comme version active dépend des routes réellement exposées.
- Le partage public externe est désactivé par défaut.
- Les obligations légales de rétention sont configurées par secteur et juridiction ; elles ne sont pas déduites automatiquement.
