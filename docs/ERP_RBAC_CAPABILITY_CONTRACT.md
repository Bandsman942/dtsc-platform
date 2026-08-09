# Contrat canonique RBAC des modules ERP

## Autorité

`lib/enterprise/module-access.ts` est l'autorité active pour décider l'accès à un module ERP. Le résolveur normalise d'abord les alias/legacy codes, puis vérifie dans le même contrat : organisation cliente active, membership actif, compatibilité secteur, module tenant activé, dépendances, entitlement et permissions de rôle/position.

Les anciens appels à `canAccessEnterpriseModule()` restent temporairement disponibles pour les adapters sectoriels, mais cet helper délègue désormais intégralement à `resolveEnterpriseModuleAccess()` et ne contient plus de deuxième logique d'autorisation.

## Capacités exposées

`resolveEnterpriseModuleCapabilities()` calcule une seule fois le snapshot d'accès et expose :

- `canRead` : consulter le module ;
- `canCreate` / `canSubmit` : initier ou soumettre un objet métier ;
- `canWrite` : créer ou modifier les objets autorisés ;
- `canApprove` : valider/approuver lorsque les permissions le permettent ;
- `canManage` : administrer le module ou exercer les privilèges de gestion globale prévus.

Les workspaces ne doivent plus déduire ces capacités depuis un `Set` local de rôles.

## MANAGER

`MANAGER` n'est pas un administrateur entreprise. Sans permissions de position/rôle personnalisées, il peut conserver les actions métier prévues par le fallback de compatibilité, mais `canManage` reste faux. Lorsqu'une position ou un rôle personnalisé contient des permissions, celles-ci deviennent la décision effective du module.

## Procurement

Les surfaces Fournisseurs/Achats reçoivent les capacités calculées côté serveur. Un bouton de mutation n'est affiché que lorsqu'il correspond à une capacité réelle et, pour les transitions d'un achat, au lien de l'utilisateur avec l'objet (demandeur, créateur ou acheteur) lorsque le backend applique cette règle.

Le backend reste l'autorité finale : masquer un bouton ne remplace jamais les contrôles same-origin, session, tenant, membership, module, entitlement, Zod, rate limiting ou règles d'objet.

## Règle durable

Toute nouvelle surface ERP professionnelle doit dériver ses actions visibles du contrat de capacités canonique ou d'un contrat métier plus strict construit au-dessus de celui-ci. Elle ne doit pas recréer une décision d'accès à partir du nom du rôle.
