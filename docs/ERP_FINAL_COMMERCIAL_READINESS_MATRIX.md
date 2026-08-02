# Matrice finale de préparation commerciale ERP

**Date :** 3 août 2026  
**Principe :** la maturité technique, la maturité produit et la décision commerciale sont trois décisions distinctes.

## Règles de décision

Un module peut être `COMMERCIAL_READY` uniquement si :

1. son workspace, ses formulaires, détails, actions, permissions, documents, historique, français et responsive sont conformes ;
2. les Quality Gates passent ;
3. la Production correspond à `main` et reste stable ;
4. la validation manuelle authentifiée du propriétaire est confirmée ;
5. la documentation, le support, les limites et la récupération sont disponibles ;
6. une **PR séparée** enregistre explicitement la promotion.

Une présence en Production ne suffit jamais.

## Synthèse par programme

| Périmètre | Niveau actuel | Validation manuelle | Commercialisable | Décision |
|---|---|---|---|---|
| Référentiels & commerce — itération 2 | COMMERCIAL_READY | Confirmée antérieurement | Oui | Conserver et surveiller |
| Opérations — itération 3 | COMMERCIAL_READY | Confirmée antérieurement | Oui | Conserver et surveiller |
| Finance opérationnelle — itération 4 | COMMERCIAL_READY | Confirmée le 2 août 2026 | Oui | Conserver et surveiller |
| Comptabilité & clôture — itération 5 | PROFESSIONAL_READY | En attente | Non | Ne pas promouvoir dans cette PR |
| Health — itération 6 | PROFESSIONAL_READY | En attente | Non | Exécuter la campagne Health |
| Pharmacy — itération 6 | PROFESSIONAL_READY | En attente | Non | Exécuter la campagne Pharmacy |
| Modules Core encore OPERATIONAL_UI | OPERATIONAL_UI | Campagne finale en attente | Non | Finir l’acceptation produit avant promotion |

## Modules Health

| Module | Packaging possible | Dépendances obligatoires | Niveau actuel | Condition de promotion |
|---|---|---|---|---|
| Patients | Offre Health | Identité, permissions, documents | PROFESSIONAL_READY | I06-H-001 et confidentialité réussis |
| Rendez-vous | Offre Health | Patients, équipe médicale | PROFESSIONAL_READY | I06-H-002 et mobile réussis |
| Consultations | Offre Health | Patients, équipe médicale | PROFESSIONAL_READY | I06-H-002 et confidentialité réussis |
| Dossiers médicaux | Offre Health avancée | Patients, documents privés | PROFESSIONAL_READY | Accès, historique et révocation validés |
| Équipe médicale | Offre Health | Membres, postes, consentement | PROFESSIONAL_READY | Permissions et liaisons validées |
| Laboratoire | Offre Health avancée | Patients, consultations | PROFESSIONAL_READY | I06-H-003 réussi |
| Pharmacie interne | Option Health Pharmacy | Catalogue, stock, lots | PROFESSIONAL_READY | FEFO et mouvement unique validés |
| Facturation médicale | Offre Health Finance | Catalogue, créances, paiements | PROFESSIONAL_READY | I06-H-004 réussi |
| Assurances | Offre Health Finance | CRM, créances, allocations | PROFESSIONAL_READY | Ventilation et paiements validés |
| Incidents qualité | Offre Health avancée | Permissions, documents | PROFESSIONAL_READY | Confidentialité et workflow validés |
| Documents médicaux | Offre Health | Stockage privé, audit | PROFESSIONAL_READY | Upload, version et téléchargement validés |

## Modules Pharmacy

| Module | Packaging possible | Dépendances obligatoires | Niveau actuel | Condition de promotion |
|---|---|---|---|---|
| Produits & médicaments | Offre Pharmacy | Catalogue commun | PROFESSIONAL_READY | I06-P-001 réussi |
| Lots & péremptions | Offre Pharmacy | Produits, documents | PROFESSIONAL_READY | I06-P-001 et I06-P-003 réussis |
| Stock & inventaire | Offre Pharmacy | Catalogue, stock commun | PROFESSIONAL_READY | I06-P-006 réussi |
| Réceptions | Offre Pharmacy | Achats, fournisseurs, stock | PROFESSIONAL_READY | Réception unique validée |
| Ventes & dispensation | Offre Pharmacy | Lots, stock, créances | PROFESSIONAL_READY | I06-P-002 et I06-P-003 réussis |
| Prescriptions | Offre Pharmacy | Patients/clients, produits | PROFESSIONAL_READY | Validation pharmacien et confidentialité validées |
| Fournisseurs & commandes | Offre Pharmacy | Tiers, achats, dettes | PROFESSIONAL_READY | Source commune et absence de doublon validées |
| Caisse, factures & paiements | Offre Pharmacy Finance | Caisse, paiements, comptabilité | PROFESSIONAL_READY | I06-P-004 réussi |
| Retours, ajustements & pertes | Offre Pharmacy | Stock, finance | PROFESSIONAL_READY | Mouvement inverse et audit validés |
| Alertes & rappels | Offre Pharmacy avancée | Lots, qualité | PROFESSIONAL_READY | I06-P-005 réussi |
| Qualité & pharmacovigilance | Offre Pharmacy avancée | Produits, documents | PROFESSIONAL_READY | Confidentialité et workflow validés |
| Documents & conformité | Offre Pharmacy | Stockage privé, audit | PROFESSIONAL_READY | Upload/version/expiration validés |
| Rapports Pharmacy | Offre Pharmacy Pro | Sources communes et spécialisées | PROFESSIONAL_READY | Absence de double comptage validée |
| Paramètres Pharmacy | Offre Pharmacy | Permissions et audit | PROFESSIONAL_READY | Paramètres critiques et double validation testés |

## Packaging recommandé

### Essentiel

Socle commun réellement supporté : tâches, demandes, réunions, documents, référentiels et fonctionnalités incluses dans le plan. Aucun module sectoriel n’est ajouté si sa maturité ou ses dépendances ne correspondent pas à la promesse.

### Professionnel

Ajoute les chaînes métier commercialement validées : ventes, achats, stock, RH, projets et Finance opérationnelle selon le plan et le secteur.

### Entreprise

Ajoute personnalisation, gouvernance, intégrations, modules avancés et extensions sectorielles après validation manuelle et promotion explicite.

### Health et Pharmacy

Les offres sectorielles sont des extensions du Core, jamais des ERP parallèles. Elles doivent déclarer clairement les dépendances Core/Finance, les limites réglementaires et le périmètre de support.

## Clients existants

- Ne retirer silencieusement aucun module payé et supporté.
- Documenter toute évolution de plan, dépendance ou limite.
- Conserver les données et lectures lors d’un rollback logique.
- Ne pas promettre un module HIDDEN, PLANNED ou non validé.

## Procédure de promotion future

Après confirmation des scénarios concernés :

1. documenter date, testeur, captures et limitations ;
2. corriger et retester les défauts ;
3. vérifier Production et observabilité ;
4. ouvrir `chore: promote manually validated ERP modules to commercial ready` ;
5. lister précisément les modules promus ;
6. ne modifier aucune autre fonctionnalité dans cette PR ;
7. fusionner uniquement après Quality Gates verts.

Tant que cette procédure n’est pas terminée, les modules des itérations 5 et 6 restent `PROFESSIONAL_READY` et `commercializable: false`.
