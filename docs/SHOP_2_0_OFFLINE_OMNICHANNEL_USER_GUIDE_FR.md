# Guide utilisateur Shop 2.0 — Offline, multi-store et omnicanal

## 1. Objectif

Ce guide explique les capacités Shop 2.0 Itération 4 visibles dans le POS : préparation du mode hors ligne, synchronisation, commandes omnicanales, readiness pays et onboarding.

## 2. Préparer le mode hors ligne

Le mode hors ligne doit être préparé **pendant que l’appareil est connecté**.

1. Ouvrez le module `RETAIL_POS`.
2. Vérifiez qu’une session de caisse est ouverte.
3. Dans **Continuité hors ligne contrôlée**, sélectionnez le dépôt à utiliser.
4. Cliquez sur **Préparer offline**.
5. Le serveur calcule les prix/taxes et la disponibilité, puis le navigateur chiffre le snapshot sur l’appareil.

Le snapshot est limité dans le temps. Lorsqu’il expire, reconnectez l’appareil et préparez-en un nouveau.

### Cas où le mode offline est bloqué

Shop désactive volontairement le checkout hors ligne lorsque des promotions ou règles de prix dynamiques sont actives. Cela évite qu’un appareil déconnecté applique une règle commerciale devenue obsolète.

## 3. Faire une vente hors connexion

Une vente hors ligne est un **brouillon local chiffré**, pas une vente comptable définitive.

1. Recherchez les produits dans le catalogue local.
2. Ajoutez les quantités disponibles au panier.
3. Vérifiez le total.
4. Cliquez sur **Chiffrer le brouillon de vente**.

Règles :

- paiement `CASH` uniquement ;
- aucun client CRM sélectionné ;
- aucun coupon ;
- aucune remise/price override manuel ;
- aucune carte, Mobile Money, Telco, gift card ou store credit ;
- le stock serveur et la comptabilité ne changent pas encore.

Le POS diminue localement la disponibilité en tenant compte des brouillons déjà en attente afin de réduire le risque de survente sur le même appareil.

## 4. Synchronisation et conflits

Au retour du réseau, le POS tente de synchroniser automatiquement les brouillons `PENDING_SYNC`. Une synchronisation peut aussi être déclenchée manuellement.

Résultats possibles :

- `SYNCED` : la vente a été revalidée et matérialisée côté serveur ;
- `CONFLICT` : une donnée autoritative a changé (prix, taxe, stock, Finance, période, caisse, etc.) ;
- `REJECTED` : le brouillon ne respecte plus un contrat autorisé ;
- `PENDING_SYNC` : le serveur n’a pas encore confirmé la transaction.

Un conflit ne doit jamais être forcé. Reconnectez-vous, rechargez les données, vérifiez le stock/prix/Finance puis recréez la transaction si nécessaire.

## 5. Commandes omnicanales

Le bloc **Commandes client omnicanales** permet de créer une vraie commande client à partir du POS sans créer un second moteur de commande Retail.

### Modes disponibles

- **Click & Collect** : commande préparée dans un magasin pour retrait ;
- **Retrait autre magasin** : le site de retrait doit être différent du site source ;
- **Ship from store** : le stock d’un magasin alimente l’expédition ;
- **Livraison client** : commande destinée à être livrée au client.

### Procédure

1. Sélectionnez le mode de fulfillment.
2. Sélectionnez le site source.
3. Sélectionnez le dépôt de fulfillment.
4. Pour un retrait, sélectionnez le site de retrait demandé.
5. Recherchez et sélectionnez un client CRM canonique.
6. Recherchez les produits disponibles dans le dépôt.
7. Ajoutez les quantités.
8. Indiquez éventuellement une date de fulfillment attendue.
9. Cliquez sur **Confirmer la commande & réserver le stock**.

Le prix affiché dans la recherche est indicatif. Au moment de la confirmation, le serveur recalcule le prix et les taxes. La commande est enregistrée dans `EnterpriseSalesOrder`, puis Inventory crée les réservations nécessaires.

Si une réservation échoue, Shop ne présente pas la commande comme garantie. Les réservations déjà prises sont compensées et le statut expose l’échec.

## 6. Statut cross-channel

La partie **Statut cross-channel** réunit :

- la référence et le statut de la commande canonique ;
- le mode omnicanal ;
- le statut d’orchestration Retail ;
- le nombre de réservations Inventory ;
- le dernier fulfillment lorsqu’il existe.

Les opérations de fulfillment continuent d’utiliser le domaine commun Sales/Fulfillment.

## 7. Readiness pays et onboarding

Le panneau **Onboarding Shop & readiness pays** aide à sélectionner les ressources réelles du tenant.

Il vérifie :

- country pack ;
- devise fonctionnelle ;
- site ;
- dépôt ;
- compte de caisse ;
- catalogue ;
- liens Inventory ;
- équipe ;
- comptabilité POS ;
- configuration Retail.

Le bouton **Activer uniquement le socle prouvé** active le socle produit d’un country pack. Il ne transforme pas une capacité non certifiée en conformité réglementaire.

L’assistant ne crée pas automatiquement des comptes financiers, soldes, sites, dépôts, taux fiscaux ou documents réglementaires.

## 8. Country pack RDC

Le pack `CD_RETAIL_CORE_V1` fournit actuellement :

- socle Retail Core localisé ;
- CDF/USD dans la logique multi-devise ;
- fiscalité alimentée par le référentiel Finance du tenant ;
- numérotation tenant-configurée ;
- fiscal receipt soumis à preuves ;
- e-invoicing non certifié dans Retail Core.

Cette matrice décrit la capacité produit DTSC ; elle ne constitue pas un avis juridique ou fiscal.

## 9. Bonnes pratiques opérateur

- préparez le snapshot avant une période où la connexion peut être instable ;
- ne partagez pas le même navigateur/profil utilisateur entre caissiers ;
- synchronisez les brouillons dès que le réseau revient ;
- traitez les conflits avant de poursuivre une longue série de ventes ;
- utilisez l’omnicanal uniquement avec un client CRM identifié ;
- vérifiez les réservations et le fulfillment avant de promettre un retrait/livraison au client ;
- gardez les paiements provider en ligne.

## 10. Limites volontaires

L’Itération 4 ne prétend pas :

- rendre les paiements provider offline ;
- garantir un stock distant sans revalidation serveur ;
- certifier automatiquement une obligation fiscale pays ;
- créer automatiquement des ressources financières ou réglementaires manquantes ;
- faire du navigateur une seconde source de vérité métier.
