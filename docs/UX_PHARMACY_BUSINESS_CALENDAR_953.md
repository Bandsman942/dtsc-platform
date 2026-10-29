# UX-02C — Calendrier métier des ventes Pharmacie (#953)

## Anomalie
Avant #953, `lib/pharmacy-sales.ts#getSalesDataset` découpait les journées et les mois à minuit UTC. Pour une pharmacie en `Africa/Kinshasa`, une vente entre 23 h UTC et minuit UTC était comptée dans le mauvais jour. La vue « Aujourd'hui », `today`, `todayAmount` et `stockImpacted` pouvaient diverger du jour local ; `monthAmount` pouvait diverger au changement de mois.

## Source de vérité
`Organization.timezone` est récupéré via `getEnterpriseBusinessContext(prisma, organizationId)`. Le helper canonique `lib/enterprise/business-context.ts` est étendu par `enterpriseBusinessCalendarWindows(at, timezone)`, sans créer de contexte temporel concurrent.

La fonction fournit des intervalles UTC **semi-ouverts** :
- `day.gte` : minuit local du jour métier ;
- `day.lt` : minuit local du lendemain (calcul indépendant, **sans ajouter 24 heures**) ;
- `month.gte` : minuit local du premier jour du mois ;
- `month.lt` : minuit local du premier jour du mois suivant.

Les agrégats Prisma restent filtrés par `organizationId` et sont calculés en base ; aucune vente n'est chargée en mémoire pour en faire le total. Le fuseau de l'organisation est validé par `assertEnterpriseTimezone` ; si absent ou invalide, l'API répond un message métier sûr `ORGANIZATION_TIMEZONE_INVALID` via le résolveur d'erreurs existant. Aucun fallback silencieux vers UTC.

## QA ciblée
`node scripts/qa-ux-953-pharmacy-business-calendar.mjs` dans Quality Gates, comprenant :
1. Kinshasa à 22:30 UTC puis 23:30 UTC le même jour ;
2. New York le 8 mars 2026 (23 heures) ;
3. New York le 1er novembre 2026 (25 heures) ;
4. Fin et début du mois métier ;
5. Refus d'un fuseau invalide ;
6. Contrats d'agrégation serveur et réponse d'erreur.

## OWNER_E2E obligatoire
- Deux organisations pharmacie de test configurées respectivement en `Africa/Kinshasa` et `America/New_York`.
- Ventes d'essai proches du minuit local, notamment le jour du changement de mois : contrôler la vue « Aujourd'hui » et les KPI du jour / du mois.
- Contrôler `stockImpacted` avec les mêmes bornes de date.
- Vérifier deux devises CDF/USD : les métriques utilisant `totalAmountBase` ne peuvent être validées comme financièrement fiables sans l'audit historique séparé de #936. Ne pas additionner des devises différentes en affichage.
- Vérifier 320/390/768/1440 px, FR/EN, clair/sombre, autorisations et isolation multi-tenant.
- Fuseau invalide sur une entreprise de test : message explicite sans succès ni données partielles.

## Hors scope
- Aucune vente ou pièce comptable ancienne n'est modifiée.
- Référentiels produits/lots/ordonnances volumineux et calcul de montants historiques multidevises **restent dans #936**.
- La date Assurance Santé (Health) reste dans #936.
- La migration d'autres vues et calendriers métiers reste propre à chaque domaine.

## Livraison, rollback
Aucun schéma ni migration, aucune permission nouvelle, aucun changement d'entitlement, aucune nouvelle variable. Rollback par revert du commit applicatif après validation des checks. Production uniquement depuis `main` après CI et `OWNER_E2E`.
