# Guide utilisateur — Entreprise du compte
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Entreprise du compte** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Concepts distincts

Le profil professionnel déclaré contextualise le compte et l’assistant privé. Une organisation cliente est un espace multi-tenant. Un membership autorise l’accès à cet espace. Une relation d’entreprise utilise le moteur d’identité et de consentement. Le contexte actif détermine les données actuellement consultables.

## Profil professionnel

L’utilisateur peut renseigner son entreprise déclarée, sa fonction, ses activités et ses documents privés. Ces données ne créent aucune organisation ni permission.

## Organisations rejointes

Une organisation apparaît uniquement après acceptation d’une invitation valide et activation du membership. Les données administratives restent modifiables selon les permissions de l’organisation.

## Invitations

Les invitations reçues sont visibles depuis le compte personnel avant l’adhésion.

## Relations

Les relations actives, en attente ou révoquées proviennent du moteur canonique de consentement. Une relation ne remplace jamais un membership.

## Documents

Les documents du chatbot sont isolés par utilisateur et contexte, limités par le plan et traités selon leur statut réel.

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
