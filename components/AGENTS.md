# AGENTS.md — Contrat responsive obligatoire des composants

Ces règles s'appliquent à tous les composants de `components/` et de ses sous-dossiers, pour chaque nouveau sprint, correctif ou refactor.

## Règles bloquantes

- Tout composant nouveau ou modifié doit rester utilisable sans débordement horizontal de page aux largeurs de référence **320, 360, 375, 390, 414, 768 et 1024 px**.
- Tout enfant direct d'un conteneur `flex` ou `grid` susceptible de rétrécir doit utiliser `min-w-0`; les surfaces principales doivent aussi utiliser `max-w-full`.
- Une grille mono-colonne contenant des données dynamiques doit déclarer `grid-cols-[minmax(0,1fr)]`. Toute colonne flexible d'une grille composée doit utiliser `minmax(0, 1fr)` plutôt que `1fr` seul lorsque son contenu peut être long.
- Les identifiants, emails, URLs, codes métier et textes sans espaces doivent pouvoir se couper avec `overflow-wrap:anywhere`, `break-words` ou `break-all` selon la sémantique. Ne jamais laisser un code technique agrandir le viewport.
- Les groupes d'actions doivent utiliser `data-responsive-actions`, une grille mobile ou `flex-wrap`. Aucun groupe de boutons ne peut dépendre d'une largeur desktop.
- `w-screen`, `100vw`, les `min-width` fixes et les largeurs en pixels supérieures au viewport sont interdits pour le contenu ordinaire. Ils ne sont acceptés que pour un vrai overlay plein écran documenté.
- Le scroll horizontal est interdit au niveau de la page. Un scroll horizontal local n'est accepté que pour un contenu qui l'exige réellement, dans un conteneur borné et accessible.
- Les formulaires, listes, cartes, dialogues, tableaux et médias doivent rester `min-w-0`/`max-w-full`; les dialogues et formulaires longs gardent un scroll interne et les safe areas.
- Réutiliser `components/workspace/*`, `components/ui/*` et le contrat racine `data-dtsc-responsive-root` avant de créer une nouvelle structure responsive parallèle.
- Ne jamais considérer `overflow-x-hidden` ou `overflow-x-clip` comme la correction unique d'un composant trop large: corriger aussi sa grille, ses enfants flexibles, ses textes longs et ses actions.

## Contrat anti-dette des composants

- Une primitive partagée responsable d'un défaut transverse est corrigée à la source avant d'ajouter des exceptions écran par écran.
- Un bouton autorisant un libellé multiligne ne doit pas imposer une hauteur fixe susceptible de couper ce libellé.
- Les nouvelles actions interactives exposent des états perceptibles `hover`, `focus-visible`, `active/pressed` et `disabled`; un état loading est explicite lorsqu'une action asynchrone peut durer.
- Les CTA mobiles restent courtes lorsque le sens peut être conservé. Plusieurs actions secondaires utilisent divulgation progressive/menu plutôt qu'un empilement permanent.
- Toute chaîne visible nouvelle sur une surface bilingue vient du mécanisme i18n canonique du domaine; ne pas créer de ternaires FR/EN locaux lorsqu'un dictionnaire existe.
- Les `aria-label`, `title`, placeholders et textes sr-only suivent le même contrat i18n que le texte visible.
- Aucun jargon d'implémentation n'est rendu côté client lorsqu'un libellé métier existe.
- Tout nouveau timer, polling ou fetch monté dans un shell global doit être justifié dans la PR selon `docs/CONTRIBUTING.md`.

## Navigation mobile et gestes

- La navigation primaire ne doit pas être dupliquée dans plusieurs barres mobiles. Le top chrome porte les actions système; la bottom navigation porte les grands groupes.
- Un compteur déjà représenté par un contrôle système ne doit pas être répété artificiellement sur un autre groupe.
- Un swipe global entre groupes doit ignorer les contrôles, formulaires, dialogs, éditeurs, carrousels, tabs, rails horizontaux, sélecteurs d'espace et tout ancêtre horizontalement scrollable.
- Protéger les zones de bord du viewport et ne pas utiliser `preventDefault()` pour prendre le contrôle d'un geste navigateur/système.
- Utiliser `data-horizontal-rail` pour un rail horizontal réel et `data-no-group-swipe` lorsqu'un composant interactif spécifique doit rester propriétaire de son geste.

## Expérience standard obligatoire

- Les KPI des modules standards utilisent `ModuleMetrics` et conservent un rail horizontal tactile, borné et snapé sur mobile; ils ne deviennent une grille dense qu'au breakpoint desktop `lg`.
- Les pages standardisées réutilisent la hiérarchie `ModuleWorkspace → ModuleHeader → ModuleMetrics/ModuleToolbar → ModuleContent → ModuleSection`.
- Tout fil de commentaires doit être masquable et démasquable. Réutiliser `CollapsibleThread` ou conserver un mécanisme existant équivalent, accessible via `aria-expanded`, avec scroll interne et pagination lorsque le volume peut grandir.
- Une notification liée à une entité doit transporter une cible précise vers cette entité, et si possible vers le commentaire ou message concerné. Ne pas créer de nouvelle notification métier avec une simple racine de module lorsqu'un identifiant existe.
- Les images intégrées aux annonces doivent rester cliquables et s'ouvrir dans la visionneuse partagée sans recadrage destructif, avec zoom, fermeture clavier et conservation du ratio/pixel source.
- Les comportements ci-dessus sont contrôlés par `pnpm qa:standard-experience` et ne doivent pas être réimplémentés localement dans chaque module.

## Validation obligatoire

Avant commit et push d'une modification UI:

```bash
pnpm qa:responsive-ui
pnpm qa:standard-experience
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

Une PR UI ne doit pas être fusionnée si le contrat responsive ou l'un de ces Quality Gates échoue. Une QA statique ne remplace pas les E2E visuels requis par `docs/CONTRIBUTING.md`.

## Contenu riche partagé

- Les zones éditoriales professionnelles réutilisent `components/ui/rich-text-editor.tsx` au lieu de créer un éditeur métier parallèle.
- Les capacités visibles doivent rester compatibles avec la sanitation de `lib/rich-content.ts`; aucun bouton ne doit prétendre intégrer un format que l’affichage sécurisé supprime silencieusement.
- Les liens externes, hashtags, images et vidéos doivent conserver des comportements accessibles, mobiles et sûrs. Les iframes arbitraires restent interdites sans politique d’hébergement explicitement approuvée.
