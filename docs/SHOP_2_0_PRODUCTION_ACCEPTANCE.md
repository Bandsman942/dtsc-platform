# Shop 2.0 — Preuves de Production et acceptance de clôture

## Objet

Ce document sépare explicitement :

1. la preuve technique automatisée et la preuve de déploiement Production ;
2. les scénarios nécessitant une session utilisateur réelle et une acceptance propriétaire authentifiée ;
3. la décision commerciale éventuelle de promouvoir une couverture globale.

Aucune de ces trois catégories ne doit être confondue avec les autres.

## Release technique certifiée

- Programme : Shop 2.0 — Itération 4/4.
- SHA de certification pré-merge : `eccb153b6457fad9c4f1c93fd3473e048aa2dc1d`.
- SHA `main` déployé : `58e44b70b7cc77dfeb1d654f53f9e401b33391d7`.
- Release : `prod-20260809-0248-58e44b7`.
- Vercel deployment : `dpl_8ZvT6Bu7jXagsBv8KWtJZRT3SdjD` — `READY`, cible `production`.
- GitHub Deployment Production : success selon les preuves de l’issue #126.
- Migrations Production Itération 4 :
  - `20260808220000_shop2_offline_omnichannel_foundations` ;
  - `20260808233000_shop2_omnichannel_order_context`.

## Gates automatisés convergents sur le SHA de certification

Les preuves enregistrées pour l’Itération 4 indiquent les gates suivants verts sur le même SHA :

- Shop 2 commercial UI ;
- Shop 2 global readiness ;
- Shop 2 behavioral gates ;
- Quality gates ;
- migrations depuis base vide ;
- Prisma generate ;
- type-check ;
- lint ;
- build Production ;
- QA Retail/Shop ;
- QA sector onboarding ;
- i18n FR/EN et guides ;
- scénarios offline/replay ;
- stock multi-store/réservations ;
- omnicanal/order fulfillment ;
- isolation tenant et contrôles de concurrence prévus par les scénarios.

## Vérification Vercel Production

Le déploiement Vercel correspondant au SHA `58e44b70b7cc77dfeb1d654f53f9e401b33391d7` est `READY` et cible bien `production`.

Cette preuve confirme la livraison du code certifié ; elle ne remplace pas une validation métier humaine des parcours Shop avec une session propriétaire réelle.

## Acceptance propriétaire authentifiée — scénarios à rejouer avant toute promotion commerciale supplémentaire

Les scénarios ci-dessous doivent être exécutés sur un tenant réel avec une session propriétaire/administrateur autorisée lorsque DTSC souhaite utiliser cette acceptance comme preuve d’une nouvelle promotion commerciale :

### A. Offline → reconnexion → replay

- préparer un snapshot Shop valide ;
- couper le réseau ;
- enregistrer une vente cash autorisée ;
- vérifier l’état `PENDING_SYNC` ;
- rétablir le réseau ;
- rejouer ;
- vérifier `SYNCED` ;
- vérifier absence de double vente, double stock et double posting ;
- provoquer un conflit prix/stock et vérifier qu’il reste `CONFLICT`, jamais forcé.

### B. Multi-store

- consulter disponibilité magasin local et distant ;
- créer une réservation ;
- tester la concurrence sur le dernier stock ;
- vérifier libération/expiration ;
- vérifier refus d’un dépôt hors tenant.

### C. Retour / remboursement

- vendre plusieurs unités ;
- demander un retour partiel ;
- vérifier interdiction d’auto-validation ;
- approuver avec un second rôle autorisé ;
- vérifier remboursement, stock et écritures Finance inverses.

### D. Clôture de caisse

- ouvrir une session ;
- réaliser ventes/encaissements ;
- clôturer ;
- vérifier écarts, justification et validation indépendante ;
- vérifier séparation par devise.

### E. Fidélité et stored value

- sélectionner un client CRM canonique ;
- gagner/utiliser des points ;
- vérifier concurrence et idempotence ;
- utiliser gift card/avoir ;
- vérifier anti-double-spend ;
- vérifier contrepassation lors d’un retour.

### F. Mobile Money / Télécom

- vérifier le mode `MANUAL` lorsqu’aucun provider connecté n’existe ;
- avec provider réellement configuré, vérifier `PENDING_PROVIDER`, confirmation, échec/unknown et réconciliation ;
- vérifier qu’aucun effet cash/float n’est matérialisé avant confirmation provider.

## Statut de clôture

- Programme technique Shop 2.0 : `COMPLETE`.
- Shop commercial actuel : `COMMERCIAL_READY`.
- Matrice pays officielle : `docs/SHOP_2_0_COUNTRY_SUPPORT_MATRIX.md`.
- Promotion `COMMERCIAL_READY_GLOBAL` : non automatique et non déduite du seul statut `COMPLETE`.

## Règle de preuve

Une future promotion commerciale doit référencer :

- le SHA Production exact ;
- les gates CI correspondants ;
- la matrice pays ;
- les capacités réellement revendiquées ;
- l’acceptance propriétaire authentifiée correspondante lorsqu’elle est utilisée comme critère ;
- les limites restantes et le rollback.
