# Guide utilisateur — Shop 2.0 — Client, fidélité, paiements et périphériques

## Public concerné

Ce guide concerne les utilisateurs `COMMERCE_RETAIL` disposant de `RETAIL_POS` et, selon l’offre, des extensions Mobile Money/Télécom.

Les actions visibles dépendent du poste et des permissions. Le serveur revérifie toujours les autorisations avant toute mutation.

## 1. Reconnaître un client au POS

Dans le bandeau client de la caisse :

1. recherchez par nom, code, email ou téléphone ;
2. sélectionnez le client ;
3. vérifiez le profil Retail si nécessaire ;
4. construisez le panier puis encaissez.

Le client provient du CRM commun. DTSC ne crée pas un second fichier clients Retail.

Une vente peut rester **vente de passage** sans client sélectionné.

La création rapide n’est proposée qu’aux utilisateurs disposant réellement du droit CRM d’écriture.

## 2. Consulter l’historique client

L’historique Retail consolide :

- achats récents ;
- retours ;
- totaux par devise ;
- comptes fidélité ;
- cartes-cadeaux et avoirs liés au client.

Les devises ne sont jamais additionnées arbitrairement entre elles.

## 3. Fidélité

Un programme de fidélité peut définir :

- points gagnés par unité monétaire ;
- valeur d’un point ;
- minimum de points à dépenser ;
- période d’activité ;
- tiers éventuel ;
- paramètres supplémentaires.

Le gain automatique ne s’applique que si le programme est **ACTIVE** et que `autoEarn` est explicitement activé.

Lors d’une redemption, DTSC verrouille le compte et refuse :

- un solde insuffisant ;
- une clé d’idempotence déjà utilisée pour une autre opération ;
- une incohérence de client/programme.

Un retour validé peut contrepasser les points gagnés sur la vente correspondante.

## 4. Cartes-cadeaux et avoirs

Deux types existent :

- `GIFT_CARD` ;
- `STORE_CREDIT`.

À l’émission, conservez le code remis au client. DTSC ne stocke pas ce code en clair : seul un hash de recherche est conservé.

La redemption et le remboursement sont transactionnels. Deux demandes concurrentes ne peuvent pas consommer deux fois le même solde.

Vérifiez toujours la devise et la date d’expiration.

## 5. Paiements provider-neutral

Les transactions de paiement suivent des états explicites :

`INITIATED → AUTHORIZED/CAPTURED/FAILED/VOIDED → REFUNDED`.

Une transition impossible est refusée.

Les intégrations externes ne stockent jamais de secret brut dans la base : seulement des références de credential et de secret webhook.

## 6. Mobile Money / Télécom : MANUAL et CONNECTED

### MANUAL

Utilisez ce mode lorsqu’aucun adaptateur partenaire réel n’est connecté. Exécutez réellement l’opération chez le fournisseur puis enregistrez-la dans DTSC selon la procédure de contrôle.

### CONNECTED

DTSC initie l’opération via un adaptateur réel. Les statuts possibles sont :

- `INITIATED` ;
- `PENDING_PROVIDER` ;
- `CONFIRMED` ;
- `FAILED` ;
- `UNKNOWN` ;
- `RECONCILED`.

**Important :** `UNKNOWN` n’est jamais un succès.

Aucun effet définitif de caisse/float n’est créé avant `CONFIRMED`.

## 7. Webhooks et rapprochement

Les callbacks provider doivent être signés et vérifiés par l’adaptateur. Un même événement reçu plusieurs fois ne doit pas produire plusieurs transactions.

En cas de timeout ou état `UNKNOWN`, un contrôleur autorisé peut lancer le rapprochement. Le système garde le nombre de retries et les erreurs utiles à l’audit.

## 8. Reçu client

Un reçu est disponible après une vente :

- JSON structuré pour intégration/partage ;
- HTML imprimable avec `format=html`.

Il contient :

- numéro/date du ticket ;
- lignes, quantités, prix, remises et taxes ;
- total ;
- moyens de paiement ;
- coupons/promotions ;
- mouvements fidélité ;
- cartes-cadeaux/avoirs utilisés ;
- retours liés.

Email et téléphone du client ne sont affichés que si un consentement actif `RETAIL_RECEIPT_CONTACT` existe dans le domaine d’identité/consentement.

Aucun secret provider n’apparaît sur le reçu.

## 9. Périphériques POS

DTSC peut enregistrer :

- scanner code-barres ;
- imprimante thermique ;
- tiroir-caisse ;
- terminal de paiement ;
- afficheur client ;
- balance.

Modes supportés au niveau de la couche device : navigateur, WebUSB, WebBluetooth, WebSerial, réseau, pont natif ou manuel.

Si une API navigateur n’est pas disponible, la caisse doit rester utilisable et afficher un mode dégradé plutôt que bloquer la vente.

## 10. Contrôles importants

- Ne partagez jamais un code gift card/avoir dans un commentaire ou log public.
- Ne forcez jamais `CONFIRMED` parce qu’un provider répond lentement.
- Ne considérez jamais `UNKNOWN` comme un succès.
- N’utilisez pas un compte financier d’une autre devise.
- Ne contournez pas les permissions par l’interface : le backend reste l’autorité.
- En cas de correction financière, utilisez une opération inverse métier ; ne modifiez pas l’historique confirmé.

## Limites restantes

Shop 2.0 Itération 4 doit encore traiter offline, omnicanal avancé, multi-store global, country packs et certification `COMMERCIAL_READY_GLOBAL`.
