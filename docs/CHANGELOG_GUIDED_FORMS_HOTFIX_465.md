# Hotfix #465 — formulaires guidés et sélections contrôlées

Date : 21 août 2026

## Objectif

Réduire les erreurs de saisie et le coût d’apprentissage des formulaires DTSC en rapprochant les formulaires professionnels du niveau d’aide déjà présent dans l’éditeur de profil.

## Changements

- le contrat `docs/ENTERPRISE_FORM_UX_CONTRACT.md` s’applique désormais à tous les formulaires professionnels de DTSC Platform ;
- la primitive `FormField` affiche une aide plus lisible et supporte les états requis/erreur ;
- la primitive ERP `Field` affiche désormais l’aide contextuelle sous le contrôle au lieu de dépendre uniquement d’un tooltip ;
- des catalogues contrôlés FR/EN sont disponibles pour les devises usuelles et les unités communes ;
- le formulaire **Nouvel achat** utilise une devise contrôlée et une unité contrôlée, avec aide visible pour l’objet, la demande source, le fournisseur, la ligne budgétaire, l’acheteur, le département, la priorité, la devise, la livraison, la description et chaque colonne d’une ligne d’achat ;
- les lignes d’achat utilisent une grille mobile `minmax(0,1fr)` et des champs explicitement étiquetés ;
- les dialogues d’approbation et de réception d’achat reçoivent également une aide métier ;
- une QA statique `qa-guided-form-contract-checks.mjs` empêche la régression du formulaire d’achat vers une devise ou une unité en saisie libre et est intégrée à `qa:regression` ;
- `components/AGENTS.md` rend le contrat de formulaire guidé opposable aux futurs composants.

## Base de données

Aucune migration Prisma et aucun backfill.

## Sécurité et multi-tenant

Aucune permission n’est élargie. Les sélecteurs de fournisseur, demande, budget, membre et département conservent leurs sources existantes filtrées par organisation et la validation serveur reste autoritative.

## Livraison

Aucun Preview Vercel. La Production reste réservée au commit fusionné sur `main` après les Quality Gates et l’OWNER_E2E requis par `docs/CONTRIBUTING.md`.
