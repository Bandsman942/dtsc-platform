# Retail coherence tranche 3 — valeur client et suivi des paiements

## Référence

- Programme parent : issue #135.
- Tranche : issue #140.
- Baseline Production : `965eb58703cea99ec7cf07f54afa5c3edec368e3` / `prod-20260809-0630-965eb58`.

## Problème observé

Shop 2.0 disposait déjà des moteurs et données nécessaires pour la fidélité, les cartes-cadeaux/avoirs et les paiements provider-neutral, mais ces informations restaient peu visibles dans le parcours POS client.

L’enjeu de cette tranche n’est pas d’ajouter un nouveau moteur. Il est de rendre les capacités existantes compréhensibles et actionnables sans surcharger l’encaissement ni exposer les détails internes des intégrations de paiement.

## Décision produit

### Client actif

Le bloc `Client au comptoir` reste prioritairement consacré à l’identité du client sélectionné.

Ses avantages sont accessibles dans une divulgation progressive `Fidélité & avoirs client`, repliée par défaut.

Les données proviennent de l’API d’historique client existante et couvrent :

- nombre de ventes et de retours ;
- totaux d’achats par devise ;
- programmes de fidélité et points disponibles ;
- points gagnés et utilisés ;
- cartes-cadeaux et avoirs ;
- solde, devise, statut et échéance utile.

Aucun nouveau CRUD client, programme de fidélité ou compte de valeur stockée n’est créé.

### Suivi des paiements

Un panneau `Suivi des paiements` est ajouté comme outil secondaire du POS.

Il reste replié par défaut et n’est visible que si les permissions existantes autorisent la gestion ou le remboursement des paiements.

La liste affiche uniquement :

- montant ;
- devise ;
- moyen de paiement traduit ;
- état métier traduit ;
- référence client ;
- date de création.

Elle ne charge ni n’affiche `providerId`, `providerReference`, `failureCode`, `failureMessage`, payload fournisseur, credential reference ou secret.

## Langage client

`lib/customer-facing-language.ts` est étendu pour couvrir :

- `GIFT_CARD` → Carte-cadeau / Gift card ;
- `STORE_CREDIT` → Avoir client / Store credit ;
- moyens de paiement `CARD`, `MOBILE_MONEY`, `BANK_TRANSFER`, `OTHER` ;
- états de paiement `INITIATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `VOIDED`, `REFUNDED` ;
- états fidélité/valeur stockée supplémentaires ;
- erreurs de chargement historique client et suivi de paiement.

Les codes restent inchangés dans les contrats backend.

## Sécurité et permissions

Cette tranche ne modifie aucune règle RBAC.

- valeur client : visible uniquement à travers les capacités de lecture client existantes ;
- paiements : liste chargée uniquement si `canManagePayments || canRefundPayments` ;
- aucune donnée provider sensible n’est rendue ;
- isolation `organizationId` inchangée ;
- routes et mutations existantes inchangées.

## Base de données et moteurs

- aucune migration ;
- aucun changement de schéma Prisma ;
- aucune nouvelle table ;
- aucun nouveau ledger ;
- aucune nouvelle transition de paiement ;
- aucun nouvel adaptateur provider ;
- aucune modification des moteurs de fidélité ou valeur stockée.

## QA opposable

`scripts/qa-retail-product-coherence.mjs` bloque :

- l’absence des mappings valeur client/paiement ;
- la disparition de la divulgation progressive ;
- l’absence de permission gates ;
- l’introduction de champs provider sensibles dans la surface de suivi ;
- le rendu d’enums techniques connus ;
- la disparition du rail tactile.

Le Behavioral Gate exécute aussi `tests/e2e/shop2-customer-value-ui.spec.mjs` sur l’application buildée :

1. connexion via l’API d’authentification officielle ;
2. sélection d’un client réel ;
3. création d’un programme et crédit de fidélité ;
4. émission d’une carte-cadeau ;
5. création, confirmation puis remboursement d’un paiement carte ;
6. viewport 390 px ;
7. vérification du rendu `Fidélité & avoirs client` ;
8. vérification du rendu `Suivi des paiements` ;
9. absence d’enums bruts et de labels techniques provider ;
10. absence de débordement horizontal.

## Hors scope confirmé

- émission/rédemption manuelle via une nouvelle interface ;
- configuration provider ;
- Mobile Money Agency ;
- Telco Topups ;
- rapprochement provider avancé ;
- nettoyage complet du monolithe `EnterpriseRetailShopWorkspace`.

Ces sujets restent dans le programme #135 et doivent être traités par tranches séparées afin de préserver la stabilité du Shop commercialisé.
