# Guide utilisateur — Activités entreprise

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
