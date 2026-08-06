# Guide utilisateur — Activités DTSC
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Activités DTSC** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Rôle du module

**Activités DTSC** est l’espace de travail interne des collaborateurs disposant d’un dossier RH actif. Il réunit les tâches, opérations, demandes, blocages, réunions, rapports, prestations et objets spécialisés qui concernent le collaborateur connecté.

Le module n’accorde aucun accès implicite à une console sensible. Chaque lecture et chaque action sont contrôlées côté serveur selon :

- le contexte `DTSC_INTERNAL` ;
- le dossier collaborateur actif ;
- le poste officiel ;
- la responsabilité enregistrée ;
- le destinataire explicite ;
- les permissions individuelles éventuelles.

## Utiliser la vue Liste ou Kanban

Le bouton de vue permet de choisir :

- **Liste** : objets regroupés par section métier ;
- **Kanban** : objets à statut évolutif regroupés en À faire, En cours, Bloqué / correction et Terminé.

La recherche et les filtres de dates s’appliquent réellement aux objets visibles.

Une carte Kanban affiche le statut, la priorité, le titre, le résumé, la section source et la progression disponible. Cliquez sur la carte pour ouvrir les détails.

## Faire évoluer le statut

Le changement de statut n’est possible que pour :

- le collaborateur assigné ;
- le responsable explicite ;
- le destinataire d’une demande ;
- un utilisateur bénéficiant d’une permission individuelle sensible prévue pour cet acte.

Le rôle global MANAGER, SUPPORT ou ADMIN ne remplace pas automatiquement cette responsabilité métier.

Chaque transition est historisée avec :

- l’ancien statut ;
- le nouveau statut ;
- l’acteur ;
- la date ;
- le motif ou commentaire ;
- la progression calculée.

## Checklist et progression automatique

Les tâches, opérations, demandes, blocages, réunions et autres objets compatibles disposent d’une checklist.

Le responsable ajoute les résultats concrets à réaliser, puis coche les éléments terminés. Le système calcule la progression automatiquement :

```text
éléments réalisés ÷ éléments actifs × 100
```

Pour terminer une tâche ou demander sa validation :

- la checklist doit contenir au moins un élément ;
- tous les éléments doivent être réalisés ;
- la progression doit être de 100 %.

Le champ de pourcentage manuel n’est plus utilisé pour faire avancer une tâche.

## Commentaires et mentions professionnelles

Dans le détail d’un objet, vous pouvez :

- ajouter un commentaire ;
- répondre à un commentaire ;
- modifier votre commentaire ;
- supprimer votre commentaire avec conservation de la structure du fil ;
- charger les commentaires précédents ;
- mentionner un collaborateur autorisé avec `@`.

Une mention est cliquable. Les actions professionnelles proposées peuvent permettre :

- d’ouvrir le profil professionnel ;
- d’ouvrir une conversation directe ;
- de préparer une invitation à un événement ;
- de copier le nom.

Les permissions sont revérifiées dans la destination.

## Pièces jointes

Les pièces jointes peuvent être prévisualisées ou téléchargées selon leur type. Les images utilisent le composant d’image sécurisé de l’application. Les documents sensibles restent servis par des routes privées et auditées.

## Prestations hebdomadaires

La section **Prestations hebdomadaires** permet de déclarer le travail réellement effectué :

- date ;
- heures de début et de fin ;
- pause ;
- type de travail ;
- mode ou lieu ;
- résumé ;
- détails et preuves utiles.

Le temps déclaré est calculé côté serveur. Une disponibilité n’est jamais considérée comme une prestation ni comme un calcul automatique de paie.

## Ouvrir l’historique des prestations

Chaque semaine de l’historique est cliquable. Le détail affiche :

- toutes les prestations ;
- le temps déclaré ;
- le temps validé ;
- le statut ;
- le numéro de révision ;
- les commentaires de validation ;
- les décisions précédentes ;
- la date de création ;
- la date de dernière modification.

## Soumettre une semaine passée

Une semaine passée peut être soumise ou resoumise uniquement lorsque l’utilisateur possède la permission individuelle :

```text
work.past_period.submit
```

Sans cette permission :

- le bouton de soumission n’est pas affiché ;
- la route serveur refuse une tentative directe ;
- l’historique reste consultable en lecture ;
- aucune exception Production n’est générée.

La permission est attribuée dans **Administration → Accès RBAC → Permissions individuelles DTSC**.

## Créer et gérer ses propres événements

Les événements créés par le collaborateur restent sous sa responsabilité. Il peut les consulter, modifier et annuler depuis le Calendrier interne et les sections qui les projettent.

Les détails affichent la date de création et la date de dernière modification.

## Permissions individuelles

Un administrateur DTSC peut accorder un acte précis à un collaborateur sans modifier son rôle global ou son poste officiel.

Une permission individuelle comprend :

- un code issu d’un catalogue fermé ;
- un effet ALLOW ou DENY ;
- un motif obligatoire ;
- une date de début ;
- une expiration facultative ;
- une révocation auditée.

Un DENY individuel prévaut sur un ALLOW du même code.

## Guide intégré dans l’application

Le bouton **Guide utilisateur** dans l’en-tête d’Activités DTSC ouvre un guide contextuel recherchable correspondant aux fonctions réellement déployées.

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

## Correctifs de l’itération 7 — prestations et progression

- Le Kanban des prestations hebdomadaires peut être organisé par **mode de travail** ou par **type de travail**.
- Une prestation journalière s’ouvre dans une vue plein écran avec résumé, statut et discussion entre le déclarant et le validateur autorisé.
- La soumission hebdomadaire possède sa propre discussion globale avant et pendant le workflow de validation.
- Toute opération gouvernée par des tâches ou une checklist calcule sa progression côté serveur ; aucun pourcentage manuel n’est demandé.
- Une opération ne peut pas être clôturée tant qu’une tâche liée reste ouverte. Les états terminée, validée ou annulée sont les seuls états terminaux admis.
