# Changelog — Gaming Checkout & Daily Close #644

## Livré

- `GAMING_CHECKOUT` et `GAMING_DAILY_CLOSE` passent en `BETA` avec routes, workspaces et permissions dédiés.
- Une session tarifée terminée possédant un `finalAmount` positif est promue de `ENDED` à `TO_CHECKOUT` par une transition serveur idempotente `READY_TO_CHECKOUT`.
- `EnterpriseGamingCheckout` ne duplique ni facture, ni créance, ni paiement : il relie une session Gaming à une `EnterpriseSalesInvoice` canonique.
- La préparation du checkout est protégée par transaction `Serializable`, verrou advisory, unicité par session et clé d’idempotence afin qu’un retry ne crée jamais une seconde facture.
- Les factures utilisent le workflow d’approbation `FINANCE_RECEIVABLES`, puis l’émission canonique produit la créance.
- Les encaissements utilisent `EnterprisePayment`, les approbations `FINANCE_PAYMENTS`, la confirmation Finance et `EnterprisePaymentAllocation` ; les paiements fractionnés/multiples sont supportés.
- Les paiements déjà préparés sont réservés dans le calcul du solde disponible afin d’empêcher un dépassement de créance en cas de double saisie concurrente.
- Cash, Mobile Money, banque, carte, chèque et autres moyens utilisent les comptes financiers communs et les contrôles de devise/type de compte existants.
- Le reçu Gaming est une projection réconciliée de la session, facture, lignes, allocations, paiements, remboursements et avoirs ; aucun reçu financier parallèle n’est créé.
- Les sessions anonymes utilisent un tiers système `EnterpriseBusinessParty` walk-in sans donnée personnelle ; les clients identifiés restent dans `CRM_CUSTOMERS`.
- Les snacks/accessoires viennent du Catalogue commun. Seuls les produits `trackInventory` génèrent une sortie Inventory `SALE_FULFILLMENT`; le temps de jeu ne décrémente jamais le stock.
- Un entrepôt actif est obligatoire pour les produits suivis, doit respecter le site du poste lorsqu’il est défini et aucun lot n’est choisi automatiquement pour un article `lotTracking`.
- L’annulation avant émission restitue les produits suivis via `CUSTOMER_RETURN` et ne modifie pas silencieusement un mouvement confirmé.
- Le remboursement payé passe par un `EnterprisePayment` sortant `REFUND`, inverse les allocations client, contre-passe les écritures d’allocation, crée un avoir exact depuis les montants historiques de facture, confirme le remboursement dans Trésorerie et restitue les produits physiques.
- Le posting `CUSTOMER_REFUND_CONFIRMED` est enregistré dans le registre comptable ; le chemin Gaming n’écrit pas directement une comptabilité parallèle.
- `EnterpriseGamingDailyClose` / `EnterpriseGamingDailyCloseLine` fournissent un snapshot opérationnel de clôture par site, compte financier, moyen de paiement et devise.
- La journée métier utilise la timezone du site et des bornes UTC correspondant au jour local.
- Les compteurs de sessions utilisent `endedAt`, tandis que les encaissements/remboursements utilisent `paymentDate`. Un paiement tardif d’une session antérieure apparaît donc dans la clôture du jour où le paiement a réellement eu lieu.
- `expectedAmount = inboundAmount - refundAmount` est calculé par ligne et par devise ; aucune conversion FX ni agrégation cross-currency implicite n’est effectuée.
- Un écart non nul exige un motif et le soumissionnaire ne peut pas valider sa propre clôture.
- Des index partiels uniques et un verrou advisory empêchent deux clôtures actives concurrentes pour le même site/jour.
- Les erreurs Checkout/Clôture sont localisées FR/EN et les workspaces utilisent des formulaires/dialogs mobile-safe.
- `qa-644-gaming-checkout-daily-close.mjs` est raccordé à `qa:regression` et protège les invariants Finance, Inventory, idempotence, remboursement et multi-devise.

## Migration

Migration additive :

`prisma/migrations/20260915011000_gaming_checkout_daily_close/migration.sql`

Elle crée uniquement les projections Gaming nécessaires au lien Checkout et au snapshot Daily Close. Les tables Finance, Trésorerie, Caisse, Catalogue et Inventory restent les sources de vérité existantes.

## Non livré dans #644

- tournois et événements Gaming ;
- reporting Gaming avancé ;
- intégration DTSC AI spécifique Gaming ;
- commercial readiness / onboarding final du sous-secteur.

Ces sujets restent dans #645 et #646.

## Compatibilité

Les anciennes sessions `ENDED` tarifées restent encaissables afin de conserver la compatibilité historique. Les factures, paiements, mouvements de trésorerie, avoirs, écritures comptables et mouvements Inventory déjà confirmés ne doivent jamais être supprimés lors d’un rollback du module Gaming.