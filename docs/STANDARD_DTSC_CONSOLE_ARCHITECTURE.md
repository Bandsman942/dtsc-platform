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
