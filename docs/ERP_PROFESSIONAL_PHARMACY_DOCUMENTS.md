# Module professionnel Pharmacy — Documents et conformité

**Code canonique :** `PHARMACY_DOCUMENTS`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Documents couverts

Licences, autorisations, certificats, fiches qualité, rappels, documents fournisseurs, preuves de destruction, procédures et contrôles de température.

## Expérience

Le workspace affiche type, propriétaire, objet lié, dates, expiration, responsable, statut, version, alerte, prévisualisation et téléchargement.

## Stockage

Les fichiers utilisent un upload réel vers le stockage privé Pharmacy. Les routes contrôlent MIME, taille, tenant, module, permission et objet lié. Les versions antérieures restent consultables selon les droits.

## Alertes

Les expirations sont notifiées à l’avance selon une configuration maîtrisée. La notification n’expose pas de contenu sensible.

## Validation

QA automatisée : upload, version, téléchargement privé, expiration, audit et tenant isolation.  
E2E propriétaire : campagne `F-009`.
