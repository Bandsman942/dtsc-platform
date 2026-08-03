# Guide utilisateur — Activités entreprise

## Rôle du module

**Activités entreprise** permet aux membres d'une organisation cliente d'envoyer des demandes structurées vers les blocs d'activité activés, sans leur donner automatiquement accès aux modules d'administration correspondants.

## Accéder au module

Sélectionnez une organisation active, puis ouvrez **Activités entreprise**. Le nom, le secteur et les blocs disponibles proviennent de la configuration de cette organisation.

## Blocs d'activité

Chaque bloc correspond à une action réellement configurée : demande interne, besoin métier, signalement ou transmission vers un module cible. Un bloc désactivé ou non autorisé n'est pas proposé.

## Créer une activité ou demande

Sélectionnez le bloc, puis renseignez :

- le titre et la description ;
- la priorité ;
- le destinataire actif lorsque le formulaire le permet ;
- les informations complémentaires propres au bloc.

Le serveur vérifie :

- le membership actif ;
- l'accès au bloc ;
- le destinataire ;
- l'organisation ;
- les données du formulaire.

La soumission crée une `EnterpriseActivityRequest`. Le parcours actuel crée également une `EnterpriseRequest` canonique liée pour le suivi standard des demandes.

## Affectation et suivi

Le demandeur voit ses activités. Les responsables autorisés voient les demandes du périmètre entreprise. Le destinataire ou les gestionnaires reçoivent une notification et traitent la demande dans le module cible ou dans **Demandes internes**.

## Source canonique et liens

L'activité conserve son bloc et son contexte sectoriel. La demande standard liée conserve la chaîne de traitement opérationnelle. Les deux objets sont reliés par identifiants ; aucune correspondance n'est déduite par le titre.

## Statuts et historique

Les statuts disponibles dépendent du bloc et du module cible. La création et les transitions importantes sont auditées. Une activité historique reste lisible même si un bloc est ensuite désactivé.

## Documents et commentaires

Lorsque le parcours le propose, les pièces jointes utilisent le module Documents et les commentaires utilisent la primitive commune. Les accès sont limités aux membres autorisés de l'organisation.

## Notifications et liens profonds

Une nouvelle demande notifie le destinataire sélectionné ou les responsables de l'entreprise. Les liens ouvrent le bon contexte ; un membership révoqué entraîne un refus sûr.

## Calendrier

Une activité datée apparaît uniquement si son service canonique expose une date intégrée. Le Calendrier ne crée pas automatiquement un événement indépendant pour toute activité.

## Limites

- Les formulaires dynamiques varient selon les blocs réellement configurés ; le module n'affiche pas des champs fictifs.
- L'ancienne `EnterpriseActivityRequest` et la demande standard restent deux objets liés pendant la convergence progressive ; elles ne doivent pas diverger silencieusement.
- Les SLA, validations multiples et documents obligatoires dépendent du workflow ou du module cible activé.
