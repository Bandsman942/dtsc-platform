# Guide utilisateur — Abonnement
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Abonnement** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Comprendre les trois notions affichées

Le module distingue désormais clairement :

- **l’offre commerciale** : ce qui est réellement proposé ou souscrit, par exemple `Découverte`, `Organisation Essentielle`, `Organisation Croissance` ou `Organisation Premium` ;
- **l’abonnement** : l’instance active ou historique qui relie votre compte ou votre organisation à cette offre, avec son statut et sa période ;
- **le niveau de capacité** : **Essentiel**, **Professionnel** ou **Entreprise**, utilisé par le serveur pour déterminer les fonctionnalités et limites disponibles.

Le code technique correspondant au niveau peut être `STARTER`, `BUSINESS` ou `ENTERPRISE`, mais ces codes ne sont pas présentés comme le nom de votre offre commerciale.

## Offre appliquée selon le contexte

Le module distingue l’abonnement personnel de l’abonnement de l’organisation active.

- Dans le contexte personnel, l’offre appliquée vient de votre abonnement personnel actif ou, à défaut, de l’offre gratuite Découverte.
- Dans une organisation cliente, l’offre appliquée vient exclusivement de l’abonnement de cette organisation. Le compte personnel d’un membre ne remplace jamais silencieusement l’offre de l’entreprise.
- Dans le contexte interne DTSC, les capacités internes restent séparées des abonnements clients.

Il est donc normal d’avoir, par exemple, une offre personnelle **Découverte** tout en travaillant dans une entreprise dont l’offre active est **Organisation Premium** et le niveau de capacité **Entreprise**.

## Statuts

Les statuts peuvent notamment être gratuit, actif, en attente de paiement, en retard, annulé ou expiré selon les valeurs réellement enregistrées.

## Limites et consommation

Les messages, tokens et documents affichés utilisent les journaux et compteurs réels du **contexte actif**. Les limites affichées proviennent de la même résolution commerciale que l’offre et le niveau de capacité visibles en haut de page. Le frontend n’autorise jamais seul un dépassement.

## Factures SaaS

Les factures de ce module concernent l’abonnement DTSC. Elles ne sont pas les factures clients, fournisseurs ou comptables des modules ERP.

## Paiements

La référence, le fournisseur, le montant, la devise, le statut et la date sont affichés lorsqu’ils existent.

## Changement d’offre

Une action de paiement ou de changement n’est affichée que lorsque le fournisseur est réellement configuré. Pour une organisation, seules les offres destinées aux organisations peuvent être sélectionnées. En cas d’échec, conserver la référence et contacter le support.

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
- Une organisation cliente ne reçoit jamais des capacités IA depuis l’abonnement personnel d’un de ses membres.

## Dépannage

Si l’offre affichée dans le contexte d’une organisation ne correspond pas à celle attendue, vérifiez d’abord l’**Abonnement de l’organisation active** et son statut. Un ancien abonnement historique peut être affiché dans l’historique sans devenir l’autorité du contexte courant.

Actualisez la vue si une opération validée n’apparaît pas immédiatement. Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau. En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.

## Catalogue unique des offres

- Les offres sont séparées en **offres individuelles** et **offres d’organisation**.
- Le nom, la description, le montant, les quotas de messages, de jetons et de documents proviennent de `BillingPlan`, source commerciale unique administrable et versionnée. **C’est la source unique du catalogue commercial.**
- Une modification validée dans Administration DTSC s’applique aux cartes Abonnement et aux résolutions serveur qui alimentent le chatbot global et l’Assistant IA d’entreprise.
- Dans la Console DTSC, les cartes d’offres affichent séparément le **nom de l’offre commerciale**, son **audience**, son **niveau de capacité** et son **code technique**. L’écran des abonnements organisations affiche de la même manière l’offre liée à l’abonnement et le niveau de capacité qu’elle produit.
- Le serveur dérive ensuite le niveau de capacité Essentiel / Professionnel / Entreprise à partir de l’offre effective.
- Pour les offres canoniques DTSC, l’audience est verrouillée : une offre `org-*` reste une offre d’organisation et une offre personnelle canonique reste personnelle. Cette protection empêche de recréer l’ambiguïté entre catalogue personnel et catalogue entreprise.
- Les anciens quotas du profil utilisateur servent uniquement de repli de compatibilité lorsqu’aucune offre personnelle active n’est résolue ; ils ne remplacent jamais l’offre d’une organisation cliente.
