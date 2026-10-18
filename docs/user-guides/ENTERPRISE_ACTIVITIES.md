# Guide utilisateur — Activités entreprise

## Déclarer une exécution de production (Manufacturing)

Si l'entreprise est dans le secteur **Manufacturing** et dispose de la permission `PRODUCTION_EXECUTION`, l'action « Déclarer production » conduit au module **Exécution production**. Choisissez un ordre **en cours** et enregistrez un type d'exécution (début, fin d'opération, travail), les références pertinentes et les informations de réalisation.

**Attention :** cet enregistrement documente l'exécution ; il ne change **pas** les quantités de stock. L'entrée de produits finis et la consommation des matières sont des opérations distinctes, avec leurs propres validations. Le module refuse les ordres non actifs ou extérieurs à l'entreprise. Sans permission ou abonnement compatible, l'action reste indisponible.

Voir `docs/HOTFIX_882_MANUFACTURING_EXECUTION_HANDOFF.md` pour les contrôles et les limites de l'action.


## Opérations métier disponibles dans leurs modules ERP

Certaines actions professionnelles ne créent plus une simple demande : si le module correspondant est réellement activé dans l'entreprise **et** si les permissions du collaborateur l'autorisent, le bouton **Ouvrir Temps, présences & congés** ou **Ouvrir Temps & livrables** permet de poursuivre dans le module ERP propriétaire.

- **Déclarer temps travaillé** : l'onglet Feuilles de temps est sélectionné ; le formulaire de déclaration est accessible si le module Temps autorise l'écriture. La durée enregistrée reste soumise à validation ; aucune feuille de temps n'est créée avant enregistrement explicite.
- **Soumettre livrable** : le module Temps & livrables ouvre le formulaire métier réel quand le droit d'écriture est acquis. Le responsable, le projet, le document et les validations sont contrôlés par ce module.
- Si le module n'est pas activé, si l'abonnement ne l'autorise pas ou si le rôle n'a pas les droits nécessaires, l'action reste **indisponible**. Aucun faux succès ni soumission automatique n'est possible depuis Activités.
- Les autres opérations nécessitant une vraie API métier restent indisponibles jusqu'à leur intégration (#878).

Le parcours et les critères de validation figurent dans `docs/HOTFIX_878_WAVE1_CANONICAL_HANDOFFS.md`.


## Demandes collaboratives et opérations métier

Les actions de secteur affichent dorénavant leur disponibilité réelle.

- **Créer une demande** : le formulaire prépare une demande interne suivie ; la saisie ne constitue pas une opération enregistrée dans les modules Ventes, Stock, Notes, Caisse ou Documents.
- **Action indisponible** : l'interface fournit le motif et désactive l'envoi. Un appel direct à l'API est également refusé. Pour un enregistrement métier définitif, passer par le module spécialisé et ses validations.
- Les numéros de dossier, de projet, de client ou de produit demandés dans les formulaires non intégrés sont des références **communiquées** : aucune liaison à un vrai enregistrement ERP n'est créée par simple texte.
- Les pièces justificatives, photos, livrables et dossiers confidentiels nécessitent le téléversement privé du module dédié. Ne pas saisir de données personnelles ou financières sensibles dans un champ de référence libre.
- Une demande enregistrée est visible dans « Demandes » et, si les permissions le permettent, dans « Demandes internes » et « Workflows », avec les statuts et approbations réels.

La matrice de tous les codes et de leur état de préparation figure dans `docs/HOTFIX_876_SECTOR_ACTIVITY_MATRIX.md`.

> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Activités entreprise** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Rôle du module

**Activités entreprise** regroupe les actions opérationnelles de l’organisation cliente active : demandes, tâches, opérations, workflows, documents et parcours sectoriels autorisés.

Le contexte d’entreprise est toujours affiché et contrôlé côté serveur. Aucune donnée d’une autre organisation n’est accessible en modifiant une URL ou un identifiant.

## Guide intégré

Le bouton **Guide utilisateur** affiché au début du module ouvre une aide contextuelle recherchable. Le guide décrit les fonctions réellement actives dans l’entreprise sélectionnée.

## Présentation professionnelle et Gaming

Le module utilise les vues Actions, Demandes et Workflows avec indicateurs et rail tactile local. Pour une salle de jeux, Gaming Lounge présente les références réelles autorisées : poste, réservation, session, clôture et client CRM. Une demande de confirmation n'exécute jamais automatiquement une réservation, un encaissement ou une validation : l'action métier finale reste dans le module ERP correspondant.

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
