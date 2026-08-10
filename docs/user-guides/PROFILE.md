# Guide utilisateur — Profil
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Profil** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Sections pliables

Le module Profil est organisé en sections qui peuvent être ouvertes et repliées afin de garder une lecture compacte sur mobile comme sur desktop : **Visibilité et responsabilités**, **Contacts**, **Modifier le profil** et **Historique d’activité**.

## Informations personnelles

Le profil permet de modifier le nom affiché, le téléphone, la fonction, l’entreprise déclarée, la localisation, le site et la biographie. L’adresse e-mail principale n’est pas modifiée silencieusement depuis ce formulaire.

## Contacts

La section **Contacts** affiche les relations de contact acceptées dans **Mes collaborateurs**. Elle ne maintient pas un carnet d’adresses séparé : la liste provient du même workflow de collaboration et respecte les blocages actifs.

Chaque contact apparaît en ligne compacte avec son avatar, sa fonction et son état de présence. Touchez la ligne pour ouvrir un détail immersif en plein écran sur mobile. Le menu `...` du détail contient uniquement des actions réellement disponibles :

- ouvrir ou réutiliser la conversation directe DTSC ;
- préparer un e-mail ;
- copier l’adresse e-mail.

Le détail indique également la date de mise en relation et la dernière présence disponible. L’ouverture d’une conversation repasse toujours par l’API de collaboration afin de réappliquer les autorisations et d’éviter les conversations directes en doublon.

## Avatar

Les formats PNG, JPG et WebP sont acceptés. L’image est recadrée en carré, compressée puis envoyée vers le stockage configuré. L’avatar est ensuite réutilisé dans les surfaces autorisées.

## Visibilité

Les données sensibles restent privées par défaut. Le consentement public porte uniquement sur les éléments et surfaces explicitement indiqués.

## Activité

L’historique récent combine des éléments autorisés du compte, sans prétendre constituer un journal d’audit exhaustif.

## Sécurité

Toute modification est réservée au propriétaire du profil et validée côté serveur. Les contacts visibles restent limités aux relations acceptées du compte connecté.

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
