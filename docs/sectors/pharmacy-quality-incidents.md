# Incidents qualité & pharmacovigilance PHARMACY

## Périmètre

Le module `QUALITY_PHARMACOVIGILANCE` remplace le registre générique par un dossier qualité structuré, isolé par `organizationId`. Il couvre les erreurs de dispensation, effets indésirables, produits suspects ou non conformes, plaintes, ruptures de conservation, investigations, actions correctives et préventives, escalades, documents privés, audit et rapports.

## Modèles

- `PharmacyQualityIncident`: signalement, qualification, criticité, contexte, action immédiate, responsable, résolution et clôture.
- `PharmacyQualityInvestigation`: analyse, cause racine, constats et conclusion.
- `PharmacyQualityCapaAction`: action corrective ou préventive, responsable, échéance et validation d'efficacité.
- `PharmacyAdverseReactionReport`: effet indésirable et niveau de gravité.
- `PharmacyCustomerComplaint`: plainte liée à un incident.
- `PharmacyQualityDocument`: référence vers un document privé contrôlé.
- `PharmacyQualityEvent`: historique auditable des transitions et actions.

Les références produit, lot, vente, ligne de vente, ordonnance, réception, retour/perte, fournisseur, alerte, département, emplacement et collaborateur sont validées côté serveur dans la même organisation.

## Règles métier

- Une suspicion de contrefaçon ou un produit rappelé devient critique.
- Un effet indésirable grave, un mauvais produit servi ou un produit périmé servi est au minimum élevé.
- Un incident critique exige une action immédiate documentée avant signalement.
- Un incident élevé ou critique exige une investigation terminée avant clôture.
- Un incident critique exige un résumé de résolution.
- Une CAPA obligatoire doit être validée avant clôture.
- La quarantaine et le blocage d'un lot sont des actions explicites, motivées et auditées; la simple création d'un incident ne modifie jamais le lot.
- Une alerte pharmacie dédiée peut être créée explicitement depuis un incident critique.

## API

| Méthode | Route | Accès | Usage |
| --- | --- | --- | --- |
| `GET` | `/api/enterprise/[organizationId]/pharmacy/quality` | lecture du module qualité | dataset, KPI et référentiels |
| `POST` | `/api/enterprise/[organizationId]/pharmacy/quality` | création du module qualité | incident, investigation, CAPA, effet indésirable ou plainte |
| `PATCH` | `/api/enterprise/[organizationId]/pharmacy/quality/[entity]/[id]` | écriture ou gestion selon action | cycle de vie, actions lots, alerte et validation |

Les mutations appliquent origine identique, rate limiting, validation Zod, entitlement, membership actif, secteur `PHARMACY`, RBAC et audit.

## Interface

L'espace dédié fournit quatorze vues réelles: tableau de bord, registre, nouvel incident, dispensation, pharmacovigilance, produits suspects, plaintes, conservation, investigations, CAPA, escalades, documents, historique et rapports. Les formulaires sont plein écran, mobile-first, avec libellés français, aides contextuelles et combobox issues des référentiels réels.

Les documents existants sont consultables. L'ajout d'un document doit continuer à passer par la route de stockage documentaire privée; aucun champ URL libre ou faux téléversement n'est proposé.

## Limites

- L'envoi réglementaire automatique des déclarations de pharmacovigilance à une autorité externe n'est pas activé faute d'intégration officielle configurée.
- La création automatique de tâches ou demandes internes depuis un incident reste à connecter à un workflow partagé multi-tenant.
- Les exports réglementaires PDF et les signatures électroniques restent à définir.
