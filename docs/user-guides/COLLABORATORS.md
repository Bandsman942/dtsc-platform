# Guide utilisateur — Mes collaborateurs
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Mes collaborateurs** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Collaborateurs visibles

La recherche affiche uniquement les personnes reliées à votre contexte : membres actifs de l’organisation, collaborateurs DTSC autorisés, relations consenties ou participants d’un groupe commun. Elle n’est pas un annuaire public.

## Démarrer une conversation

Choisissez **Nouvelle conversation directe**, recherchez la personne autorisée puis ouvrez la conversation. Une seconde tentative réutilise la conversation existante dans le même contexte.

## Groupes

Créez un groupe, définissez son nom et invitez des utilisateurs autorisés. Le propriétaire peut nommer des administrateurs. Avant de quitter, le propriétaire doit transférer la propriété ou fermer le groupe.

## Blocage

Dans une conversation directe, le blocage empêche les nouveaux messages et appels. L’historique conservé reste soumis à la politique de confidentialité.

## Liens, mentions et actions professionnelles

- Les adresses web écrites dans un message deviennent des liens sécurisés ouvrables dans le navigateur.
- Saisissez `@` puis choisissez un membre pour créer une mention persistante. Le destinataire voit un compteur de mention sur la conversation non ouverte et reçoit la notification autorisée par ses préférences.
- Cliquez sur une mention pour afficher le poste et l’adresse professionnelle, démarrer une conversation directe, mentionner de nouveau, copier l’adresse e-mail ou préparer un e-mail.
- Les propriétaires et administrateurs d’un groupe peuvent utiliser `@tous`. Cette mention cible tous les membres actifs et ne peut pas être simulée par un utilisateur sans permission.

## Accusés de lecture

- Un trait : message enregistré sur le serveur.
- Deux traits cyan : au moins un destinataire a lu, mais certains destinataires actifs ne l’ont pas encore lu.
- Deux traits verts : tous les destinataires actifs ont lu le message.

## Filtres et listes personnalisées

La barre de filtres propose notamment `Tous`, `Directs`, `Non lus`, `Favoris`, `Groupes` et `Archivés`.

Ouvrez **Filtres** pour créer jusqu’à vingt listes privées. Une liste peut combiner :

- discussions directes et/ou groupes ;
- non lus uniquement ;
- mentions uniquement ;
- favoris uniquement ;
- conversations précises sélectionnées.

Les listes sont enregistrées dans votre compte et ne changent jamais vos permissions sur les groupes.

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

## Annuaire de contacts acceptés et historique

- La zone **Mes contacts** affiche les utilisateurs dont la demande de contact a été acceptée, avec leur présence et un accès direct à la conversation.
- Seul un rôle global `ADMIN` peut rechercher une adresse électronique exacte dans toute la plateforme ; son invitation porte l’étiquette **ADMIN DTSC**.
- Les autres rôles conservent la recherche consentie et les règles de visibilité déjà applicables.
- **Messages précédents** ajoute les pages plus anciennes au-dessus du fil, conserve l’ancrage visuel et ne revient pas automatiquement au dernier message.
