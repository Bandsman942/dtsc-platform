# Guide utilisateur — Boîte à outils professionnelle

> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

La boîte à outils regroupe des notes persistantes, des pense-bêtes et une calculatrice professionnelle accessibles depuis le bouton d’actions flottantes. Les notes restent privées à leur auteur et conservent le module dans lequel elles ont été créées.

## Accès et permissions

- Ouvrez le bouton flottant unique puis choisissez **Boîte à outils professionnelle**.
- Sur les workspaces privés, le bouton s’efface lorsque vous remontez dans le contenu et réapparaît lorsque vous redescendez, afin de libérer l’espace de lecture sans perdre l’accès aux outils.
- Chaque utilisateur ne lit, modifie ou archive que ses propres notes.
- Le serveur vérifie la session, l’origine de la requête, les données saisies et la limite de fréquence.

## Créer et organiser plusieurs notes

1. Ouvrez l’onglet **Notes & pense-bêtes**.
2. Choisissez **Nouvelle note** ou **Pense-bête**.
3. Renseignez d’abord uniquement les informations de la note : titre, type, priorité, statut, étiquettes, épinglage et éventuelle échéance.
4. Choisissez **Valider et éditer** : cette validation ouvre l’éditeur riche plein écran, mais n’enregistre pas encore la note.
5. Rédigez et mettez en forme le contenu dans l’éditeur plein écran, puis choisissez **Enregistrer la note**.
6. La note rejoint alors la liste compacte et le Kanban.
7. Utilisez le regroupement par statut, priorité, type ou module d’origine.
8. Cliquez une carte pour ouvrir sa vue de détail, puis modifiez, épinglez, terminez ou archivez la note.

## Éditeur riche plein écran

- Le contenu éditable ne repasse pas dans l’état React à chaque caractère : la frappe reste locale au champ jusqu’à l’enregistrement afin de stabiliser les navigateurs mobiles et les claviers virtuels.
- Le caret reste maintenu dans la zone visible de l’éditeur pendant la saisie et les suppressions avec Backspace ; l’utilisateur ne doit pas devoir remonter manuellement la page après chaque caractère supprimé.
- La barre de mise en forme reste fixe au-dessus du texte et se parcourt horizontalement sur mobile comme sur desktop.
- Sélectionnez un texte existant puis appliquez directement gras, italique, soulignement, barré, surlignage, titre, citation, listes, alignement, couleur, police, taille, interligne, espacement ou lien : la sélection est restaurée avant l’application du format.
- L’éditeur conserve son propre défilement vertical et utilise une taille de texte mobile évitant le zoom automatique des navigateurs.
- Le bouton **Retour aux informations** permet de corriger les métadonnées sans perdre le brouillon de contenu de la session d’édition.

## Aperçu fidèle des notes

- Ouvrir une note ou un pense-bête affiche directement son HTML riche enregistré.
- Les titres, couleurs, polices, tailles, alignements, listes, espacements, citations, code et liens restent visibles dans l’aperçu sans passer par **Modifier**.
- Le contenu est normalisé côté serveur avant persistance et les scripts, iframes ou attributs dangereux ne sont pas acceptés.

## Calculatrice scientifique et standard

- Le mode **Standard** utilise une disposition conventionnelle : `AC`, changement de signe, pourcentage, division, chiffres, multiplication, soustraction, addition, décimale et `=`.
- Le pourcentage est appliqué comme opérateur postfixé (`25%` = `0,25`).
- Le mode **Scientifique** de la **Calculatrice scientifique** ajoute `sin`, `cos`, `tan`, `sqrt`, `log`, `ln`, `abs`, `pow`, les constantes `pi` et `e`, les puissances et parenthèses.
- Les fonctions trigonométriques utilisent les radians.
- L’évaluation reste locale et sûre : aucun `eval`, `new Function` ou service externe n’est utilisé.

## Calculatrice financière et aide interactive

Le mode **Financière** propose un assistant par formule. Choisissez une formule, consultez l’explication et les hypothèses, renseignez les champs puis calculez.

Formules disponibles :

- mensualité d’un emprunt amortissable ;
- valeur future ;
- valeur actuelle ;
- taux de croissance annuel composé (CAGR) ;
- retour sur investissement (ROI) ;
- valeur actuelle nette (VAN / NPV) avec flux périodiques ;
- seuil de rentabilité en unités ;
- taux annuel effectif selon la fréquence de capitalisation.

Les valeurs monétaires doivent utiliser une unité cohérente entre les champs. Les taux sont saisis en pourcentage. Les résultats sont des estimations et doivent être validés dans le workflow Finance approprié avant une décision comptable, financière ou contractuelle.

## Statuts, validations et traçabilité

- `Brouillon` : note en préparation.
- `Active` : note ou rappel en cours.
- `Terminée` : élément accompli.
- `Archivée` : élément conservé hors des vues actives.
- Les créations, mises à jour et archivages sont audités et les archives ne sont pas supprimées brutalement.

## Sécurité et confidentialité

- Les notes sont rattachées à l’utilisateur connecté et ne sont jamais partagées automatiquement avec une organisation ou un autre utilisateur.
- Le contenu riche est normalisé avant persistance et rendu selon les protections du contenu riche DTSC.
- La calculatrice n’envoie ni expression ni données financières à un service externe.

## Dépannage

- Si la zone d’édition ne semble plus active après une interaction système, touchez directement le texte : le caret doit rester dans le viewport propre de l’éditeur.
- Si une note n’apparaît pas après l’enregistrement, rechargez la liste et vérifiez que les éléments archivés sont masqués.
- Si un calcul échoue, vérifiez les parenthèses, les nombres, les taux et les séparateurs des flux financiers.
- Pour la VAN, séparez les flux par des virgules ou des points-virgules.
