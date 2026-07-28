# QA — Sprint 2 Workspace UI / Activités DTSC

## Objectif

Cette checklist valide le pilote `Activités DTSC` et les primitives `components/workspace/*` sans élargir les permissions métier existantes.

Elle complète `docs/QA_REGRESSION_CHECKLIST.md`, `pnpm qa:regression`, `pnpm qa:workspace`, `pnpm qa:mobile`, le type-check et le build.

## Contrôles automatisés

Exécuter depuis la racine du repository :

```bash
pnpm qa:workspace
pnpm qa:regression
pnpm qa:mobile
pnpm type-check
pnpm build
```

Le script `qa:workspace` contrôle notamment :

- présence de la composition `ModuleWorkspace -> ModuleHeader / ModuleToolbar / ModuleMetrics / ModuleContent` ;
- absence de `dtsc-panel` / `dtsc-card` dans l'orchestrateur Activités ;
- métriques compactes avec scroll horizontal local sur mobile ;
- listes métier basées sur des lignes et séparateurs ;
- menus contextuels réutilisant `ActionMenu` et son durcissement `visualViewport` du Sprint 1 ;
- recherche et filtres de date ;
- conservation des routes réelles demandes / blocages / rapports / workflows / commentaires / tâches ;
- conservation du garde d'accès DTSC interne côté page serveur ;
- absence d'actions fictives `Archiver` / `Supprimer` dans le workspace Activités.

## Matrice responsive

Contrôler au minimum :

| Largeur | Attendus |
| --- | --- |
| 320 px | aucun scroll horizontal de page, header compact, toolbar exploitable, métriques en strip local, lignes lisibles, menus `...` accessibles |
| 375 px | mêmes contrôles + dialogues utilisables avec clavier logiciel |
| 390 px | mêmes contrôles + recherche/date sans dépassement |
| 414 px | actions header/section accessibles sans masquer le contenu |
| 768 px | toolbar et métriques utilisent mieux la largeur sans devenir des cartes géantes |
| 1024 px | densité desktop, split list/detail dans le dialogue de section |
| 1440 px | exploitation horizontale sans lignes excessivement hautes ni conteneurs décoratifs imbriqués |

## Régressions Sprint 1 à surveiller

- focus clavier iOS sur `input`, `textarea`, `select` ;
- `Dialog` borné par `visualViewport` ;
- menus `...` et selects au-dessus des overlays ;
- scroll interne des dialogues, sans `overflow-hidden` bloquant ;
- safe areas ;
- absence de scroll horizontal global ;
- PWA / service worker inchangés par le Sprint 2.

## Parcours Activités DTSC

Pour chaque compte DTSC de test disponible :

1. ouvrir `/activities` depuis une session `DTSC_INTERNAL` ;
2. vérifier le titre, les métriques et le nombre d'éléments ;
3. rechercher par titre, statut, responsable ou métadonnée présente ;
4. filtrer par date de début puis par date de fin ;
5. vérifier que les KPI tâches/blocages reflètent la période ;
6. réinitialiser les filtres ;
7. parcourir chaque section visible et ouvrir un élément ;
8. ouvrir puis fermer le menu contextuel `...` au clavier, à la souris et au tactile lorsque disponible ;
9. créer une demande collaborative avec un compte test lorsqu'un destinataire de test existe ;
10. créer un blocage ou rapport test seulement sur un environnement/données réversibles ;
11. ouvrir un formulaire collaborateur et vérifier réunion / juridique selon le rôle ;
12. pour une tâche autorisée, tester `Marquer en cours` puis `Marquer terminée` avec une tâche de test ;
13. pour une demande reçue, vérifier que seul le destinataire voit les actions de réponse existantes ;
14. ajouter un commentaire, répondre, copier, modifier son propre commentaire et confirmer la suppression logique lorsque permis ;
15. vérifier les états `Aucun contenu` et `Aucun résultat` avec filtres ;
16. confirmer que les actions non supportées par le backend ne sont pas affichées.

## Matrice rôles DTSC

Tester uniquement les comptes réellement disponibles et consigner le résultat :

| Poste | Lecture attendue | Points particuliers | Test réel |
| --- | --- | --- | --- |
| CEO | périmètre de supervision autorisé | sections CEO + objets critiques selon loader serveur | à renseigner |
| COO | périmètre opérations COO | tâches/opérations/blocages/rapports selon règles existantes | à renseigner |
| CTO | périmètre CTO + objets impliqués | aucun élargissement vers les autres domaines | à renseigner |
| MPO | périmètre MPO + objets impliqués | aucun élargissement vers les autres domaines | à renseigner |
| HR_CFO | activités et paies autorisées | la paie reste limitée au collaborateur concerné hors supervision autorisée | à renseigner |
| SCO | achats/stocks/logistique autorisés | aucune assimilation à un rôle commercial | à renseigner |
| LA | juridique autorisé | confidentialité `CEO_ONLY` / `LA_CEO_ONLY` inchangée | à renseigner |

Un rôle non testé avec un vrai compte ne doit jamais être déclaré « validé » uniquement grâce à l'inspection du code.

## Contrôles sécurité / RBAC

- `/activities` conserve `isDtscInternalSession(...)` et le contrôle du dossier collaborateur actif ;
- les sections restent construites par la page serveur selon les responsabilités actuelles ;
- les actions UI ne créent aucune permission supplémentaire ;
- les routes mutantes continuent de vérifier session, appartenance, propriété et/ou poste ;
- aucune logique `if (email === ...)` n'est ajoutée ;
- aucune donnée d'entreprise cliente n'est mélangée au tenant DTSC interne.

## Contrôles production après merge

Une fois le SHA de `main` déployé en production :

- corréler le SHA GitHub au SHA de déploiement Vercel ;
- tester les routes publiques/auth accessibles sans modifier de donnée sensible ;
- avec un compte de test disponible, tester `/activities` en lecture et les mutations réversibles ;
- vérifier les erreurs réseau 401/403/404/500 inattendues, erreurs d'hydratation et erreurs de chunks dans les outils navigateur réellement disponibles ;
- ne jamais prétendre à un test Safari/iPhone réel sans appareil ou service navigateur réel.
