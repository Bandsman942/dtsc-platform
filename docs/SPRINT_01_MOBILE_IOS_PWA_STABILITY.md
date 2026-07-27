# Sprint 1 — Stabilisation Mobile / iPhone / Safari / PWA

Date de travail : 2026-07-28

## Objectif

Stabiliser la fondation mobile de DTSC Platform sans engager la refonte UX/UI du Sprint 2. Cette itération cible les causes partagées des problèmes de focus, clavier virtuel, overlays, listes déroulantes, viewport iOS, safe areas, interactions tactiles et cache PWA.

## Audit et causes racines identifiées

### 1. Select Radix rendu derrière les dialogs

`components/ui/dialog.tsx` utilisait un overlay `z-[100]`, tandis que `components/ui/select.tsx` rendait son contenu dans un Portal à `z-50`.

Conséquence : un `Select` ouvert depuis un dialog pouvait être affiché derrière l'overlay. Sur mobile/iOS, le symptôme est perçu comme une liste qui ne s'ouvre pas ou qui est impossible à toucher.

Correction :

- dialogs portés vers `document.body` et placés à `z-[1000]` ;
- contenu Select placé à `z-[1100]` ;
- menus contextuels placés à `z-[1200]` ;
- listes bornées à la hauteur réellement disponible et scrollables au toucher.

### 2. Dialogs non synchronisés avec le viewport visuel iOS

Le viewport CSS (`dvh`) améliore fortement Safari moderne mais ne suffit pas toujours lorsque le clavier virtuel réduit ou décale le viewport réellement visible.

Correction : `Dialog` observe `window.visualViewport` lorsqu'il existe et borne l'overlay à sa hauteur et son offset. Aucun hack n'essaie d'ouvrir artificiellement le clavier. Le focus reste déclenché par l'interaction utilisateur normale.

### 3. Safe areas globales incomplètes

Le layout Next.js déclarait `device-width` et `initialScale`, mais pas `viewportFit: "cover"`. Les composants utilisaient déjà ponctuellement `env(safe-area-inset-*)`, notamment les appels et la navigation basse.

Correction : ajout de `viewportFit: "cover"`, conservation des safe areas existantes et ajout d'un padding supérieur sûr pour le header mobile.

### 4. Zoom automatique Safari sur certains contrôles

Le composant `Input` partagé utilise déjà une taille mobile de 16 px, mais plusieurs `select`/contrôles spécifiques utilisent des tailles plus petites.

Correction : sur les écrans mobiles uniquement, les contrôles de saisie textuelle, `textarea` et `select` ont une taille calculée minimale de 16 px. La typographie desktop n'est pas modifiée.

### 5. Menus et listes longues peu robustes au viewport réduit

Les menus contextuels et Select se basaient principalement sur `window.innerHeight` ou sur le viewport Radix sans couche commune adaptée au clavier/tactile.

Correction :

- positionnement des menus par rapport à `visualViewport` quand disponible ;
- hauteur maximale bornée ;
- `overscroll-contain`, scroll tactile inertiel et cibles tactiles agrandies ;
- fermeture propre lors d'un changement de viewport.

### 6. Assets PWA potentiellement anciens

Le service worker excluait déjà correctement les API et pages privées et la registration vérifiait déjà les mises à jour au retour en ligne, au focus et au retour de visibilité. En revanche, les assets statiques dont l'URL reste stable étaient servis en cache-first jusqu'au remplacement du cache.

Correction :

- nouvelle version du cache ;
- stratégie stale-while-revalidate pour les seuls assets statiques autorisés ;
- les API, pages privées et navigations restent hors cache applicatif ;
- fallback offline enrichi avec `viewport-fit=cover` et safe areas.

## Fichiers principaux

- `app/layout.tsx`
- `app/mobile-stability.css`
- `components/ui/dialog.tsx`
- `components/ui/select.tsx`
- `components/ui/action-menu.tsx`
- `public/sw.js`
- `scripts/qa-mobile-ios-checks.mjs`
- `package.json`

## Nouvelle gate source-level

```bash
pnpm qa:mobile
```

ou, sans pnpm :

```bash
node scripts/qa-mobile-ios-checks.mjs
```

Cette gate contrôle notamment :

- `viewport-fit=cover` ;
- couche de stabilité mobile chargée ;
- absence de verrouillage artificiel du body dans le Dialog partagé ;
- utilisation de `visualViewport` ;
- hiérarchie z-index Dialog / Select ;
- scroll tactile des listes ;
- exclusions privées du service worker ;
- stratégie de renouvellement des assets ;
- mécanisme PWA existant de mise à jour ;
- manifest standalone et icônes principales.

## Matrice manuelle à exécuter

| Largeur | Contrôles prioritaires |
| --- | --- |
| 320 px | login, formulaire long, select dans dialog, navigation, aucun débordement |
| 375 px | idem + clavier et scroll du champ actif |
| 390 px | idem, format iPhone récent |
| 414 px | idem, grand iPhone |
| 768 px | tablette, dialogs, menus et listes longues |
| 1024 px | bascule navigation desktop/tablette |
| 1440 px | absence de régression desktop |

## Parcours prioritaires

- Auth : connexion, inscription sans création de données indésirables, champs et sélection d'entreprise.
- Profil/paramètres : inputs, selects, dialogs.
- Administration et Activités DTSC : formulaires longs, menus `...`, sélecteurs.
- Support : création de ticket et formulaire mobile.
- Mes collaborateurs / Chatbot / IA Assistant Entreprise : saisie, scroll, menus, pièces jointes lorsque disponibles.
- Entreprise cliente : dashboard, collaborateurs, administration, module sectoriel accessible.
- PWA : lancement standalone, navigation, mise à jour du service worker, fallback offline public.

## Validation iOS/Safari

Les corrections sont conçues pour les comportements documentés des navigateurs mobiles et l'API `VisualViewport`, mais la validation finale doit distinguer strictement :

- test réel sur iPhone ;
- test réel sur Safari ;
- émulation navigateur ;
- inspection source/CI uniquement.

Aucun rapport ne doit déclarer une validation iPhone réelle sans appareil réellement utilisé.

## Hors périmètre

Ce sprint ne refond pas Activités DTSC, les dashboards, le design system complet, la présence/temps de travail, la paie, Enterprise Core, Workflow Engine, OpenRouter, l'orchestration IA ou les secteurs métier.

Les corrections restent volontairement concentrées sur les primitives partagées mobile/PWA.
