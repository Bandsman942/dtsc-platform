# Documents & conformité PHARMACY

## Référentiel unifié

Le module `PHARMACY_DOCUMENTS` centralise les nouveaux documents de la pharmacie dans `PharmacyDocument` sans supprimer ni dupliquer les documents spécialisés existants. Les compteurs agrègent également `PharmacySupplierDocument`, `PharmacyReceiptDocument`, `PharmacyPrescriptionDocument`, `PharmacyReturnLossDocument` et `PharmacyQualityDocument`.

Le référentiel dédié utilise:

- `PharmacyDocument`: métadonnées, fichier privé, classification, confidentialité, conformité, expiration, validation et renouvellement;
- `PharmacyDocumentLink`: liens vers les objets métier réels;
- `PharmacyDocumentVersion`: versions de fichier immuables;
- `PharmacyDocumentAccessLog`: téléchargements et accès sensibles;
- `PharmacyDocumentComplianceRule`: règles documentaires activables par organisation;
- `PharmacyMissingDocument`: documents obligatoires réellement manquants.

## Règles documentaires

- Tous les objets liés sont vérifiés dans le même `organizationId`.
- Les fichiers sont stockés sous `pharmacy/{organizationId}/{documentId}/...` dans Supabase Storage et ne sont servis que par une route privée.
- Aucun fichier sensible n'est exposé avec une URL publique.
- Si Supabase Storage est absent, seules les métadonnées peuvent être enregistrées; aucun faux téléversement n'est affiché.
- Un téléchargement sensible est contrôlé côté serveur et journalisé.
- Un document validé n'est jamais écrasé silencieusement; le renouvellement crée un nouveau document brouillon lié à l'ancien.
- Les documents expirés ou proches expiration créent des alertes `PharmacyAlert` dédupliquées.
- Les règles de documents manquants ciblent uniquement des objets réels: fournisseur actif, réception validée, destruction validée, incident qualité critique et lot rappelé.

## API

| Méthode | Route | Usage |
| --- | --- | --- |
| `GET`, `POST` | `/api/enterprise/[organizationId]/pharmacy/documents` | dataset documentaire et création métadonnées/fichier |
| `PATCH` | `/api/enterprise/[organizationId]/pharmacy/documents/actions/[entity]/[id]` | validation, rejet, archivage, renouvellement, liens, règles et détection |
| `GET` | `/api/enterprise/[organizationId]/pharmacy/documents/[id]/download` | téléchargement privé et audit |

Toutes les mutations appliquent session, origine identique, rate limiting, Zod, entitlement, membership actif, secteur `PHARMACY`, RBAC, confidentialité, `organizationId`, AuditLog et ApiLog.

## Règles initiales de conformité

- fournisseur actif: document de conformité fournisseur;
- réception validée: bon de livraison;
- destruction validée: procès-verbal de destruction;
- incident qualité critique: rapport ou preuve d'incident;
- lot rappelé: document de rappel.

Ces règles sont initialisées par organisation et peuvent être désactivées par un gestionnaire autorisé. Aucun manque n'est inventé hors règle active et objet réel.

## Limites

- Le remplacement de fichier avec restauration interactive d'une ancienne version n'est pas encore exposé dans l'interface.
- Les documents spécialisés historiques sont agrégés dans les KPI mais restent consultables depuis leur module d'origine.
- La création automatique de tâches et demandes internes depuis un document manquant reste à connecter au workflow commun.
