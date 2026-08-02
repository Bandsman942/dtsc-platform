# Module professionnel Health — Documents médicaux

**Code canonique :** `MEDICAL_DOCUMENTS`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Tout document possède patient, organisation, type, classification, niveau de confidentialité, objet lié, auteur, version, stockage, dates, permission et audit.

## Expérience

Le workspace permet import réel, prévisualisation, recherche, filtres, téléchargement, version, archivage et remplacement contrôlé. Le document peut être lié à une consultation, un examen ou un dossier autorisé.

## Stockage et sécurité

Le fichier est stocké dans l’espace privé Health. Les routes contrôlent MIME, taille, membership, secteur, module, permission et visibilité de l’objet. Une URL saisie manuellement n’est jamais l’unique méthode d’ajout.

Finance ne peut pas télécharger ou prévisualiser un document médical. Les accès et téléchargements sensibles sont audités.

## Versions

Une nouvelle version conserve l’ancienne. L’archivage ne détruit pas l’historique et un remplacement exige une action explicite.

## Validation

QA automatisée : upload, versions, téléchargement privé, tenant isolation, audit et responsive.  
E2E propriétaire : scénario `I06-H-005` et transversal `F-009`.
