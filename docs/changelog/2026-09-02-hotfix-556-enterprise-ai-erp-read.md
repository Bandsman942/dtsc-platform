# 2026-09-02 — Hotfix #556 Enterprise AI ERP READ

## Corrigé

- L’Assistant IA Entreprise ne confond plus « ne pas recopier le JSON brut » avec « ne pas restituer les valeurs métier ».
- Les montants, devises, quantités, prix, coûts, marges, dates, références, statuts, noms et libellés présents dans un résultat autorisé peuvent être restitués fidèlement.
- Les lectures Stock & logistique utilisent les champs canoniques `EnterpriseStockMovement` (`movementType`, `direction`, `quantity`, `balanceAfter`, `reason`, `sourceEntityType`) au lieu de champs inexistants.

## Étendu

- Ajout de 25 READ ERP certifiés pour les modules métier communs et Retail : tâches, demandes, validations, réunions, workflows, achats, documents, rapports, clients, catalogue, sites, CRM, ventes, contrats, stock, RH, temps, paie, projets, livrables, actifs, POS, Mobile Money, Télécom et clôture magasin.
- Chaque outil reste statiquement lié à un module canonique et réautorisé par le Tool Gateway avec les permissions réelles de l’utilisateur.
- Mobile Money expose les montants, frais, commissions et effets caisse/float autorisés sans transmettre les numéros de téléphone bruts.

## Sécurité

- Aucun accès Prisma dynamique.
- Aucune mutation ajoutée.
- Aucun contournement du RBAC, du plan, du secteur, des entitlements, des dépendances ou de l’isolation tenant.
- Les identifiants backend inutiles, secrets, tokens, payloads bruts, métadonnées internes et chaînes de pensée restent exclus.

## QA

- Ajout de `scripts/qa-hotfix-556-enterprise-ai-erp-read.mjs`.
- Intégration de ce contrôle au gate standard IA `scripts/qa-standard-modules-iteration-05.mjs`.

## Migration / configuration

- Aucune migration Prisma.
- Aucune nouvelle variable d’environnement.
- Aucun Preview Vercel prévu ; Production uniquement depuis `main` après validation et merge.
