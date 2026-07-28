# Architecture UI/UX métier DTSC Platform

## Objectif

DTSC Platform adopte une architecture d'interface métier réutilisable pour les modules ERP et les espaces opérationnels. Le principe est de privilégier l'information et les actions utiles plutôt que l'empilement de conteneurs décoratifs.

Le Sprint 2 introduit cette architecture avec `Activités DTSC` comme module pilote. Les autres modules ne sont pas migrés automatiquement : ils doivent réutiliser ces primitives seulement après validation du pilote et en conservant leurs règles métier propres.

## Hiérarchie de page

Structure cible :

```text
ModuleWorkspace
├── ModuleHeader
├── ModuleMetrics        (si des indicateurs réels existent)
├── ModuleToolbar        (recherche / filtres / tri / vue)
└── ModuleContent
    ├── ModuleSection
    │   └── BusinessList
    │       └── BusinessListItem
    └── ...
```

À éviter sans nécessité sémantique :

```text
Page
└── Card globale
    └── Card de section
        └── Card d'objet
            └── Card d'action
```

La hiérarchie visuelle repose d'abord sur la typographie, l'espacement, les séparateurs, les badges et l'alignement. Une bordure ou une ombre n'est utilisée que lorsqu'elle aide à comprendre un niveau d'interface réel.

## Contrat de hiérarchie visuelle

Les composants workspace doivent exprimer quatre niveaux visuels distincts et stables :

1. **Module** — le titre de page est le niveau le plus fort. `ModuleHeader` utilise une typographie large, un compteur secondaire et un séparateur structurel fort.
2. **Section métier** — `ModuleSection` utilise un titre plus petit que le module mais nettement plus fort qu'une ligne métier, avec un repère vertical cyan, un compteur compact et un espace vertical généreux entre sections.
3. **Ligne métier** — `BusinessListItem` utilise un titre dense et moins massif, un statut secondaire, des métadonnées plus petites et des séparateurs de lignes. Une ligne ne doit jamais rivaliser visuellement avec le titre de sa section.
4. **Détail** — `BusinessDetail*` et les dialogs utilisent une surface de détail dédiée. Le titre de l'objet peut redevenir fort, mais les sous-sections du détail utilisent des libellés courts, souvent en petites capitales, et des champs structurés par label/valeur.

Règles de contraste :

- `text-dtsc-ink` est réservé en priorité aux titres et valeurs métier principales ;
- `text-dtsc-muted` sert aux descriptions, métadonnées et aides ;
- `text-dtsc-blue` / cyan servent de repères sémantiques et non de couleur de texte généralisée ;
- les compteurs et statuts restent compacts et ne doivent pas devenir des titres concurrents ;
- un séparateur de section est plus espacé qu'un séparateur de ligne ;
- une liste ne doit pas créer une nouvelle carte par élément ; la séparation se fait par ligne, rythme, contraste et whitespace ;
- les détails peuvent utiliser une surface légèrement teintée lorsqu'elle représente un vrai niveau sémantique, mais pas une cascade de cartes imbriquées.

Échelle de référence mobile :

```text
Module title      ≈ 24–32 px / black
Section title     ≈ 18–20 px / black
List item title   ≈ 15–16 px / extra-bold
Detail field      ≈ 14 px / semibold
Meta / labels     ≈ 10–12 px / bold ou uppercase
```

Cette échelle reste relative : elle doit préserver les préférences d'accessibilité et ne pas dépendre d'une taille fixe en pixels dans tous les cas.

## Primitives partagées

Les primitives génériques vivent dans `components/workspace/`.

### `ModuleWorkspace`

- borne la largeur utile avec `min-w-0` ;
- bloque le débordement horizontal de page ;
- réserve la safe-area basse ;
- ne contient aucune logique métier.

### `ModuleHeader`

- titre métier prioritaire ;
- courte description ;
- compteur facultatif ;
- action principale et actions secondaires par composition ;
- disposition compacte sur mobile et plus horizontale sur desktop.

### `ModuleToolbar`

- reçoit une recherche et des contrôles composés par le module ;
- permet d'afficher les filtres actifs et un résumé ;
- n'impose pas une API universelle de filtres ;
- les filtres doivent toujours refléter de vraies données ;
- utilise une surface de contrôle dédiée, distincte du contenu métier.

### `ModuleMetrics` / `ModuleMetric`

- métriques compactes sans grandes cartes KPI ;
- strip horizontal contenu sur petit écran ;
- grille dense sur desktop ;
- aucun chiffre fictif ou mocké.

### `ModuleSection`

- représente une séparation métier réelle ;
- titre, description, compteur et action optionnelle ;
- repère vertical discret et séparateur de niveau section ;
- espace vertical plus fort que celui d'une ligne de liste ;
- ne crée pas une nouvelle carte globale autour du contenu.

### `BusinessList` / `BusinessListItem`

- liste d'objets métier basée sur des lignes et séparateurs ;
- priorité au titre, au statut et à quelques métadonnées utiles ;
- titre visuellement subordonné au titre de section ;
- contenu principal ouvrable au clavier et au tactile ;
- actions séparées du clic principal afin d'éviter les interactions imbriquées.

### `BusinessDetail` / `BusinessDetailHeader` / `BusinessDetailSection`

- couche partagée pour les détails métier ;
- `BusinessDetailHeader` porte le titre de l'objet, son résumé, son statut et les actions de détail ;
- `BusinessDetailSection` sépare les sous-domaines d'information avec une typographie différente de `ModuleSection` ;
- `BusinessDetailGrid` et `BusinessDetailField` structurent les paires label/valeur ;
- le détail peut vivre dans un `Dialog`, une sheet haute ou une vue dédiée selon le module ;
- ne jamais réutiliser `ModuleSection` à l'intérieur d'un détail uniquement pour obtenir un style.

### `StatusBadge`

- badge secondaire par rapport au titre ;
- tons sémantiques `neutral`, `info`, `success`, `warning`, `danger` ;
- forme compacte avec bordure légère ;
- le domaine reste responsable de la correspondance entre ses vraies valeurs de statut et le ton visuel.

### `EmptyState`

Distinguer au minimum :

- absence de contenu ;
- absence de résultat après filtres ;
- action de création uniquement si une vraie action backend existe.

L'état vide doit rester visuellement secondaire par rapport à une section contenant des données.

### `ContextActions`

Le domaine déclare une petite liste d'actions réelles :

```ts
type BusinessContextAction = {
  id: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};
```

`ContextActions` réutilise le `ActionMenu` DTSC existant. Il ne remplace pas les permissions serveur.

Une action ne doit être déclarée que si :

1. son backend ou sa navigation existe réellement ;
2. l'utilisateur peut raisonnablement l'exécuter côté UI ;
3. la route serveur réapplique RBAC, propriété ou appartenance.

Les actions destructrices sont séparées visuellement des actions courantes.

## Domaine Activités DTSC

Le domaine reste dans `components/activities/` :

- `activities-dashboard.tsx` : orchestration du workspace ;
- `activity-types.ts` : types de présentation sérialisables ;
- `activity-list-item.tsx` : représentation d'une activité en ligne métier ;
- `activity-detail.tsx` : détail, commentaires, mentions, pièces jointes et mutations autorisées ;
- `activity-forms.tsx` : formulaires existants de demande, blocage, rapport, réunion et flux juridique.

La page serveur `app/activities/page.tsx` reste la source des données et des filtres de permissions par poste. Le Sprint 2 ne remplace pas les modèles Prisma ni les routes API existantes.

### Actions réellement exposées dans le pilote

Selon l'objet et les données disponibles :

- ouvrir le détail ;
- formuler une demande collaborative liée ;
- ouvrir un document existant ;
- pour une tâche : marquer en cours ou terminée ;
- dans le détail d'une demande collaborative, le destinataire peut utiliser les transitions déjà autorisées ;
- commentaires : répondre, copier, modifier/supprimer selon propriétaire ou rôle autorisé.

Aucune action fictive `Dupliquer`, `Archiver`, `Historique`, `Partager` ou `Supprimer` n'est ajoutée si le backend du domaine ne la supporte pas.

## Mobile

Références de contrôle : 320, 375, 390, 414 et 768 px.

Règles :

- `min-w-0` sur les conteneurs flex/grid ;
- aucun scroll horizontal de page ;
- scroll horizontal uniquement local et intentionnel, par exemple la bande de métriques ;
- targets tactiles compatibles avec les primitives du Sprint 1 ;
- modales hautes avec scroll interne ;
- menu `...` au premier plan et compatible `visualViewport` ;
- safe areas conservées ;
- détails en logique liste -> détail au lieu d'empiler liste + formulaire + discussion ;
- conserver un contraste clair entre le titre de section, les lignes et la surface de détail même à 320 px.

Les corrections Sprint 1 (`viewportFit`, clavier iOS, `Dialog`, `Select`, `ActionMenu`, PWA) restent la base et ne doivent pas être contournées dans un module métier.

## Desktop

À partir de 1024 px :

- utiliser l'espace horizontal pour rapprocher filtres et actions ;
- densifier les lignes sans réduire leur lisibilité ;
- les dialogues liste/détail peuvent utiliser un split view ;
- éviter les cartes pleine largeur très hautes lorsque des lignes compactes suffisent.

## Server Components / Client Components

La récupération et l'autorisation des données restent côté serveur lorsqu'elles y sont déjà.

Les Client Components sont isolés au niveau nécessitant réellement :

- recherche locale ;
- ouverture/fermeture des menus ou dialogues ;
- soumission interactive ;
- commentaires ;
- mutations.

Ne pas convertir une page serveur complète en composant client uniquement pour ouvrir un menu.

## Permissions et sécurité

La visibilité UI est une aide ergonomique, pas une sécurité.

Pour DTSC interne :

- conserver `DTSC_INTERNAL` ;
- conserver le dossier collaborateur actif ;
- conserver les règles `DtscPosition` ;
- réappliquer l'autorisation dans chaque API sensible.

Pour les entreprises clientes :

- conserver `organizationId`, membership actif, rôle organisationnel et entitlements ;
- ne jamais réutiliser automatiquement les règles de `/activities` DTSC dans `Activités [Entreprise]`.

## Composition plutôt que God Component

Les primitives partagées ne doivent pas recevoir des dizaines de flags métier.

Préférer :

```tsx
<ModuleWorkspace>
  <ModuleHeader />
  <ModuleMetrics>...</ModuleMetrics>
  <ModuleToolbar />
  <ModuleContent>
    <ModuleSection>
      <BusinessList>...</BusinessList>
    </ModuleSection>
  </ModuleContent>
</ModuleWorkspace>
```

Pour un détail :

```tsx
<BusinessDetail>
  <BusinessDetailHeader />
  <BusinessDetailSection>
    <BusinessDetailGrid>
      <BusinessDetailField />
    </BusinessDetailGrid>
  </BusinessDetailSection>
</BusinessDetail>
```

Les transformations, statuts, permissions et actions propres à un domaine restent dans le domaine.

## Généralisation future

Avant de migrer un autre module :

1. auditer ses données et permissions réelles ;
2. identifier les primitives déjà réutilisables ;
3. ajouter une primitive seulement si au moins deux usages cohérents sont prévisibles ;
4. garder la logique métier hors de `components/workspace/` ;
5. migrer un module à la fois avec QA fonctionnelle ;
6. ne pas copier le markup Activités DTSC si la nature du module exige une autre représentation (table, calendrier, conversation, dossier clinique, etc.) ;
7. conserver le contrat visuel `module → section → liste → détail` plutôt que recréer des styles métier locaux.
