# Issue 305 — Convergence des confirmations asynchrones DTSC

## Objectif

Supprimer les derniers usages natifs de `window.confirm()` dans les composants et faire de `confirmSensitiveAction(...)` l’unique contrat de confirmation explicite côté client, sans monkey-patch global ni replay de clic DOM.

## Audit réel sur `main`

L’allowlist #303 couvrait deux fichiers, mais l’audit du fichier Collaboration a révélé cinq actions natives dans `Mes Collaborateurs` : suppression de filtre, suppression de message, retrait/transfert de membre, blocage d’un collaborateur et suppression/quittage d’un groupe. Le Calendrier contenait une sixième confirmation native pour l’acceptation malgré conflit non bloquant. Les six parcours sont migrés ensemble afin de satisfaire le critère opposable « aucun `window.confirm()` dans `components/**` ».

## Contrat livré

- toutes les confirmations Collaboration utilisent les libellés FR/EN canoniques du domaine ;
- le DELETE/PATCH/POST n’est exécuté qu’après `{ confirmed: true }` ;
- le Calendrier affiche les détails des conflits non bloquants dans le dialogue DTSC ;
- un conflit bloquant arrête le parcours sans proposer de confirmation contournable ;
- annuler une confirmation de conflit non bloquant ne produit plus un faux message de conflit bloquant ;
- l’allowlist native est supprimée de la QA transverse ;
- une QA #305 dédiée est intégrée au runner de régression.

## Données, sécurité et rollback

Aucune migration Prisma, aucun backfill et aucune variable d’environnement. Les routes, RBAC, ownership et contrôles multi-tenant existants ne changent pas. Rollback : revert applicatif de la PR #305, sans rollback de données.

## Politique de livraison

Aucun Preview Vercel de branche. Les commits intermédiaires restent sur GitHub ; seul le commit fusionné sur `main` est destiné à Vercel Production.
