# Hotfix #455 — stabilité mobile des détails et langage client

## Contexte et baseline réconciliée

Le propriétaire a signalé un défaut transversal sur mobile : après ouverture du détail d’un bloc dans un module, un simple toucher au milieu du workspace peut faire trembloter brièvement toute la surface privée. La vidéo E2E fournie montre aussi des formulations d’implémentation visibles par le client, notamment dans Finance/Comptabilité.

Le diagnostic initial a été réalisé depuis `main@f4c0b55a111d4215472afc67f2701b76cc10c942`. À la demande du propriétaire, SCALE-4D #454 a ensuite été fusionné en premier. Le candidat final du hotfix est donc reconstruit depuis le nouveau `main@b99442a5655f5561db8cab25e87542ab83ff4b56`, en préservant explicitement la QA SCALE-4D.

Ce travail suit `docs/CONTRIBUTING.md`, `components/AGENTS.md`, `docs/RESPONSIVE_UI_CONTRACT.md` et `docs/CUSTOMER_FACING_LANGUAGE_CONTRACT.md`.

## Cause du tremblement

`MobileGroupSwipeNavigation` prépare un geste global sur `.dtsc-private-main` dès qu’un toucher commence dans une zone neutre. Avant ce hotfix, `touchend`, une détection verticale ou certains timeouts appelaient `animateBackToRest()` même quand l’axe horizontal n’avait jamais été activé.

Un tap normal déclenchait donc inutilement une animation Web Animations API de `transform` / `opacity` sur tout le workspace. Sur mobile, ce snap-back sans déplacement utile se manifestait comme un tremblement de la page ou du détail.

## Correction du geste

La correction reste dans la primitive globale ; aucun écran métier ne reçoit de CSS de masquage ou d’exception locale.

- la dead-zone d’activation passe de 8 à 12 px ;
- tant que le geste reste `pending`, aucun `transform`, aucune opacité et aucune animation de retour ne sont appliqués ;
- un tap neutre se termine par un reset synchrone sans mouvement ;
- un geste vertical détecté avant l’activation horizontale rend immédiatement la main au scroll natif sans animation ;
- un `touchcancel` ou un timeout pending reste immobile ;
- uniquement un vrai drag horizontal déjà activé peut utiliser le snap-back ;
- le swipe intentionnel conserve drag-follow, résistance en bord, seuil distance/vitesse, prefetch et animation de navigation ;
- aucun `preventDefault()` global n’est introduit.

## Langage client

Le problème observé n’est pas traité par une substitution locale dans le workspace Finance. Le hotfix ajoute `lib/client-facing-copy.ts`, un garde exact réservé aux chaînes système issues des catalogues i18n.

Il transforme notamment :

- données « paginées côté serveur » → consultation/recherche/suivi métier ;
- configuration « calculée par le serveur » → étapes qui se cochent automatiquement lorsqu’elles sont prêtes ;
- « projections inter-modules » → opérations liées / synchronisation ;
- contrôles « côté serveur » → vérifications automatiques avant validation ;
- mention `tenant` dans un texte de transfert → autorisations et solde vérifiés avant validation.

Le garde est branché sur les traducteurs canoniques partagés de `lib/i18n.ts`. Il n’est jamais importé par une surface `components/` ou `app/` et ne traite jamais une donnée saisie ou issue d’un enregistrement métier.

## Catégories Finance

Le fallback historique `Valeur métier à vérifier / Business value to review` est supprimé. Les sous-types comptables réellement utilisés par les templates DTSC/SYSCOHADA sont désormais libellés explicitement, notamment :

- `COST_OF_SALES` → `Coût des ventes / Cost of sales` ;
- `OPERATING_EXPENSE` → `Charges d’exploitation / Operating expenses` ;
- `ACCOUNTS_RECEIVABLE` → `Créances clients / Accounts receivable` ;
- `ACCOUNTS_PAYABLE` → `Dettes fournisseurs / Accounts payable` ;
- `TAX_RECEIVABLE` → `Taxes à récupérer / Tax receivable` ;
- `TAX_PAYABLE` → `Taxes à payer / Tax payable` ;
- `PAYROLL_PAYABLE` → `Dettes salariales / Payroll payable` ;
- `RETAINED_EARNINGS` → `Résultats reportés / Retained earnings`.

Un code réellement inconnu reste masqué derrière `Autre catégorie / Other category` plutôt que d’exposer un enum technique.

## Données exclues

Aucune transformation automatique ne s’applique aux valeurs utilisateur ou métier : noms, notes, descriptions libres, motifs, références, données cliniques, messages, commentaires ou contenu enregistré restent strictement inchangés.

## Base de données, API et sécurité

- aucune migration Prisma ;
- aucun backfill ;
- aucun changement d’API ;
- aucun changement RBAC, entitlement ou isolation multi-tenant ;
- aucun secret ou diagnostic fournisseur ajouté côté client ;
- aucun nouveau polling ou timer global.

## QA automatisée et réconciliation SCALE-4D

Le hotfix renforce `scripts/qa-smooth-mobile-group-swipe.mjs` et ajoute `scripts/qa-hotfix-455-mobile-detail-experience.mjs` dans Regression QA.

La réconciliation sur `main@b99442a5655f5561db8cab25e87542ab83ff4b56` conserve aussi `scripts/qa-scale4d-admin-broadcast-email.mjs`. Le runner final exécute donc à la fois la gate SCALE-4D et la gate #455.

La gate transverse #455 vérifie notamment :

- tap neutre sans animation globale ;
- geste vertical pending sans animation ;
- swipe horizontal intentionnel toujours protégé par la QA historique ;
- primitives `BusinessDetail` / `BusinessList` toujours mobile-first ;
- garde de copie appliqué par les traducteurs canoniques ;
- absence d’import direct du garde dans les surfaces métier ;
- suppression des anciens fallbacks Finance ;
- présence des libellés comptables métier FR/EN.

## OWNER_E2E obligatoire avant fusion

Le hotfix modifie un comportement tactile global ; une preuve humaine sur appareil réel est obligatoire avant Production.

À valider sur le head final de la PR #456 après CI verte :

1. ouvrir un module contenant une liste puis le détail d’un bloc ;
2. effectuer plusieurs taps courts au milieu de zones neutres : aucun tremblement, déplacement ou flash du workspace ;
3. faire défiler verticalement le détail lentement puis rapidement : aucun snap horizontal ;
4. utiliser boutons, menus `...`, champs, select et retour : aucun déplacement global parasite ;
5. depuis une zone neutre hors contrôle, effectuer un vrai swipe horizontal entre groupes : la navigation doit rester fluide ;
6. vérifier Comptabilité → Comptes : `Coût des ventes` / `Charges d’exploitation` doivent remplacer le fallback technique et la description ne doit plus parler de pagination serveur ;
7. basculer FR puis EN et vérifier les mêmes règles de langage ;
8. refaire au minimum à 360/390/414 px ou sur les appareils réels correspondants, puis un contrôle tablette/desktop pour absence de régression.

Une validation `OWNER_E2E` explicite est requise avant merge.

## Ordre de livraison effectif

1. SCALE-4D #454 : fusionné en premier sur `main` via `b99442a5655f5561db8cab25e87542ab83ff4b56` ;
2. Hotfix #456 : réconcilié sur ce nouveau `main`, puis CI → OWNER_E2E → merge → Vercel Production ;
3. Rendez-vous #452 : vient en dernier, réancré sur le `main` issu du hotfix puis revalidé par sa CI et son OWNER_E2E dédié.

Aucune Preview Vercel intermédiaire n’est requise ni autorisée par la politique actuelle.

## Gouvernance de livraison

Quality Gates #4019 s’est arrêté au contrôle de gouvernance de la PR avant tout test de code, après la fermeture/réouverture technique nécessaire à la reconstruction de branche. La description de #456 a depuis été restaurée au format complet exigé par `docs/CONTRIBUTING.md` et les labels structurés `type`, `priority`, `area` et `delivery-impact` ont été réappliqués. Ce commit documentaire déclenche une nouvelle validation du candidat réconcilié ; il ne modifie aucun comportement applicatif.

## Rollback

Revert applicatif du merge du hotfix. Aucune restauration de schéma ou de données n’est nécessaire. Le rollback doit restaurer ensemble le comportement du geste, le garde de copie, les mappings Finance et leurs QA afin de ne pas laisser un contrat partiel.
