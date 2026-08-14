# Hotfix #303 — confirmations CRUD et mise en service Shop

## Contexte

Le hotfix corrige deux régressions observées en E2E OWNER le 14 août 2026 :

1. certaines actions CRUD confirmées ne s’exécutaient plus après l’ouverture du dialogue DTSC ;
2. la checklist `Étapes avant la première vente` du Shop ne reflétait pas toujours la configuration réelle et donnait des instructions trop génériques.

## Cause racine — confirmations CRUD

`SensitiveActionConfirmationProvider` remplaçait globalement `window.confirm()` par un dialogue asynchrone puis tentait de rejouer le clic initial avec `origin.click()`.

Ce contrat est incompatible avec les call-sites synchrones historiques de `window.confirm()` et devient particulièrement fragile lorsque l’action vient d’un menu ou d’un composant temporaire : au moment de confirmer, le bouton déclencheur peut déjà avoir disparu du DOM.

Le hotfix :

- supprime le monkey-patch de `window.confirm()` ;
- supprime le replay de clic DOM ;
- rend aux call-sites legacy la sémantique synchrone native du navigateur ;
- conserve `confirmSensitiveAction(...)` et le dialogue DTSC pour les parcours qui utilisent explicitement l’API asynchrone.

Aucune route CRUD, règle RBAC ou règle d’isolation tenant n’est contournée.

## Cause racine — readiness Shop

La readiness Shop utilisait principalement les identifiants mémorisés dans le dernier `EnterpriseRetailOnboardingRun`. Une ressource réellement configurée pouvait donc rester affichée comme manquante si le run était ancien ou incomplet.

Le hotfix fait dériver la readiness depuis les sources canoniques existantes lorsque le choix est non ambigu :

- configuration pays active ;
- devise fonctionnelle Finance ;
- site actif ;
- dépôt actif rattaché au site ;
- compte financier d’encaissement compatible avec la devise et le site.

Si plusieurs ressources valides existent, DTSC ne choisit pas arbitrairement la première : l’utilisateur doit sélectionner explicitement la ressource utilisée par le Shop.

## Clarification des étapes avant vente

Les étapes affichent maintenant un état et une action métier précis en français et en anglais.

En particulier :

- `Devise principale` renvoie vers la Vue d’ensemble financière, où `Configurer Finance` permet de modifier la devise fonctionnelle ;
- `Point de vente` indique si un site doit être créé ou sélectionné ;
- `Dépôt de stock` précise qu’un dépôt actif rattaché au point de vente est requis et qu’un emplacement seul ne suffit pas ;
- `Caisse` devient `Compte d’encaissement` afin de distinguer la configuration permanente du compte financier de l’ouverture/fermeture d’une session de caisse ;
- une session de caisse clôturée ne rend donc plus le compte d’encaissement « non configuré ».

## Branding Finance

Le panneau de mise en service comptable utilise désormais les tokens de surface, bordure et texte DTSC (`dtsc-surface`, `dtsc-page`, `dtsc-border`, `dtsc-ink`, `dtsc-muted`) au lieu des surfaces génériques qui produisaient un grand bloc noir incohérent en mode sombre.

## Schéma et données

- aucune migration Prisma ;
- aucune donnée existante supprimée ;
- aucune réécriture d’historique ;
- aucune sélection automatique lorsqu’elle serait ambiguë.

## QA

Le hotfix ajoute `scripts/qa-hotfix-303-crud-shop-onboarding.mjs` et renforce `scripts/qa-shop2-global-readiness.mjs`.

Les garde-fous vérifient notamment :

- absence de monkey-patch/replay de `window.confirm()` ;
- conservation du DELETE réel de messages ;
- dérivation canonique des ressources Shop ;
- messages actionnables FR/EN ;
- deep-link de la devise vers Finance plutôt que l’onboarding comptable ;
- distinction compte d’encaissement / session de caisse ;
- tokens de branding DTSC dans l’onboarding comptable.

La CI GitHub constitue la preuve d’exécution sur la branche. Aucun preview Vercel n’est provisionné conformément à la politique de livraison DTSC.
