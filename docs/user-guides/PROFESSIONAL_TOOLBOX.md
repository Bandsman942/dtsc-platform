# Guide utilisateur — Boîte à outils professionnelle

> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

La boîte à outils regroupe des notes persistantes, des pense-bêtes et une calculatrice professionnelle accessibles depuis le bouton d’actions flottantes. Les notes restent privées à leur auteur et conservent le module dans lequel elles ont été créées.

## Accès et permissions

- Ouvrez le bouton flottant unique puis choisissez **Boîte à outils professionnelle**.
- Chaque utilisateur ne lit, modifie ou archive que ses propres notes.
- Le serveur vérifie la session, l’origine de la requête, les données saisies et la limite de fréquence.

## Créer et organiser plusieurs notes

1. Ouvrez l’onglet **Notes & pense-bêtes**.
2. Choisissez **Nouvelle note** ou **Nouveau pense-bête**.
3. Renseignez le titre, le contenu riche, le type, la priorité, le statut, les étiquettes et, si nécessaire, l’échéance.
4. Enregistrez : la note rejoint la liste compacte et le Kanban.
5. Utilisez le regroupement par statut, priorité, type ou module d’origine.
6. Cliquez une carte pour ouvrir sa vue de détail, puis modifiez, épinglez, terminez ou archivez la note.

## Éditeur riche et presse-papiers

- Utilisez la mise en forme riche, les listes, liens et styles disponibles dans l’éditeur partagé.
- Les actions **Copier**, **Couper** et **Coller** utilisent les capacités autorisées par le navigateur ; les raccourcis clavier restent le repli prévu.
- La zone d’édition conserve une hauteur stable et son propre défilement afin de ne pas déplacer la page pendant la saisie.

## Calculatrice scientifique et financière

- Le mode **Standard** prend en charge les opérations arithmétiques et parenthèses.
- Le mode **Scientifique** fournit `sin`, `cos`, `tan`, `sqrt`, `log`, `ln`, `abs`, `pow`, `pi` et `e` avec une évaluation locale sans exécution dynamique de code.
- Le mode **Financière** estime une mensualité constante, une valeur future ou une valeur actuelle à partir du capital, du taux annuel et du nombre de mois.
- L’aide contextuelle précise les hypothèses de chaque calcul ; les résultats sont des estimations et ne remplacent pas une validation comptable ou financière.

## Statuts, validations et traçabilité

- `Brouillon` : note en préparation.
- `Active` : note ou rappel en cours.
- `Terminée` : élément accompli.
- `Archivée` : élément conservé hors des vues actives.
- Les créations, mises à jour et archivages sont audités et les archives ne sont pas supprimées brutalement.

## Sécurité et confidentialité

- Les notes sont rattachées à l’utilisateur connecté et ne sont jamais partagées automatiquement avec une organisation ou un autre utilisateur.
- Le contenu riche est normalisé avant persistance et rendu selon les protections de l’éditeur commun.
- La calculatrice n’envoie pas l’expression à un service externe.

## Dépannage

- Si le navigateur refuse le presse-papiers, utilisez `Ctrl/Cmd+C`, `Ctrl/Cmd+X` ou `Ctrl/Cmd+V`.
- Si une note n’apparaît pas après l’enregistrement, rechargez la liste et vérifiez que les éléments archivés sont masqués.
- Si un calcul échoue, vérifiez les parenthèses, les séparateurs et le nombre d’arguments des fonctions.
