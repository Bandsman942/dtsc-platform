# AGENTS.md — Contrat responsive obligatoire des pages

Ces règles s'appliquent à toutes les pages, layouts, routes UI et feuilles de style de `app/`.

## Règles bloquantes

- Toute page nouvelle ou modifiée doit préserver le contrat racine `data-dtsc-responsive-root` défini dans `app/layout.tsx`.
- Vérifier les largeurs **320, 360, 375, 390, 414, 768 et 1024 px** avant livraison.
- Les wrappers de page et de module utilisent `w-full min-w-0 max-w-full`; aucun contenu privé ou public ne doit créer un scroll horizontal de page.
- Les grilles dynamiques utilisent `minmax(0, 1fr)` pour leurs colonnes flexibles; les enfants de `flex` et `grid` utilisent `min-w-0`.
- Les textes longs et codes techniques utilisent `overflow-wrap:anywhere`, `break-words` ou `break-all`.
- Les groupes d'actions utilisent `data-responsive-actions`, une grille mobile ou `flex-wrap`.
- Ne pas utiliser `100vw`, `w-screen` ou une largeur fixe comme solution de layout ordinaire. Réserver ces valeurs aux overlays réellement plein écran.
- Un scroll horizontal local doit être intentionnel, borné, accessible et ne jamais déplacer toute la page.
- Préserver `viewportFit`, safe areas, comportement clavier iOS, PWA standalone, navigation mobile et scroll interne des dialogues.
- Ne jamais masquer un défaut de largeur uniquement avec `overflow-x-hidden` ou `overflow-x-clip`; corriger le composant responsable.

## Pages, i18n et expérience client

- Les modules standards Dashboard, Notifications, Annonces, Entreprise, Abonnement, Support, Paramètres et Profil utilisent les primitives `components/workspace/*`; une nouvelle divergence doit être justifiée par la nature du module.
- Une page bilingue ne crée pas de nouvelle chaîne utilisateur en dur lorsque le domaine dispose d'un dictionnaire i18n. Les titres, CTA, placeholders, erreurs, statuts, `aria-label`, `title` et textes sr-only sont concernés.
- Les dates/heures dépendant de l'utilisateur utilisent sa locale active; ne pas introduire `fr-FR` ou `en-US` en dur dans une surface bilingue.
- Le langage client décrit l'action, le métier et la récupération possible. Les noms de tables, routes, concepts de tenant/membership et diagnostics techniques restent hors de l'UI cliente.
- Un changement de langue doit reconstruire une surface cohérente; une page moitié FR moitié EN est une régression.
- Les KPI utilisent le rail horizontal mobile de `ModuleMetrics`. Une page ne doit pas remplacer ce rail par une grille verticale mobile locale.
- Toute route qui crée une notification liée à un objet métier doit utiliser un builder de `lib/notification-targets.ts` et inclure l'identifiant disponible de l'objet, du commentaire ou du message.
- Une page recevant `ticketId`, `commentId`, `messageId`, `focusId` ou un identifiant équivalent doit ouvrir, déplier et mettre en évidence l'élément autorisé, sans contourner ses contrôles d'accès serveur.
- Les anciennes notifications sans identifiant peuvent conserver un fallback vers le module; aucune nouvelle notification liée à une entité ne doit régresser vers ce fallback.
- Les pages affichant des commentaires doivent conserver un contrôle masquer/démasquer accessible et un contenu borné.
- Les pages Annonces doivent monter `AnnouncementMediaEnhancer` autour du contenu riche afin que les images restent consultables en plein écran sans perte de ratio.

## Shell mobile

- Le top chrome privé porte l'identité, le contexte et les actions système; il ne duplique pas la navigation primaire des grands groupes.
- `data-mobile-bottom-nav` reste la navigation primaire des grands groupes autorisés.
- Le contenu principal conserve un espace bas suffisant pour ne jamais être masqué par la navigation fixe et les safe areas.
- Les compteurs ne sont pas répétés dans plusieurs zones lorsque le même signal est déjà visible ailleurs.
- La navigation gestuelle globale entre groupes respecte `docs/RESPONSIVE_UI_CONTRACT.md` : pas d'interception sur formulaire, contrôle, dialog, rail horizontal ou bord système.

## Coût des pages globales

- Ne pas ajouter de requête, polling, timer ou subscription dans un layout/shell global sans documenter son coût, sa fréquence et sa nécessité dans la PR.
- Les agrégats globaux restent bornés; ne pas charger des collections non paginées pour simplement produire un badge ou un résumé.
- Ne pas utiliser un refresh/polling plus fréquent pour masquer un problème de synchronisation sans Issue dédiée.

## Validation obligatoire

```bash
pnpm qa:responsive-ui
pnpm qa:standard-experience
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

Toute modification UI échouant à ce contrat est bloquante pour la PR et le déploiement. Pour une modification UI matérielle, les E2E rendus requis par `docs/CONTRIBUTING.md` restent obligatoires en complément des audits statiques.
