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


## Workspaces SaaS contextualisés — Hotfix #825

Les sections SaaS de la Console utilisent le shell commun livré dans #824 et présentent leur contenu **directement** plutôt que le masquer derrière un accordéon répétant le titre de la page. Les domaines à plusieurs blocs (IA, Utilisateurs, Paramètres, Abonnements, Sécurité et Vue générale) disposent de sous-sections sémantiques `ConsoleSubsection` et de liens d'ancrage `ConsoleJumpLinks` vers des cibles réellement montées. Les filtres, exports, paginations, contenus, validations, formulaires et API existants sont conservés. Les sous-sections restent visibles pendant la saisie, y compris sur mobile, sans fenêtre modale ajoutée.

Les intitulés nouveaux proviennent des catalogues FR/EN. Aucun KPI, état métier, droit, requête Prisma ni entitlement n'est inventé ou modifié. La QA statique `pnpm qa:console-saas-workspaces` vérifie la conservation des panneaux fonctionnels, la disparition des wrappers redondants, les traductions, les ancres et les gardes d'accès. Elle est incluse dans `qa:regression`. La disponibilité en Production nécessite Quality Gates puis OWNER_E2E.


## Départements internes — #826

Les workspaces CEO, COO, CTO, MPO, HR & CFO, SCO et Legal Advisor utilisent `InternalDepartmentWorkspace` : un seul en-tête principal dans la Console, des sous-sections structurées avec ancres et titres FR/EN, et les panneaux métier existants en mode `embedded`. Le mode `embedded` supprime seulement les en-têtes internes redondants, **sans supprimer métriques, filtres, tableaux, formulaires, validations ni mutations**. Par défaut, les panneaux continuent à afficher leur propre en-tête lorsqu'ils sont utilisés en dehors de la Console.

Les règles d'approbation CEO/COO, paie et prestations, la lecture des factures HR-CFO conditionnée à sa capacité, et les droits `DTSC_INTERNAL` et RBAC restent côté serveur. Aucun faux KPI, changement d'API ou migration n'est introduit. QA : `pnpm qa:console-internal-workspaces`, également exécutée par le contrat `qa-console-workspace-shell` déjà présent dans la suite de régression. OWNER_E2E et fusion après validation de #825 et réconciliation sur le `main` réel.
