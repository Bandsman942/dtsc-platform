# Hotfix #247 — intégrité UX transverse, Shop, notifications et deep links IA

Statut : **implémentation terminée ; Quality Gates automatiques validées ; validation E2E propriétaire confirmée le 11 août 2026 ; fusion autorisée sous réserve du dernier cycle CI déclenché par cette trace documentaire**.

## Objectif

Ce hotfix traite cinq parcours visibles et critiques :

1. la saisie multiligne dans **Mes Collaborateurs** ;
2. la mise en service et le responsive du tenant **Shop** ;
3. les confirmations d’actions sensibles et les retours succès/échec ;
4. la confidentialité des notifications reçues lorsque l’application est en arrière-plan ;
5. les liens de navigation cités dans les conversations avec l’IA.

## Contrat Mes Collaborateurs

- Le champ de rédaction grandit avec le texte jusqu’à une hauteur maximale.
- Le texte ne doit jamais sortir visuellement du cadre du composer, y compris avec des suites de caractères sans espace.
- **Entrée** crée une nouvelle ligne ; **Ctrl/⌘ + Entrée** peut envoyer depuis le composer immersif.
- Au-delà de la hauteur maximale, le texte reste éditable avec défilement interne mais la barre de scroll native reste masquée.
- Le bouton d’envoi, le bouton IA, le microphone et les safe areas mobiles restent utilisables avec le clavier ouvert.

## Contrat Shop

### Responsive

Le rail **Continuer dans l’ERP** est borné à la largeur utile sur mobile. Les destinations sont réparties dans une grille responsive afin qu’aucun bouton ou libellé ne force le viewport horizontal.

### Une seule source de vérité de mise en service

Le diagnostic a confirmé qu’il existait auparavant deux calculs concurrents :

- la readiness de `self-service-onboarding.ts` ;
- une seconde checklist calculée indépendamment dans `commercial-dashboard.ts`.

Le hotfix rend `getCanonicalRetailReadiness()` autoritaire pour la readiness de base du Shop. Le tableau commercial consomme cette projection au lieu de reconstruire sa propre checklist. Les contraintes opérationnelles propres à Mobile Money ou Telco restent des exigences additionnelles de leur produit et ne redéfinissent pas la readiness de base du Shop.

### Deep links

Chaque élément de **Étapes avant la première vente** reçoit une destination canonique vers l’espace où l’utilisateur peut agir. Les éléments de **Configuration pays** deviennent eux aussi cliquables. Les configurations propres au Point de vente exposent des ancres dédiées :

- `#shop-setup` ;
- `#shop-country-configuration` ;
- `#shop-point-of-sale-configuration`.

Les autres étapes ouvrent le module ERP métier correspondant. Les droits de ce module restent vérifiés par les contrôles serveur existants.

### Cases de checklist

Les cases visibles proviennent de la readiness canonique. La disponibilité du stock n’est notamment plus considérée comme complète lorsque le catalogue est encore vide.

## Contrat confirmations et toasts

`confirmSensitiveAction()` et `SensitiveActionConfirmationProvider` fournissent une confirmation DTSC en boîte de dialogue :

- aucune dépendance au rendu natif du navigateur pour la confirmation visible ;
- annulation par défaut en l’absence d’interface ;
- tonalité standard, avertissement ou action destructive ;
- possibilité d’exiger un motif ;
- composant monté au niveau racine afin d’être utilisable dans tous les modules.

Les principaux parcours sensibles touchés par ce hotfix utilisent directement `confirmSensitiveAction()`. Deux grands workspaces historiques contiennent encore un appel synchrone `window.confirm()` dans leur source : le calendrier interne et la gestion des filtres personnalisés de Mes Collaborateurs. Ils sont explicitement recensés par la QA et passent à l’exécution par un **pont de compatibilité global** : le provider intercepte l’appel, annule d’abord l’action, ouvre le `Dialog` DTSC, puis ne rejoue l’action qu’une seule fois après confirmation. Le navigateur ne présente donc pas sa boîte native. Toute nouvelle occurrence de `window.confirm()` hors de cette liste auditée fait échouer la QA.

Les surfaces sensibles migrées utilisent le système de toast DTSC pour leurs résultats de mutation. Les états structurels de chargement peuvent conserver un état de page dédié ; les succès et échecs de mutation ne doivent pas être injectés arbitrairement au milieu du module.

## Contrat confidentialité des notifications

Une préférence utilisateur additive est ajoutée :

- **Masquer le contenu** (`PRIVATE`) — valeur par défaut ;
- **Afficher le détail** (`DETAILED`) — choix explicite sur un appareil de confiance.

La préférence est persistée dans `UserSessionPreference`, protégée par une route same-origin authentifiée et auditée.

En mode privé, le Push conserve un titre fonctionnel et un corps neutre. En mode détaillé, le titre et le corps proviennent uniquement de la notification déjà destinée au même `userId`, avec longueurs bornées. Le Push reste best-effort et ne peut pas faire échouer l’action métier principale.

## Contrat deep links IA

Le contexte d’interface injecté par l’orchestrateur IA fournit aux assistants un catalogue de liens approuvés de la forme :

`[Libellé visible](/modules?open=CODE)`

Les assistants reçoivent l’instruction de ne jamais inventer un code module, une route ou une ancre.

À l’ouverture, `/modules` :

- résout les modules ERP depuis la navigation réellement autorisée de l’entreprise active ;
- applique les règles de disponibilité du module standard ;
- redirige uniquement si la destination est autorisée ;
- affiche **Cet espace n’est pas accessible** lorsque l’espace actif ou les droits ne permettent pas l’ouverture.

Le lien produit par l’IA n’accorde donc aucun droit.

## QA automatique

Le hotfix ajoute `scripts/qa-cross-app-ux-integrity-hotfix.mjs` et l’intègre à l’itération IA Standard 05, déjà exécutée par la Quality Gate principale. Cette QA couvre :

- composer multiligne et scrollbar masquée ;
- responsive du rail ERP ;
- source canonique de readiness Shop et deep links ;
- provider de confirmation, pont de compatibilité et liste fermée des deux appels historiques tolérés ;
- absence de nouvelle confirmation navigateur non auditée ;
- usage direct du contrat DTSC et des toasts sur les surfaces sensibles migrées ;
- migration et politique privacy-first des notifications ;
- résolution contrôlée des deep links IA.

Les contrats IA existants sont également renforcés dans `qa-standard-ai-context-engine.mjs`.

## Validation E2E propriétaire requise

### Mobile — Mes Collaborateurs

1. Ouvrir une conversation dans **Mes Collaborateurs** sur Samsung Internet/Chrome mobile.
2. Saisir au moins 10 lignes en utilisant **Entrée**.
3. Coller une longue chaîne sans espaces.
4. Vérifier que le texte reste dans le composer, que sa hauteur plafonne et qu’aucune barre verticale n’est visible.
5. Déplacer le curseur vers le début et la fin du texte ; vérifier que le contenu reste éditable.
6. Envoyer explicitement avec le bouton puis vérifier la remise à zéro du composer.

### Mobile — Shop

1. Ouvrir **Point de vente**.
2. Déplier **Continuer dans l’ERP**.
3. Vérifier qu’aucun bouton ne déborde de l’écran et qu’aucun scroll horizontal de page n’apparaît.
4. Ouvrir chaque élément de **Configuration pays** et vérifier la destination.
5. Ouvrir chaque étape incomplète de **Étapes avant la première vente** et vérifier que le module/configuration correspondant s’ouvre.
6. Réaliser une configuration, revenir/actualiser puis vérifier que la case correspondante suit la donnée réelle.

### Confirmations / toasts

1. Déclencher une action destructive ou sensible directement migrée.
2. Vérifier qu’une boîte DTSC s’ouvre, et non une boîte native du navigateur.
3. Annuler et vérifier qu’aucune mutation n’a lieu.
4. Confirmer ; lorsqu’un motif est demandé, vérifier qu’il est obligatoire.
5. Vérifier que succès et échec s’affichent sous forme de toast DTSC.
6. Tester également la suppression d’un filtre personnalisé dans Mes Collaborateurs et l’acceptation d’un conflit d’invitation du calendrier interne : ces deux parcours historiques doivent eux aussi afficher le `Dialog` DTSC via le pont de compatibilité et n’exécuter l’action qu’une seule fois après confirmation.

### Notifications

1. Dans **Paramètres → Session et notifications**, choisir **Masquer le contenu**.
2. Mettre l’application en arrière-plan et recevoir une notification : vérifier que le contenu métier n’apparaît pas sur l’écran système.
3. Choisir **Afficher le détail** sur un appareil de test de confiance.
4. Recevoir une nouvelle notification et vérifier que le titre/contenu autorisé est visible.
5. Revenir sur **Masquer le contenu** et vérifier la persistance après reconnexion.

### IA

1. Demander au chatbot général et à un assistant entreprise d’indiquer un module connu, par exemple **Point de vente**, **Comptabilité** ou un autre espace disponible.
2. Vérifier que le libellé cité est cliquable lorsque l’assistant l’utilise comme destination.
3. Cliquer avec un compte autorisé : le module doit s’ouvrir.
4. Cliquer sur une destination non disponible dans l’espace courant : le hub doit afficher un refus d’accès clair sans exposer de donnée du module.

### Régression

- Desktop et mobile.
- Mode clair et sombre.
- FR et EN pour les surfaces bilingues.
- Changement d’espace personnel/entreprise/DTSC.
- Aucune fuite inter-tenant.

## Preuve de validation E2E propriétaire

Le **11 août 2026**, après exécution des vérifications E2E réelles prévues ci-dessus, le propriétaire du produit a fourni la validation globale explicite : **« E2E OK, fusionne »**.

Cette trace signifie que la validation propriétaire exigée par `docs/CONTRIBUTING.md` est acquise pour ce hotfix. Elle ne remplace pas les Quality Gates automatiques : le commit documentaire qui consigne cette preuve doit lui-même rester vert avant la fusion.

## Base de données

Migration additive : `20260811212500_push_notification_content_privacy`.

Aucune migration historique n’est modifiée. La colonne nouvelle possède une valeur par défaut protectrice et ne nécessite pas de backfill destructif.

## Rollback

Revert de la PR hotfix vers le dernier SHA Production sain. La colonne additive de préférence Push peut rester présente lors d’un rollback applicatif ; aucune suppression de données n’est nécessaire.
