# Hotfix #245 — sélecteur mobile, en-tête Administration DTSC et contexte IA

Statut : **implémenté sur la branche `fix/245-mobile-context-admin-header`, validation CI requise avant merge**.

## Objectif

Ce hotfix corrige trois écarts visibles sur DTSC Platform :

1. le sélecteur d’espace de travail dans le rail mobile doit rester large et lisible, sans chevaucher **Déconnexion** ;
2. **Administration DTSC** doit utiliser le même en-tête de module moderne que **Activités DTSC** ;
3. les assistants DTSC doivent raisonner à partir de la navigation et des parcours actuellement visibles dans l’application, avec des libellés orientés utilisateur.

## Contrat mobile

- Le rail supérieur reste horizontalement scrollable.
- Le sélecteur d’espace conserve une largeur mobile confortable (`82vw`, minimum `18rem`, maximum `24rem`).
- Le sélecteur ne peut pas être comprimé par les autres éléments du rail.
- L’ordre reste : espaces de navigation → sélecteur d’espace → Déconnexion.
- Le choix courant doit rester lisible avant d’ouvrir la liste.

## Contrat Administration DTSC

- L’ancien panneau d’entrée est masqué sur la page Administration DTSC.
- Le nouvel en-tête est rendu avec la primitive commune `ModuleHeader`, déjà utilisée par Activités DTSC.
- Le titre visible est **Administration DTSC**.
- La description reste métier : entreprises clientes, abonnements, assistance, sécurité et opérations internes.
- Le guide utilisateur contextuel reste disponible depuis l’en-tête.
- La navigation secondaire utilise **Espaces de travail disponibles** au lieu d’un libellé technique.

## Contrat IA — connaissance de l’interface

`lib/ai/application-interface-context.ts` fournit une référence fonctionnelle commune aux assistants :

- les groupes et sous-groupes de navigation sont dérivés directement de `MODULE_NAVIGATION_GROUPS` afin d’éviter une copie obsolète des intitulés ;
- le parcours de connexion explicite **charger les espaces → choisir l’espace → se connecter** est connu ;
- la position du sélecteur mobile et de Déconnexion est connue ;
- le nouvel en-tête Administration DTSC est connu ;
- l’assistant doit employer les libellés visibles à l’écran et éviter les routes, identifiants internes, enums ou termes d’implémentation sauf demande technique explicite.

Le contexte est injecté dans `routeAiStream` uniquement lorsqu’un `assistantCode` est présent. Cela couvre les assistants conversationnels et copilotes utilisant l’orchestrateur canonique, sans injecter de donnée privée supplémentaire ni contourner les contrôles de contexte, organisation ou permissions.

## QA automatique

Les gates existantes sont renforcées :

- `scripts/qa-standard-dtsc-console-checks.mjs`
  - vérifie l’usage de `ModuleHeader` pour Administration DTSC ;
  - vérifie la présence du guide et des libellés orientés utilisateur ;
  - vérifie la largeur et le non-rétrécissement du sélecteur mobile ;
  - vérifie l’ordre navigation → sélecteur → Déconnexion.
- `scripts/qa-standard-ai-context-engine.mjs`
  - vérifie que le contexte d’interface dérive la navigation du registre courant ;
  - vérifie les parcours mobile, connexion et Administration DTSC ;
  - vérifie l’injection centrale dans l’orchestrateur IA.

## Vérification E2E recommandée

Sur un téléphone ou viewport mobile :

1. ouvrir `console.dtsc-platform.com` dans un compte DTSC autorisé ;
2. faire défiler horizontalement le rail supérieur jusqu’à DTSC ;
3. vérifier que le sélecteur d’espace est long, lisible et entièrement séparé de **Déconnexion** ;
4. sélectionner un autre espace autorisé et vérifier que le nom reste visible ;
5. revenir dans le contexte DTSC et ouvrir **Administration DTSC** ;
6. vérifier que l’en-tête a le même langage visuel que **Activités DTSC** et que le guide utilisateur s’ouvre ;
7. demander au chatbot DTSC où se trouve le changement d’espace ou comment ouvrir Administration DTSC et vérifier que la réponse décrit l’interface actuelle avec des termes utilisateur.

## Base de données / secrets

- Migration Prisma : aucune.
- Backfill : aucun.
- Secret ou variable d’environnement : aucun.

## Rollback

Revert de la PR liée à l’Issue #245 vers le dernier SHA Production sain. Aucun rollback de schéma ou de données n’est nécessaire.
