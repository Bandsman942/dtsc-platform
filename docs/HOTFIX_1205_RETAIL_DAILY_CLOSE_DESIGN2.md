# HOTFIX #1205 — Clôture magasin Design 2.0, comptage et isolement SHOP

Statut : **en validation CI + E2E propriétaire**. Version cible `1.23.1`.

## Objet et portée
Le module `RETAIL_DAILY_CLOSE` reste disponible au RETAIL général comme au sous-secteur SHOP. Il n'utilise plus de champ texte du type `50000x2,20000x3` : l'utilisateur sélectionne un compte, saisit le nombre de billets/pièces de chaque coupure préchargée (CDF ou USD), et peut saisir une autre coupure avec sa quantité. Le total compté et l'écart par rapport au solde opérationnel sont calculés en direct. Les autres comptes (ex. Mobile Money/Clearing) gardent un rapprochement de montant distinct et une justification d'écart.

## Implémentation
- `components/enterprise/professional/retail-daily-close-cash-count.tsx` : réutilisation de `cashDenominationsForCurrency` (source commune avec « Clôture de caisse »), rendu quantité par coupure, coupure personnalisée, bilan théorique/compté/écart, justification contextuelle. Les quantités sont des entiers non négatifs bornés.
- `components/enterprise/professional/retail-daily-close-workspace.tsx` : même contrat module du DTSC Design 2.0 (Workspace/Header/Metrics/Toolbar/Section/BusinessList), sections compactes plein écran, status rail, recherche numéro/note, dates, filtres boutique, pagination 50 par page, export CSV limité à la page visible, toasts typés, FR/EN, responsive et couleurs d'écart.
- API `retail/daily-close` : recherche et bornes de dates inclusives côté serveur, conservation des contrôles d'accès aux boutiques et des capacités d'approbation indépendante.
- `app/enterprise-modules/retail-page.tsx` : ne rend les deux sections Shop historiques que lorsque `getBusinessSubtypeSelection` retourne `COMMERCE_RETAIL / SHOP`; la compatibilité des anciens SHOP demeure via le résolveur canonique.
- Routes `historical-imports` GET, POST, preview et apply : renvoient HTTP 403 aux entreprises Retail générales. Le masquage visuel n'est donc pas le seul contrôle d'accès.
- Panneau de reprise SHOP : sections compactes et notifications contextuelles, sans toucher aux opérations historiques enregistrées.

## Intégrité Finance
Conservée sans migration DB : comptes financiers canoniques, séparation boutique/devise, validations de session de caisse, motif obligatoire pour écarts, contraintes d'idempotence, décision indépendante et revalidation des totaux et des droits sur le serveur (`createRetailDailyClose`).

La saisie manuelle du solde déclaré n'existe plus pour une caisse CASH sélectionnée : le solde résulte exclusivement du comptage physique; le serveur vérifie l'égalité `somme(coupure × quantité) = montant déclaré`.

## Non-objectifs
Aucune modification des données de caisse existantes, aucune fusion avec les écritures d'ouverture/fermeture comptables, aucun basculement de sous-secteur, aucune création de compte financier. L'export CSV ne représente que la page actuellement filtrée, pas l'ensemble des périodes.

## Contrôles de livraison
- `pnpm qa:retail-daily-close-design2-1205` dans Quality gates.
- `pnpm type-check`, Quality, Migration, régression Retail, test E2E manuel selon `OWNER_E2E_1205_RETAIL_DAILY_CLOSE_DESIGN2.md`.
- **E2E non déclaré BON tant que les preuves CI et le retour du propriétaire ne sont pas disponibles.**
- Branche `fix/1205-retail-daily-close-design2`, PR unique vers `main`; aucune preview ni déploiement manuel. Fusion autorisée seulement après « E2E final BON ».

## Risque et rollback
La présentation du formulaire change. Risque particulier : anciennes habitudes de saisie par texte; prévoir un test de coupure personnalisée sur CDF/USD. Retour arrière applicatif par revert de la PR si nécessaire, sans migration ni suppression de données.
