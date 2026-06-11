# Paramètres pharmacie

## Objectif

Le sous-module `PHARMACY_SETTINGS` centralise les règles opérationnelles de chaque pharmacie cliente. Aucun paramètre livré ici n'est seulement décoratif: les services métier chargent la configuration effective côté serveur avant d'autoriser ou d'appliquer une opération.

## Modèles et isolation

- `PharmacySetting`: configuration courante structurée par domaine.
- `PharmacySettingsProfile`: profil par défaut ou profil de référence de l'organisation.
- `PharmacyNumberingSequence`: préfixe, format et compteur atomique par type d'objet.
- `PharmacySettingsAuditLog`: ancienne valeur, nouvelle valeur, motif, acteur, criticité et contexte technique.

Toutes les lectures et écritures sont filtrées par `organizationId`. Les paramètres critiques exigent une permission renforcée et un motif exploitable.

## Sections disponibles

L'interface fournit dix-sept sections: Général; Numérotation & préfixes; Produits & lots; Stock & inventaire; Péremptions & FEFO; Ventes & dispensation; Ordonnances; Réceptions & achats; Caisse, factures & paiements; Retours, ajustements & pertes; Alertes & notifications; Documents & conformité; Qualité & pharmacovigilance; Rapports & exports; Confidentialité & sécurité; Intégrations ERP; Historique des paramètres.

Les champs visibles utilisent des libellés métier français, une aide contextuelle et des listes traduites. Les références comme l'emplacement de stock sont alimentées depuis les données réelles de l'organisation.

## Règles connectées

- Ventes et lots: stock négatif, rupture, édition de prix, remises, vente anonyme, prescription, blocage des statuts de lot et FEFO.
- Réceptions et achats: commande ou fournisseur requis et durée minimale restante avant péremption.
- Caisse: session obligatoire, sessions multiples, validation des remboursements, durée et écart critique.
- Documents et conformité: délai d'alerte d'expiration et audit des téléchargements sensibles.
- Qualité: CAPA obligatoire avant clôture d'un incident critique.
- Alertes: seuils et activations synchronisés avec `PharmacyAlertSetting`.
- Rapports: export sensible activable ou bloqué côté serveur.

Les numéros de vente, réception, session caisse, paiement, facture, reçu, remboursement et incident qualité sont générés par `generatePharmacyEntityNumber()` dans une transaction Prisma.

## API

| Méthode | Route | Accès | Usage |
| --- | --- | --- | --- |
| `GET` | `/api/enterprise/[organizationId]/pharmacy/settings` | membre PHARMACY autorisé | charger paramètres, référentiels, séquences et historique autorisé |
| `PATCH` | `/api/enterprise/[organizationId]/pharmacy/settings` | gestionnaire autorisé | modifier une section validée |
| `POST` | `/api/enterprise/[organizationId]/pharmacy/settings/actions` | gestionnaire autorisé | réinitialiser, appliquer les défauts, prévisualiser ou modifier une séquence |

Les mutations appliquent protection d'origine, rate limiting, validation Zod, contrôle du module, RBAC, isolation tenant, `AuditLog` et historique métier.

## Limites

- Les fréquences de remise à zéro des compteurs sont persistées mais leur planification calendaire automatique reste à brancher.
- Les intégrations ERP restent des paramètres préparatoires tant qu'aucun connecteur partenaire n'est configuré.
- Le fallback mémoire du rate limit doit être remplacé par Upstash Redis pour une forte charge multi-instance.
