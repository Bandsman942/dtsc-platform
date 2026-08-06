# Guide utilisateur — Activités entreprise
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Activités entreprise** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Rôle du module

**Activités entreprise** regroupe les actions opérationnelles de l’organisation cliente active : demandes, tâches, opérations, workflows, documents et parcours sectoriels autorisés.

Le contexte d’entreprise est toujours affiché et contrôlé côté serveur. Aucune donnée d’une autre organisation n’est accessible en modifiant une URL ou un identifiant.

## Guide intégré

Le bouton **Guide utilisateur** affiché au début du module ouvre une aide contextuelle recherchable. Le guide décrit les fonctions réellement actives dans l’entreprise sélectionnée.

## Créer une activité

Sélectionnez un bloc d’activité actif puis renseignez les champs demandés :

- titre ;
- description ;
- priorité ;
- destinataire ou responsable actif ;
- module cible ;
- informations sectorielles utiles ;
- documents lorsque le parcours le prévoit.

Le serveur vérifie le membership actif, le bloc, le module, le destinataire et toutes les références dans le même `organizationId`.

## Liste et Kanban

Les modules opérationnels associés proposent des vues Liste et Kanban lorsque les statuts évoluent dans le temps.

Les colonnes représentent les étapes réelles du processus. Le déplacement ou la transition d’un objet n’est pas un simple changement visuel : le serveur vérifie que l’utilisateur est le responsable, le destinataire ou un acteur explicitement autorisé.

## Checklist et progression

Les tâches et opérations compatibles utilisent une checklist. Le responsable ajoute les résultats à réaliser et coche les éléments terminés.

La progression est calculée automatiquement à partir des éléments actifs. Un pourcentage saisi librement ne constitue pas une preuve d’avancement.

## Commentaires et mentions

Les commentaires restent liés à l’objet canonique. Les utilisateurs autorisés peuvent échanger, répondre, modifier ou supprimer leurs propres commentaires.

Les mentions `@collaborateur` sont mises en évidence. Lorsqu’une action professionnelle est proposée, elle reste soumise aux permissions du module de destination.

## Demandes internes

Une demande créée depuis Activités entreprise est reliée à la demande standard correspondante. Le demandeur suit son statut, tandis que le destinataire explicite prend en charge, répond, résout et clôture selon le workflow autorisé.

Les objets sont reliés par leurs identifiants techniques ; aucune liaison n’est déduite par similarité de titre.

## Documents

Les pièces jointes utilisent le module Documents :

- stockage privé ;
- validation du type et de la taille ;
- versions ;
- visibilité contrôlée ;
- téléchargements audités ;
- liens vers plusieurs objets sans duplication du fichier.

L’indexation avancée et la comparaison visuelle restent désactivées proprement tant que leurs fournisseurs externes ne sont pas configurés.

## SLA

Une politique SLA peut être rattachée à un objet réel par un administrateur autorisé. Le SLA calcule une échéance, un avertissement et un dépassement sans modifier automatiquement le statut métier de l’objet.

## Notifications et calendrier

Les affectations, invitations, mentions et décisions peuvent produire une notification ouvrant l’objet exact.

Les dates intégrées apparaissent dans le Calendrier uniquement lorsqu’une source canonique les expose. Le Calendrier ne crée pas une copie indépendante de chaque activité.

## Sécurité

Toute action sensible revérifie :

- la session ;
- l’organisation active ;
- le membership ;
- le module et le bloc actifs ;
- l’entitlement ;
- la permission ;
- la propriété ou la responsabilité de l’objet ;
- l’origine de la requête ;
- les données du formulaire.

## Accès et permissions

- Ouvrez le module depuis la navigation du contexte actif.
- Les boutons et actions dépendent du rôle, du poste officiel, des permissions individuelles, du tenant actif et de l’état du module.
- Une action masquée dans l’interface reste également refusée par le serveur lorsqu’elle n’est pas autorisée.
- Sur mobile, utilisez le parcours liste → détail plein écran → formulaire plein écran → retour.

## Statuts, validations et traçabilité

- Les statuts visibles correspondent aux états réellement persistés ; les codes techniques ne sont pas présentés comme libellés métier.
- Les validations, refus, annulations, réouvertures et actions sensibles conservent leur auteur, leur date et, lorsque requis, leur motif.
- Une action répétée avec la même clé métier ne doit pas produire de doublon ni un second impact.

## Sécurité et confidentialité

- Les données sont limitées à l’utilisateur ou à l’organisation autorisée.
- Les références reçues du navigateur sont revérifiées côté serveur dans le même contexte.
- Les documents et informations sensibles utilisent les routes privées et les contrôles d’accès prévus par le module.

## Dépannage

- Actualisez la vue si une opération validée n’apparaît pas immédiatement.
- Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau.
- En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.
