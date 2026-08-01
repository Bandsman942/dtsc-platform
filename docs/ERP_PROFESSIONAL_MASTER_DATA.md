# Référentiels ERP professionnels — Itération 2

## Périmètre

Cette itération professionnalise les modules `CRM_CUSTOMERS`, `CATALOG` et `SITES_WAREHOUSES` sans dupliquer les modèles communs existants.

## Tiers et clients

Une fiche métier peut représenter une personne ou une organisation, cumuler plusieurs rôles, conserver ses coordonnées, adresses et relations commerciales, et rester utilisable sans compte DTSC. La détection de doublons est indicative : aucune fusion automatique n’est autorisée. Les modifications utilisent une révision optimiste et les suppressions métier sont remplacées par une désactivation ou un archivage logique.

Pour une personne, le formulaire propose une création manuelle, une invitation privée, une invitation à créer un compte ou une liaison ultérieure. La liaison n’est active qu’après consentement et approbation.

## Catalogue

Le catalogue commun gère produits, services, catégories, unités, prix de référence, devise, fiscalité et suivi de stock. Les changements de prix créent une période historique. Les lots, médicaments, informations cliniques et règles sectorielles restent dans les domaines spécialisés.

## Sites et entrepôts

La hiérarchie canonique est : entreprise → site → entrepôt → emplacement. Les références croisées sont contrôlées par `organizationId`. Sur mobile, la hiérarchie utilise une liste imbriquée et non un arbre horizontal.

## Sécurité

Chaque route applique session, contexte actif, entreprise cliente, module, permission, même origine, Zod, limitation de débit, transaction, journal API et audit. Aucun sélecteur n’expose un UUID à l’utilisateur.
