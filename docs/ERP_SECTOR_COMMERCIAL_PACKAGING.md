# Packaging commercial des extensions Health et Pharmacy

## 1. Principe

Une extension sectorielle n’est jamais vendue comme un moteur parallèle. Elle dépend du Core DTSC et, selon son périmètre, des modules communs de catalogue, tiers, achats, stock, Finance, documents, permissions et audit.

Un module n’entre dans une offre que s’il est implémenté, navigable, autorisé, documenté, supporté et compatible avec sa maturité réelle.

## 2. Offres de référence

### Essentiel

Socle collaboratif et administratif réellement supporté, sans promesse sectorielle non validée.

### Professionnel

Chaînes opérationnelles communes commercialement validées : CRM, ventes, achats, stock, RH, projets et Finance selon les entitlements.

### Entreprise

Gouvernance avancée, intégrations, comptabilité, reporting et extensions sectorielles après validation des dépendances et de la maturité.

### Extension Health

Peut inclure Patients, Rendez-vous, Consultations, Dossiers médicaux, Équipe médicale, Laboratoire, Pharmacie interne, Facturation médicale, Assurances, Qualité et Documents, uniquement après promotion explicite des modules concernés.

### Extension Pharmacy

Peut inclure Produits, Lots, Stock, Réceptions, Dispensation, Prescriptions, Fournisseurs, Caisse, Retours, Alertes, Qualité, Documents, Rapports et Paramètres, uniquement après promotion explicite.

## 3. Dépendances

- `MEDICAL_BILLING` dépend du catalogue et des créances communes.
- `INSURANCE_COVERAGE` dépend du CRM, de la facturation et des allocations.
- `INTERNAL_PHARMACY` dépend du catalogue, du stock et de la facturation.
- `MEDICINES_PRODUCTS` dépend du catalogue commun.
- `STOCK_RECEIPTS` dépend des achats, fournisseurs et stock communs.
- `SALES_DISPENSATION` dépend du catalogue, des lots, du stock et des créances.
- `CASH_INVOICES_PAYMENTS` dépend des factures, paiements et sessions de caisse communes.

## 4. Transparence

L’administration DTSC présente : module, secteur, dépendances, plan minimum, maturité, limites, statut commercial et date du dernier audit.

Les modules `HIDDEN`, `PLANNED` ou sans expérience professionnelle ne sont ni visibles ni annoncés comme inclus.

## 5. Clients existants

Aucun module payé et réellement supporté n’est retiré silencieusement. Toute évolution de plan ou de dépendance est documentée. Un rollback logique conserve les données, documents, lectures et historiques.

## 6. Promotion

Les modules Health et Pharmacy restent `PROFESSIONAL_READY` et `commercializable: false` jusqu’à :

1. validation manuelle authentifiée du propriétaire ;
2. Production stable ;
3. preuves et limites documentées ;
4. support prêt ;
5. PR séparée de promotion.

Titre de la PR future :

```text
chore: promote manually validated ERP modules to commercial ready
```

La PR liste précisément les modules, la date, le testeur, les preuves, les limitations et la décision commerciale.
