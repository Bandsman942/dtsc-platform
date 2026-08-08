# Shop 2.0 — Itération 3 — Architecture client, fidélité, paiements et périphériques

## Statut

Cette documentation décrit l’architecture de l’Itération 3 du programme Shop 2.0. Pendant le développement, `COMMERCE_RETAIL` reste `COMMERCIAL_READY` et le programme reste `ITERATION_3_IN_PROGRESS`. Le statut global n’est promu qu’après les preuves de l’Itération 4.

## Principes d’architecture

1. **Le CRM commun reste source de vérité client.** `EnterpriseBusinessParty` n’est pas dupliqué. `EnterpriseRetailCustomerProfile` ne contient que les attributs Retail : numéro client, segment, price list, locale/devise préférées et notes Retail.
2. **Les soldes sont des ledgers, jamais des champs navigateur.** Fidélité et valeur stockée utilisent des écritures idempotentes, verrouillage SQL `FOR UPDATE` et transactions `Serializable`.
3. **Un secret porteur n’est jamais stocké en clair.** Une carte-cadeau/avoir est retrouvée par `lookupHash`; le code complet n’est retourné qu’à l’émission.
4. **Les providers sont abstraits.** `RetailPaymentProviderAdapter` sépare DTSC de tout PSP, opérateur Mobile Money ou Telco concret. Une intégration conserve uniquement des références de credentials/secrets.
5. **CONNECTED n’est pas MANUAL.** En mode connecté, le navigateur ne peut pas déclarer une opération opérateur réussie. Les états sont `INITIATED`, `PENDING_PROVIDER`, `CONFIRMED`, `FAILED`, `UNKNOWN`, `RECONCILED`.
6. **Aucun effet financier avant confirmation provider.** Mobile Money/Telco connecté crée d’abord une `EnterpriseRetailProviderOperation` avec payload serveur sûr. La transaction métier et les effets cash/float sont matérialisés seulement après `CONFIRMED`.
7. **Callbacks idempotents.** Un webhook est dédupliqué par `(organizationId, providerId, externalEventId)`. Une confirmation répétée ne duplique pas la transaction métier grâce aux clés d’idempotence du domaine final.
8. **Les périphériques sont optionnels.** Un POS reste utilisable si WebUSB, WebBluetooth ou WebSerial sont absents. Les profils de device déclarent leur mode de connexion et l’UI expose un état disponible/dégradé.
9. **Le reçu protège la vie privée.** Le reçu JSON/HTML n’inclut jamais de credential provider. Email/téléphone client ne sont exposés que si un lien d’identité actif `RETAIL_RECEIPT_CONTACT` existe.

## Modèles ajoutés

- `EnterpriseRetailCustomerProfile`
- `EnterpriseRetailLoyaltyProgram`
- `EnterpriseRetailLoyaltyAccount`
- `EnterpriseRetailLoyaltyEntry`
- `EnterpriseRetailStoredValueAccount`
- `EnterpriseRetailStoredValueEntry`
- `EnterpriseRetailProviderIntegration`
- `EnterpriseRetailProviderOperation`
- `EnterpriseRetailPaymentTransaction`
- `EnterpriseRetailWebhookEvent`
- `EnterpriseRetailDeviceProfile`

Toutes les clés métier sensibles sont tenant-scoped par `organizationId`.

## Clienteling Retail

Le POS recherche les clients via l’API Retail, laquelle lit le CRM canonique. Le contexte client actif est stocké dans un cookie HttpOnly tenant-scoped et est revalidé côté serveur lors de la vente. Une vente sans client reste une vente de passage.

L’endpoint de détail client expose achats, retours, fidélité et comptes de valeur stockée pour le même `businessPartyId`.

## Fidélité

Un programme définit : devise, points gagnés par unité monétaire, valeur d’un point, minimum de redemption et paramètres complémentaires.

- `EARN` : gain de points ;
- `REDEEM` : dépense ;
- `REVERSAL` : contrepassation, notamment lors d’un retour ;
- `EXPIRY` / `ADJUSTMENT` : opérations contrôlées.

Le gain automatique est volontairement opt-in : programme `ACTIVE` + `settingsJson.autoEarn=true`.

## Gift card et avoir magasin

Les comptes `GIFT_CARD` et `STORE_CREDIT` disposent de leur propre devise, expiration, statut, solde et ledger. L’émission, la redemption et le remboursement sont idempotents. Deux redemptions concurrentes ne doivent jamais dépasser le solde disponible.

## Paiements provider-neutral

`EnterpriseRetailPaymentTransaction` sépare la transaction de paiement du tender POS historique et permet l’intégration future de PSP/terminaux.

États :

`INITIATED → AUTHORIZED/CAPTURED/FAILED/VOIDED → REFUNDED`.

Une transition invalide ou une révision obsolète est refusée.

## Mobile Money / Telco asynchrones

### MANUAL

Le chemin historique reste explicite : l’agent confirme une opération réellement exécutée sur le canal externe, puis DTSC enregistre l’effet métier.

### CONNECTED

1. DTSC crée une `EnterpriseRetailProviderOperation` idempotente.
2. L’adaptateur reçoit une intention sans secret brut.
3. L’état peut devenir `PENDING_PROVIDER`, `CONFIRMED`, `FAILED` ou `UNKNOWN`.
4. Un webhook signé ou une reconciliation autorisée peut faire évoluer l’état.
5. La transaction `EnterpriseMobileMoneyTransaction` / `EnterpriseTelcoTopup` et Finance ne sont créés qu’après `CONFIRMED`.
6. En timeout sans réponse fiable, l’état devient `UNKNOWN`, jamais succès implicite.

## Reconciliation

L’endpoint de rapprochement est réservé à `enterprise.retail.providers.reconcile`. Il peut cibler une opération précise ou les opérations échues. `retryCount`, `nextRetryAt`, `timeoutAt` et les erreurs provider sont conservés.

## Reçus

`GET /api/enterprise/:organizationId/retail/sales/:saleId/receipt`

- défaut : JSON structuré ;
- `?format=html` : reçu imprimable ;
- `?lang=fr|en` : langue explicite.

Le reçu contient ticket, lignes, totaux, tenders, promotions/coupons, fidélité, cartes-cadeaux/avoirs et retours. Il ne contient jamais de credential provider.

## Périphériques POS

Types : scanner code-barres, imprimante reçu, tiroir-caisse, terminal de paiement, afficheur client, balance.

Modes : navigateur, WebUSB, WebBluetooth, WebSerial, réseau, pont natif, manuel.

L’interface détecte les APIs navigateur disponibles. Une API absente produit un état dégradé et non un blocage de caisse.

## Sécurité

Chaîne obligatoire : session → organisation active → membership → module → permission → same-origin pour mutation → Zod → rate limit → transaction → logs/audit.

Le rôle global n’est jamais un passe-droit vers les données privées d’un autre tenant.

## Rollback

Les migrations sont additives. Un rollback applicatif n’efface pas les ledgers ni transactions déjà confirmés. Toute correction financière ou de valeur stockée doit utiliser une opération métier inverse.
