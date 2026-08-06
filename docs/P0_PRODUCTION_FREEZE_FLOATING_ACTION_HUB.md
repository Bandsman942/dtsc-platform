# P0 — Gel de production du hub d’actions flottantes

Date : 2026-08-06

## Incident

Le déploiement de production issu du commit `cb87575e900a1aa40337c52a79a152d4954bb2ef` pouvait rester bloqué sur le squelette de chargement. Le déploiement précédent restait utilisable.

Le symptôme était principalement visible côté navigateur : le shell global et le bouton flottant apparaissaient, puis l’interface ne progressait plus. Les journaux serveur ne montraient pas d’erreur proportionnelle au gel.

## Cause racine

`FloatingActionHubProvider` transmettait au contexte React une valeur créée inline :

```tsx
<FloatingActionContext.Provider value={{ register }}>
```

Chaque appel à `register` modifiait l’état `actions` du provider. Le provider se rendait à nouveau, créait un nouvel objet de contexte, puis tous les hooks `useFloatingAction` considéraient que leur dépendance `registry` avait changé.

Le nettoyage de l’effet supprimait alors l’action, puis l’effet la réinscrivait. Ces deux opérations modifiaient encore l’état du provider et pouvaient entretenir une boucle de rendu côté client.

## Correctif

La valeur du contexte est maintenant mémorisée :

```tsx
const registry = useMemo<FloatingActionRegistry>(() => ({ register }), [register]);
```

Le contexte conserve ainsi la même identité tant que la fonction `register` ne change pas. L’inscription d’une action ne provoque plus une cascade de désinscriptions et réinscriptions.

## Séparation des produits

Le hub d’actions flottantes est limité aux produits suivants :

- `app.dtsc-platform.com` ;
- `console.dtsc-platform.com` ;
- `support.dtsc-platform.com` ;
- environnement local de développement.

Il n’est pas rendu sur :

- `dtsc-platform.com` et `www.dtsc-platform.com` ;
- `account.dtsc-platform.com` ;
- les domaines inconnus.

La boîte à outils professionnelle est montée par un composant dédié avec import dynamique. Son code n’est chargé que dans les produits autorisés. Elle ne doit donc plus apparaître sur le site public ni dans les écrans de connexion.

## Validation de non-régression

Le contrôle `qa:iteration-07-owner-e2e-remediation-v3` vérifie désormais :

- la mémorisation du registre du contexte ;
- l’absence de `value={{ register }}` ;
- le filtrage par type de sous-domaine ;
- le montage dynamique de la boîte à outils ;
- l’absence du montage direct de `ProfessionalToolbox` dans le layout racine.

## Vérification manuelle post-production

1. Ouvrir le site public : aucun bouton de boîte à outils ne doit être visible.
2. Ouvrir `account.dtsc-platform.com` : aucun bouton de boîte à outils ne doit être visible.
3. Se connecter et ouvrir le Dashboard SaaS : le chargement doit se terminer normalement.
4. Ouvrir et fermer le hub plusieurs fois : aucune dégradation ni boucle de rendu.
5. Naviguer entre Dashboard, Collaborateurs, Activités et Administration.
6. Refaire les tests sur Chrome et Samsung Internet.
7. Vérifier les journaux Vercel et l’absence de hausse d’erreurs runtime.

## Portée des cookies

Le cookie partagé multi-sous-domaines reste nécessaire au SSO. Cependant, il n’est pas la cause racine de ce gel spécifique, car la régression correspond exactement à l’introduction du nouveau provider d’actions flottantes et se produit côté React après le chargement du shell.
