# Hotfix #882 — Déclaration de production dans Manufacturing canonique

## Contexte, source de vérité

Issue fille [#882](https://github.com/Bandsman942/dtsc-platform/issues/882) de l'[Issue #878](https://github.com/Bandsman942/dtsc-platform/issues/878). Base de la branche : `main@3840cc7a6aeb217fef01be940bb94ed854ad0896` après fusion de la PR #881 (Temps et Livrables).

Dans la migration sectorielle historique, `MANUFACTURING.DECLARE_PRODUCTION` pointe vers `PRODUCTION_ORDERS`, qui ne crée pas à lui seul de journal d'exécution. Le module canonique réellement propriétaire est `PRODUCTION_EXECUTION` : implémenté et ACTIVE dans `module-registry-manufacturing.json`, route `/enterprise-modules/PRODUCTION_EXECUTION`, applicable exclusivement au secteur `MANUFACTURING` sous réserve du plan et des dépendances de modules.

## Parcours implémenté

1. Depuis « Activités entreprise », sélectionner l'action « Déclarer production ».
2. Si le secteur réel de l'entreprise, son entitlement, son abonnement et les permissions `canRead` et `canWrite` du module cible permettent l'accès, l'UI affiche une navigation vers **Exécution production** ; sinon l'action reste **indisponible**.
3. Le lien ouvre le vrai workspace `EnterpriseManufacturingWorkspace` avec l'intention contrôlée `activityAction=DECLARE_PRODUCTION`. La section d'enregistrement du journal d'exécution est présentée et mise en évidence, sans opération automatique.
4. L'utilisateur choisit un **ordre en cours** réellement chargé par le module Manufacturing du tenant, une opération de gamme vérifiée et d'éventuels opérateur/centre de travail/équipement/temps approuvé. Il saisit le type (démarrage, fin ou travail), la quantité informative, les minutes et une note ; la soumission utilise **`RECORD_EXECUTION`**.
5. API existante `POST /api/enterprise/{organizationId}/manufacturing/orders/{orderId}` : contrôle de session/même origine/secteur/permission `PRODUCTION_EXECUTION:write`, validation Zod, ordre appartenant à l'organisation et statut `IN_PROGRESS`, références tenant-scopées, journal et événement métier, idempotency key conservée en cas de reprise après échec. L'utilisateur peut seulement choisir les ordres fournis par le module.
6. Le vieux `POST /api/enterprise/{organizationId}/activities` renvoie toujours **422** pour `DECLARE_PRODUCTION`. Il ne crée jamais un `EnterpriseActivityRequest` pour simuler une déclaration.

## Différence essentielle : exécution ≠ entrée de produits finis

**`RECORD_EXECUTION`** consigne un événement de production / travail. La quantité `quantityCompleted` est **informative dans le journal** : elle ne modifie pas le stock disponible ni `producedQuantity` de l'ordre. Pour enregistrer une réception physique réelle, l'utilisateur doit suivre séparément « Réception du produit fini » (`RECEIVE_OUTPUT`) avec les validations de stock/idempotence déjà présentes dans le service. La consommation des matières (`CONSUME_MATERIAL`) reste encore une troisième opération distincte.

Aucune migration historique modifiée, aucun doublon de registre ERP, aucun raccourci pour « approuver » un ordre ou créer un mouvement financier/stock sans contrôle.

## Sécurité et QA

- Le mapping est explicitement limité à `MANUFACTURING.DECLARE_PRODUCTION` ; l'ancien code ne peut pas engendrer une route à partir de la DB.
- Accès à la route conditionné aux capacités serveur du module canonique ; la page et l'API revalident le contexte.
- Le formulaire reste inactif sans un ordre `IN_PROGRESS` et sans `canWrite`. Les références sont rechargées dans le même tenant et les états imposés par le service.
- Réutilisation de `idempotencyKey` pendant un échec réseau/reprise ; génération d'une nouvelle clé après réponse réussie.
- QA dédiée : `pnpm qa:hotfix-882-manufacturing-execution` intégrée dans `qa:regression` en plus des QA Manufacturing de la release courante.

## OWNER_E2E requis

- Entreprise `MANUFACTURING` avec modules requis : action « Déclarer production » ouvre la section Exécution du vrai module et propose seulement les ordres en cours ; enregistrez `OPERATION_START`, puis `OPERATION_COMPLETE` ou `LABOR` sur un ordre admissible.
- Vérifier les événements/journal et que les quantités du stock ne changent **pas** du seul fait de `RECORD_EXECUTION`. Tester `RECEIVE_OUTPUT` et `CONSUME_MATERIAL` séparément, uniquement dans leurs parcours autorisés.
- Sans permission `write`, sans entitlement ou sur un secteur autre que Manufacturing : aucun handoff utilisable. L'API refuse la mutation forcée.
- Un ordre autre tenant, inconnu, DRAFT/RELEASED/COMPLETED, ainsi qu'une référence de centre/équipement/opération non liée doivent être rejetés par le serveur.
- Double clic, envoi répété ou reprise d'une même clé d'idempotence : pas de doublon. Refaire un autre enregistrement après succès : événement distinct.
- L'ancien POST Activités demeure `422` ; vérifier Gaming/Santé/Pharmacie, Timesheets/Livrables #881, 12 autres opérations en attente, FR/EN, thèmes clair/sombre et 320/360/375/390/414/768/1024 px, iOS/PWA et clavier.

## Suivi

Une fois cette vague et l'E2E validés, fermer **uniquement l'Issue #882**. L'[Issue mère #878](https://github.com/Bandsman942/dtsc-platform/issues/878) reste ouverte pour les 11 autres opérations. Fusion seulement depuis PR validée sur `main`, puis production via Vercel sans previews.
