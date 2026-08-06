# Guide utilisateur — Abonnement
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Abonnement** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Plan appliqué

Le module distingue l’abonnement personnel de l’abonnement de l’organisation active. Le statut et les capacités viennent du catalogue et des entitlements canoniques.

## Statuts

Les statuts peuvent notamment être gratuit, actif, en attente de paiement, en retard, annulé ou expiré selon les valeurs réellement enregistrées.

## Limites et consommation

Les messages, tokens et documents affichés utilisent les journaux et compteurs réels. Le frontend n’autorise jamais seul un dépassement.

## Factures SaaS

Les factures de ce module concernent l’abonnement DTSC. Elles ne sont pas les factures clients, fournisseurs ou comptables des modules ERP.

## Paiements

La référence, le fournisseur, le montant, la devise, le statut et la date sont affichés lorsqu’ils existent.

## Changement de plan

Une action de paiement ou de changement n’est affichée que lorsque le fournisseur est réellement configuré. En cas d’échec, conserver la référence et contacter le support.

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

## Catalogue unique des offres

- Les offres sont séparées en **offres individuelles** et **offres d’organisation**.
- Le nom, la description, le montant, les quotas de messages, de jetons et de documents proviennent de `BillingPlan`, source unique administrable et versionnée.
- Une modification validée dans Administration DTSC s’applique immédiatement aux cartes Abonnement, au chatbot global et à l’Assistant IA d’entreprise.
- Les anciens quotas du profil utilisateur servent uniquement de repli de compatibilité lorsqu’aucune offre active n’est résolue.
