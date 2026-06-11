# Rapports pharmacie

## Objectif et architecture

Le module `PHARMACY_REPORTS` transforme les données opérationnelles réelles en indicateurs décisionnels. Les agrégations sont réalisées côté serveur dans `lib/pharmacy-reports.ts`, toujours avec `organizationId`. Aucun KPI, tableau ou export n'utilise de données fictives.

Les quinze vues couvrent: synthèse, ventes, stock, lots/péremptions, achats/fournisseurs, réceptions, caisse/paiements, ordonnances, retours/pertes/destructions, qualité/pharmacovigilance, alertes, documents/conformité, activité collaborateurs, vues personnalisées simples et exports/historiques.

## Dictionnaire des indicateurs

| KPI | Définition / formule | Sources | Permission |
| --- | --- | --- | --- |
| Ventes nettes | ventes validées/terminées/payées de la période | `PharmacySale` | rapports ventes |
| Chiffre des ventes | somme `totalAmount` des ventes nettes | `PharmacySale` | financière |
| Chiffre encaissé | somme des paiements au statut `PAID` | `PharmacyPayment` | financière |
| Panier moyen | chiffre des ventes / nombre de ventes nettes | `PharmacySale` | financière |
| Quantité vendue | somme des lignes des ventes nettes | `PharmacySaleLine` | rapports ventes |
| Valeur estimée stock | quantité disponible du lot × prix d'achat/référence | `PharmacyBatch`, `PharmacyProduct` | financière |
| Rupture | somme des quantités disponibles d'un produit ≤ 0 | `PharmacyBatch` | rapports stock |
| Stock faible | disponibilité ≤ seuil minimal produit | `PharmacyBatch`, `PharmacyProduct` | rapports stock |
| Lots expirés | lot dont `expiryDate` est antérieure à maintenant | `PharmacyBatch` | rapports lots |
| Pertes estimées | somme `estimatedValue` des événements | `PharmacyReturnLossEvent` | financière |
| Incidents critiques | incidents dont la criticité est `CRITICAL` | `PharmacyQualityIncident` | sensible |
| Alertes ouvertes | alertes avec statut opérationnel actif | `PharmacyAlert` | rapports alertes |
| Documents expirés | documents avec `expiryDate` dépassée | `PharmacyDocument` | rapports documents |
| Documents manquants | règles documentaires non résolues | `PharmacyMissingDocument` | rapports documents |

## Filtres et sécurité

- période, produit, lot, fournisseur, collaborateur, département et statut;
- combobox alimentées uniquement avec les référentiels de l'organisation active;
- montants financiers masqués sans permission financière;
- ordonnances, qualité et accès documentaires sensibles masqués sans permission sensible;
- exports sensibles soumis à une permission renforcée et journalisés.

## Vues, snapshots et exports

- `PharmacySavedReportView` conserve un domaine et ses filtres contrôlés; aucun SQL libre n'est accepté.
- `PharmacyReportSnapshot` conserve une photographie décisionnelle JSON d'un rapport autorisé.
- `PharmacyReportExport` journalise les exports CSV et leur sensibilité.
- Le CSV est généré côté serveur, respecte les filtres et utilise `Cache-Control: private, no-store`.

## API

| Méthode | Route | Accès / usage |
| --- | --- | --- |
| `GET` | `/api/enterprise/[organizationId]/pharmacy/reports` | dataset agrégé, filtres et options |
| `POST` | `/api/enterprise/[organizationId]/pharmacy/reports` | sauvegarder une vue |
| `PATCH` | `/api/enterprise/[organizationId]/pharmacy/reports/actions/[entity]/[id]` | archiver une vue ou créer un snapshot |
| `POST` | `/api/enterprise/[organizationId]/pharmacy/reports/export` | export CSV contrôlé et audité |

## Limites restantes

- Les exports Excel/PDF ne sont pas affichés tant qu'un générateur fiable n'est pas branché.
- Les graphiques avancés ne sont pas ajoutés; les KPI et tableaux restent prioritaires et réels.
- Les grands volumes nécessiteront des agrégations SQL matérialisées ou une pagination backend plus fine.
