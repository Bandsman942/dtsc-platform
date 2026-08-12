# Itération transverse #251 — DTSC Experience Debt Closure

**Issue :** #251

**Baseline `main` :** `4480e3b6a6004e3cf2f65ab073b43f4729079858`

**Branche :** `fix/251-experience-debt-closure`

**Impact livraison :** High

**Migration Prisma :** aucune attendue

## 1. Objectif

Cette itération ferme des causes racines communes aux dettes visibles dans le shell privé DTSC :

- i18n partiel et chaînes utilisateur codées en dur ;
- CTA trop longues et boutons capables de couper du texte ;
- actions de header mobile trop denses ;
- navigation primaire dupliquée en haut et en bas ;
- répétition artificielle du même compteur `99+` ;
- absence de swipe global sûr entre grands groupes ;
- états interactifs insuffisamment uniformes ;
- QA structurelle capable de passer sans prouver le rendu ;
- contrat CONTRIBUTING insuffisamment explicite sur la dette et la vérité des preuves.

Le but n'est pas de refaire chaque écran de DTSC. Le but est de rendre les contrats transverses suffisamment forts pour que les mêmes régressions ne puissent plus être réintroduites silencieusement.

## 2. Contrat i18n transverse

Une source i18n dédiée est ajoutée pour les surfaces modifiées :

- `locales/experience.fr.json` ;
- `locales/experience.en.json` ;
- `lib/experience-i18n.ts`.

Les surfaces couvertes utilisent ce contrat :

- chrome `ModuleWorkspace` ;
- Dashboard personnel ;
- page Paramètres ;
- panneau Paramètres ;
- sélecteur d'espace ;
- shell mobile.

### Changements visibles

- `DTSC · Workspace` devient **`DTSC · Espace de travail`** en français et reste `DTSC · Workspace` en anglais ;
- les contrôles de section `Ouvrir/Retour` utilisent le dictionnaire ;
- la CTA Dashboard devient **`Nouveau chat` / `New chat`** ;
- les dates du Dashboard et de la session Paramètres utilisent la locale active ;
- les labels d'enums des surfaces couvertes passent par `formatEnumLabelForLocale()` ;
- les textes orientés architecture du Dashboard sont reformulés en langage utilisateur.

## 3. Boutons et actions de module

`components/ui/button.tsx` ne combine plus wrapping libre et hauteur fixe.

Le contrat partagé devient :

- `h-auto` ;
- `min-h-*` selon la taille ;
- retour à la ligne possible ;
- focus visible ;
- état pressed/active ;
- icônes non rétrécissables.

`ModuleHeader` applique désormais une divulgation progressive sur mobile :

- CTA principale visible ;
- actualisation icon-first ;
- actions secondaires dans un menu `…` sur petit écran ;
- comportement desktop conservé.

## 4. Shell mobile

La hiérarchie mobile est simplifiée.

### Top chrome

Il conserve :

- identité DTSC et produit ;
- actualisation ;
- thème ;
- notifications ;
- avatar ;
- sélecteur d'espace ;
- déconnexion.

Il n'affiche plus les grands groupes `Pilotage`, `IA & équipe`, `Entreprise`, `Compte`, etc.

### Bottom navigation

Elle devient l'unique navigation primaire entre grands groupes.

Le compteur global de notifications reste sur la cloche et n'est plus répété sur `Pilotage`. Les compteurs propres à la collaboration et aux actions entreprise restent attachés à leurs groupes car ils représentent des signaux distincts.

## 5. Swipe entre grands groupes

`components/dtsc/mobile-group-swipe-navigation.tsx` ajoute un geste complémentaire à la bottom navigation.

Garde-fous :

- uniquement mobile/tablette sous 1024 px ;
- seuil de 72 px ;
- dominance horizontale sur le déplacement vertical ;
- geste inférieur à 900 ms ;
- garde de 28 px sur chaque bord du viewport ;
- aucune interception d'un contrôle interactif ;
- aucune interception d'un rail horizontal réel ;
- aucune utilisation de `preventDefault()` ;
- destination limitée aux groupes déjà autorisés et routée via `/modules?group=...`.

Le geste ne crée aucune nouvelle autorité d'accès. Les routes et résolveurs serveur restent opposables.

## 6. Paramètres

La page Paramètres et son panneau principal utilisent le contrat i18n transverse pour les textes modifiés :

- identité ;
- sécurité ;
- préférences ;
- apparence ;
- notifications ;
- appels ;
- messages de succès/erreur locaux ;
- labels/hints/formulaires.

La persistance reste assurée par les routes existantes. Aucun nouveau stockage Prisma n'est introduit par cette itération.

## 7. Gouvernance de contribution

`docs/CONTRIBUTING.md` est renforcé avec un contrat anti-dette opposable :

- définition de la dette de contribution ;
- règle **aucune nouvelle dette silencieuse** ;
- registre obligatoire `Dette créée / maintenue / remboursée / reportée` ;
- dette créée/reportée liée à une Issue ;
- matrice de preuves `LOCAL_EXECUTED / CI_PROVEN / OWNER_E2E / NOT_EXECUTED` ;
- interdiction de présenter une inspection comme une exécution ;
- contrat i18n ;
- contrat langage client ;
- contrat composants partagés ;
- validation visuelle obligatoire pour UI matérielle ;
- contrat performance pour tout nouveau travail global ;
- inspection du diff final contre le dernier `main`.

Le template PR et `validate-pr-governance.mjs` imposent désormais ces sections. `qa-delivery-governance.mjs` protège leur présence.

## 8. QA automatique

Nouveau script :

```bash
node scripts/qa-experience-debt-closure.mjs
```

Il protège notamment :

- dictionnaires FR/EN ;
- absence de la signature anglaise codée en dur dans le JSX ;
- CTA Dashboard courte ;
- dates locale-aware ;
- contrat Button sans hauteur fixe cassante ;
- top mobile sans duplication des grands groupes ;
- absence du badge Pilotage dupliqué ;
- garde-fous du swipe ;
- contrat anti-dette CONTRIBUTING ;
- sections dette/preuves du template PR ;
- validation de gouvernance correspondante.

Le script est importé par `scripts/qa-responsive-ui-contract-checks.mjs`. Comme `qa:responsive-ui` est déjà intégré à `qa:regression`, le nouveau contrat entre dans la régression canonique sans créer une deuxième pipeline parallèle.

## 9. Contrat E2E visuel de l'itération

### Largeurs

Tester :

- 320 px ;
- 360 px ;
- 375 px ;
- 390 px ;
- 414 px ;
- 768 px ;
- 1024 px.

### Matrice

Pour les parcours concernés :

- FR ;
- EN ;
- clair ;
- sombre ;
- Chrome mobile ;
- Samsung Internet ;
- PWA standalone si disponible ;
- navigateur desktop.

### Scénarios

#### Dashboard

1. Ouvrir le Dashboard en FR sur 320/360/390 px.
2. Vérifier que `Nouveau chat`, Actualiser et le menu secondaire restent entièrement contenus dans le header.
3. Vérifier qu'aucun texte ou badge ne traverse une bordure.
4. Passer en EN, recharger via le flux normal des préférences et vérifier que le Dashboard ne mélange pas FR et EN.
5. Vérifier les dates de période/activité dans la locale active.

#### Shell mobile

1. Vérifier que les grands groupes ne sont présents qu'en bottom navigation.
2. Vérifier que le top rail contient uniquement sélecteur d'espace puis Déconnexion lorsqu'un sélecteur existe.
3. Vérifier que la cloche peut afficher `99+` sans second `99+` sur Pilotage.
4. Vérifier que le branding peut revenir à la ligne sans chevaucher les actions système.
5. Vérifier que le contenu de page n'est jamais recouvert par la bottom navigation.

#### Swipe

1. Balayer une zone neutre du contenu vers la gauche : groupe suivant.
2. Balayer vers la droite : groupe précédent.
3. Commencer le geste sur un bouton : aucune navigation globale.
4. Commencer sur un input/textarea/select : aucune navigation globale.
5. Commencer sur un rail horizontal : le rail défile, aucun changement de groupe.
6. Commencer près du bord gauche/droit : aucun changement de groupe imposé par DTSC.
7. Tester un groupe DTSC interne avec un utilisateur non autorisé : il ne devient jamais une destination de swipe.

#### Paramètres

1. Ouvrir chaque section modifiée en FR puis EN.
2. Vérifier les labels, hints, boutons et messages de mutation.
3. Modifier la langue, enregistrer et vérifier le rafraîchissement cohérent.
4. Tester clavier mobile dans le formulaire identité/préférences.
5. Vérifier que les longues traductions restent contenues.

#### Interactions

1. Desktop : survoler boutons/actions et vérifier un feedback perceptible.
2. Clavier : Tab puis vérifier `focus-visible`.
3. Mobile : tap et vérifier l'état pressed sans déplacement durable.
4. Vérifier disabled/loading lorsque les contrôles concernés l'exposent.

## 10. Matrice de preuves au moment de l'implémentation

Ce document ne transforme pas une modification GitHub en preuve d'exécution. Tant que la CI/acceptance n'a pas été observée, les statuts restent explicites :

| Contrôle | Statut initial | Preuve |
|---|---|---|
| Inspection statique du diff GitHub | LOCAL_EXECUTED | fichiers/commits de la branche |
| `qa-experience-debt-closure` | NOT_EXECUTED | à prouver par CI/local |
| `qa:responsive-ui` | NOT_EXECUTED | à prouver par CI/local |
| `qa:regression` | NOT_EXECUTED | à prouver par CI |
| `type-check` | NOT_EXECUTED | à prouver par CI |
| `lint` | NOT_EXECUTED | à prouver par CI |
| `build` | NOT_EXECUTED | à prouver par CI |
| E2E visuels | NOT_EXECUTED | acceptance propriétaire requise |
| Production | NOT_EXECUTED | uniquement après merge `main` |

## 11. Performance

Cette itération **n'ajoute aucune requête Prisma, aucun polling et aucune subscription globale** à `AppShell`.

Le composant de swipe écoute des événements tactiles passifs et ne déclenche une navigation qu'après un geste qualifié. Il n'effectue aucun appel réseau propre.

Les agrégats existants d'`AppShell` et le heartbeat de présence existant restent hors du changement comportemental de cette itération ; ils ne sont ni aggravés ni présentés comme résolus par ce document.

## 12. Sécurité / multi-tenant

Aucun contrôle serveur n'est déplacé vers le client.

Le swipe et la bottom navigation n'exposent que les groupes que le shell est déjà autorisé à rendre. Les routes cibles conservent leurs propres contrôles serveur. Le sélecteur d'espace conserve son endpoint et sa validation existants.

Aucune modification de schéma, membership, RBAC, entitlement, SSO ou cookie n'est introduite.

## 13. Rollback

Le rollback est applicatif/documentaire : revert de la PR #251 vers le dernier SHA Production sain.

Aucune suppression de données, migration inverse ou backfill n'est nécessaire.
