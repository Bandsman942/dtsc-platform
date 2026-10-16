# Guide utilisateur — Workflows
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Le module **Workflows** exécute des processus transverses versionnés. Ce guide décrit la préparation d’un brouillon, sa revue avant publication et le suivi des exécutions.

## Définitions et versions

Une définition contient son déclencheur et ses versions. Une version publiée est immuable. Toute évolution est réalisée dans une nouvelle version brouillon.

## Construire un brouillon

Le graphe est composé d’étapes contrôlées : départ, condition, affectation, création de validation, création de tâche, action métier, notification, attente et fin.

Les branches relient deux étapes avec un résultat éventuel. Les erreurs évidentes de saisie, comme un code d’étape dupliqué ou une branche identique, sont signalées localement sans fermer le formulaire.

Toute modification locale du graphe marque le brouillon comme non enregistré. La publication reste alors désactivée jusqu’à l’enregistrement serveur.

## Readiness serveur

Le serveur vérifie notamment :

- la présence et l’unicité des étapes ;
- le chemin de départ vers une fin ;
- la cohérence des transitions ;
- les affectations obligatoires ;
- les actions métier autorisées ;
- les références membre/département dans l’organisation active.

Un brouillon comportant un blocage de readiness ne peut pas être publié.

## Revue avant publication

La publication ne repose plus sur un simple acquittement implicite. Utilisez **Revoir et publier**.

La revue plein écran affiche la version exacte candidate, son déclencheur, sa readiness, les blocages, les étapes, leurs paramètres métier lisibles et les branches.

Le serveur calcule un jeton SHA-256 à partir du snapshot stocké. Au moment de publier, il recharge le brouillon, recalcule la readiness et le jeton. Si le brouillon a changé depuis la revue, la publication est refusée et une nouvelle revue est obligatoire.

## Exécutions

Une exécution reste liée à la version publiée qui l’a créée. La timeline affiche les événements, l’état et le contexte source.

Les retries ne sont proposés que pour les états autorisés. Une annulation demande un motif et n’effectue pas de rollback automatique des actions métier déjà réussies.

## Statuts, validations et traçabilité

Les versions brouillon et publiées, les états d’exécution, les décisions de validation, les retries, les annulations et les événements conservent leur historique. Les effets métier et décisions utilisent leurs clés d’idempotence, les versions publiées ne sont pas modifiées rétroactivement et une revue obsolète ne peut pas publier silencieusement une nouvelle configuration.

## Accès et permissions

- La création et l’édition de brouillons dépendent des capacités du module.
- La publication exige `canPublish` côté serveur.
- Les références utilisateur et département sont contrôlées dans le tenant actif.
- L’interface n’est jamais la seule barrière de sécurité.

## Sécurité et confidentialité

Chaque définition, version, étape, branche et exécution reste limitée à l’organisation active. Le serveur revalide les références membres et départements, les capacités de publication et le snapshot exact avant mutation afin d’empêcher une publication inter-tenant ou fondée sur une revue obsolète.

## Expérience guidée

Les dialogues de création, étape, branche, revue de publication, timeline et actions critiques utilisent la présentation éditeur adaptée au mobile. Les libellés visibles sont fournis en français ou en anglais selon la langue active.

## Dépannage

Si **Revoir et publier** est désactivé, enregistrez d’abord les changements locaux et corrigez les blocages de readiness. Si la revue devient obsolète, fermez-la, rechargez le brouillon et ouvrez une nouvelle revue avant publication.


## Lancer un workflow manuellement (WF-03)

Après publication, un collaborateur disposant de la permission de démarrer un workflow trouve l’action **Lancer** dans la liste et la fiche de définition. Cette action n’est disponible que si le workflow est actif et autorise le démarrage manuel. Choisir un **objet métier** proposé dans la liste limitée aux objets accessibles, puis confirmer **Démarrer le workflow**. Aucun identifiant technique ne doit être saisi. Une action réussie ouvre directement la timeline et conserve un lien avec `?runId=...`. Une demande non autorisée ne démarre rien.

Pour l’instant, le sélecteur contrôlé couvre les tâches, demandes, réunions, achats, budgets, dépenses et rapports. Pour un autre type ERP, le lancement manuel par l’interface est explicitement indisponible jusqu’à la certification de son sélecteur. Les données sont filtrées par entreprise active, module source/abonnement et propriété ou droits de supervision.

Dans **Exécutions**, les résultats sont paginés (20 par page) et filtrables par statut. Précédent/Suivant n’effacent pas les résultats des pages suivantes. Le compteur affiché correspond aux seules exécutions visibles selon vos permissions.

Le **déclencheur, type d’objet, événement métier, autorisation de démarrage manuel et unicité d’une exécution active** sont figés dès la première publication. Une nouvelle version brouillon permet d’éditer le graphe et ses étapes, mais ne remplace pas silencieusement le contrat de déclenchement ; pour changer ce contrat, il faut créer une nouvelle définition de workflow et la faire revoir. Une publication concurrente ou une modification du brouillon après revue impose de recommencer la revue.


## Studio visuel des brouillons (WF-05 — disponible après validation #818)

Dans une version **DRAFT**, le studio permet de visualiser les étapes et leurs branches. Sur ordinateur, sélectionnez un nœud pour consulter ses propriétés, déplacez-le à la souris ou à l’aide des flèches du clavier, et ajustez le zoom (50–150 %). Le panneau latéral permet de modifier le nom et la description et de supprimer une étape. Utilisez « Ajouter un nœud » pour ouvrir le formulaire structuré, puis « Relier » pour définir origine, destination et résultat (Oui, Non, Approuvé, Rejeté, etc.). Une liste accessible et les formulaires existants restent disponibles sur téléphone.

Les modifications locales marquent le brouillon comme non enregistré. Les boutons **Annuler/Rétablir** gardent au plus vingt états de travail ; ils n’annulent pas une publication déjà confirmée. Cliquez sur **Enregistrer** : les coordonnées, étapes, transitions et propriétés sont conservées par la même API de version, sans duplication du moteur. La revue de readiness puis la validation de publication demeurent obligatoires.

**Important :** le studio #818 se trouve encore en PR de développement et n'est pas annoncé déployé. Les tests navigateur, les situations de modifications simultanées et l'E2E propriétaire doivent être concluants avant sa disponibilité.
