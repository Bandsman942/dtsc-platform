# Architecture professionnelle de la Console DTSC

**Itération :** Standard modules 07
**Surface :** `console.dtsc-platform.com/admin`
**Contexte :** global DTSC, distinct de toute administration d’organisation cliente.

## Avant

`app/admin/page.tsx` agrégeait plusieurs domaines, chargeait des listes bornées arbitrairement et exécutait des synchronisations financières ou des initialisations pendant le rendu.

## Après

- `app/admin/page.tsx` ne fait qu’ouvrir la vue générale.
- `app/admin/[section]/page.tsx` délègue à `app/admin/console-page.tsx`.
- Chaque section résout son accès et charge uniquement son dataset.
- Les mutations vivent dans `app/api/admin/**` et exigent une capacité serveur.
- Les services de lecture vivent dans `lib/console/**`.
- La réconciliation est un job explicite `ConsoleOperationJob`.
- Les routes, aliases et modules sont centralisés.

## Frontières

La Console peut lire les métadonnées globales autorisées. Elle ne donne jamais un accès implicite aux données métier privées d’un tenant. Les moteurs Support, facturation, publications, audit, ERP et tableaux internes restent canoniques.

## Rollback

Les aliases historiques peuvent être conservés, les nouvelles mutations peuvent être désactivées et la Console peut rester en lecture seule. La migration est additive ; aucune colonne historique n’est supprimée.

## Workspace Console commun — #824

`ConsoleWorkspaceShell` compose `ModuleWorkspace`, `ModuleContent` et `AdminFloatingNav` pour les sections autorisées. L'en-tête utilise le libellé et la description traduits de **la section active**, plutôt que répéter « Administration DTSC ». Les sections du même groupe sont accessibles via un rail compact ; l'annuaire complet reste ouvrable sur desktop et via le hub d'actions mobile. Les ressources du pied de page pointent vers l'app Guide, le produit Support et, avec permission, la section Accès RBAC.

La navigation et le chargement conditionnel des datasets restent orchestrés par `DtscConsolePage`, avec les contrôles `DTSC_INTERNAL`, capacités et postes avant rendu. La page Maturité commerciale demeure dédiée, avec le même design system. Les contrats QA préexistants ont été mis à jour pour tester l'emplacement réel des guides et du shell (sans supprimer les validations historiques), et `qa-console-workspace-shell` est inclus dans `qa:regression`.
