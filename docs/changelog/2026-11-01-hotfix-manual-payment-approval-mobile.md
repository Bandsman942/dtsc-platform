# Hotfix — validation des paiements manuels, interface mobile

Date : 2026-11-01. Périmètre : Console DTSC / Abonnement / Paiements à valider.

## Problème constaté

Sur un écran mobile étroit, le nom de l'entreprise et les boutons « Valider » / « Refuser » partageaient la même ligne. Le titre était réduit à quelques caractères par ligne, tandis que le badge « Entreprise » s'affichait verticalement. Le tableau des demandes ne fournissait pas de recherche, de pagination serveur ni de vue détaillée homogène.

## Correction

- Remplacement des grandes cartes par des lignes compactes (`BusinessListItem`) : nom sur sa propre largeur, badges non comprimés, résumé financier et référence.
- Actions accessibles par « … » sur chaque ligne et fiche plein écran (`FullscreenEntityDetail`) avec les détails de règlement, la séparation demandeur/validateur, l'état de facture et les boutons de décision en bas d'écran.
- Confirmation explicite avant validation/refus avec rappel du bénéficiaire, de l'offre, du montant et de la référence. La route de mutation financière existante et ses protections restent inchangées.
- Recherche nominative/par offre/référence, filtre par statut, période et pagination de 20 demandes par page, appliqués côté serveur avant renvoi des résultats.
- Filtrage des demandes attribuées maintenu au niveau de la requête de base (pas seulement dans l'interface). Un lien de notification peut mettre une demande attribuée en avant à l'ouverture, sans contourner les filtres ensuite.
- Validation stricte des dates, borne de page et limite de débit sur la lecture.

## Vérification

- `pnpm type-check`, `pnpm lint`, `pnpm qa:responsive-ui`.
- `node scripts/qa-hotfix-manual-payment-validator-mobile.mjs`.
- `node scripts/qa-hotfix-saas-approval-renewal-treasury.mjs`.
- `pnpm qa:dtsc-payments-core` et `pnpm qa:regression`.

Un E2E connecté à une base de données et une validation visuelle sur appareils 320/360/375/390/414 px sont requis avant fusion et mise en production. Le parcours métier de validation et d'écriture comptable ne change pas.
