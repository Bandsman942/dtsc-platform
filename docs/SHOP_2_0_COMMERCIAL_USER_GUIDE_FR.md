# Guide utilisateur — Shop 2.0 — Tarification, promotions et retours

## À qui s’adresse ce guide ?

Ce guide concerne les utilisateurs d’une entreprise `COMMERCE_RETAIL` disposant du module `RETAIL_POS`.

Selon votre poste, vous pouvez :

- consulter les prix et ventes ;
- administrer les règles de tarification ;
- administrer les promotions ;
- demander un retour ;
- valider ou refuser un remboursement.

Les boutons visibles dépendent de vos permissions, mais le serveur revérifie toujours l’autorisation avant toute modification.

## Ouvrir le contrôle commercial

Depuis **Mise en service du Shop**, ouvrez :

**Tarification, promotions et retours Shop 2**

ou accédez à :

`RETAIL_POS > Contrôle commercial`

L’espace contient trois onglets :

1. **Tarification** ;
2. **Promotions** ;
3. **Retours & échanges**.

---

## 1. Tarification

### Principe

Le prix de base d’un produit est créé dans le **Catalogue**. Le contrôle commercial ne crée pas un second catalogue de prix : il définit dans quel contexte un prix canonique doit être retenu par la caisse.

### Ajouter une règle

1. Ouvrez **Tarification**.
2. Choisissez un prix de vente canonique.
3. Indiquez si nécessaire :
   - quantité minimale ;
   - quantité maximale ;
   - canal ;
   - priorité.
4. Enregistrez.

Le moteur de la caisse résout ensuite automatiquement le prix applicable.

### Prix TTC

Si le prix du Catalogue est marqué **taxes incluses**, la caisse conserve ce prix comme montant client TTC et calcule correctement la part hors taxe et la taxe. La taxe n’est pas ajoutée une deuxième fois.

### Dérogations

Une modification manuelle du prix, de la remise ou de la taxe est une dérogation métier.

Elle exige :

- la permission correspondante ;
- un motif explicite ;
- un audit.

Sans motif de dérogation, la décision serveur remplace les anciennes valeurs éventuellement envoyées par le navigateur.

---

## 2. Promotions

### Créer une promotion

Ouvrez **Promotions**, puis renseignez :

- code ;
- nom français ;
- nom anglais ;
- type ;
- produit(s) ciblé(s) ;
- période ;
- coupon éventuel ;
- paramètres de la remise.

Types disponibles :

- pourcentage ;
- montant fixe ;
- palier de quantité ;
- Buy X Get Y ;
- bundle.

### Exemple — remise 10 %

Pour appliquer une remise de 10 % à un produit :

1. Type : **Pourcentage**.
2. Produit ciblé : sélectionner le produit.
3. Pourcentage : `10`.
4. Début : choisir la date d’activation.
5. Enregistrer.

La caisse applique la promotion côté serveur. Un simple changement du total dans le navigateur ne modifie pas la règle commerciale.

### Utilisation

La liste des promotions affiche leur état et leur nombre d’utilisations. Les redemptions sont idempotentes : un retry du même ticket ne consomme pas deux fois la promotion.

---

## 3. Demander un retour partiel

Ouvrez **Retours & échanges**.

### Étapes

1. Sélectionnez la vente d’origine.
2. Sélectionnez la ligne du ticket.
3. Saisissez la quantité à retourner.
4. Choisissez l’état du produit.
5. Choisissez le traitement du stock.
6. Choisissez le mode de remboursement.
7. Ajoutez le motif.
8. Soumettez.

La demande passe à **En attente de validation**.

### Quantité retournable

Le système tient compte :

- de la quantité initialement vendue ;
- des retours déjà terminés ;
- des demandes déjà en attente.

Il refuse donc un double retour de la même unité.

### État du produit

Choix possibles :

- vendable ;
- ouvert ;
- endommagé ;
- défectueux ;
- expiré ;
- autre.

### Traitement du stock

- **Réintégrer** : remet la quantité disponible en stock et inverse la valorisation correspondante ;
- **Rebut** : ne remet pas le produit en stock vendable ;
- **Sans effet stock** : à utiliser pour les cas non stockés ou explicitement autorisés.

---

## 4. Échange

Un échange est un retour lié à une vraie vente de remplacement.

1. Choisissez **Échange**.
2. Sélectionnez la vente d’origine.
3. Sélectionnez la vente de remplacement.
4. Complétez les lignes retournées.
5. Soumettez la demande.

La vente de remplacement doit appartenir à la même entreprise et utiliser la même devise.

---

## 5. Valider un retour

La validation est indépendante de la demande.

Le demandeur ne peut pas approuver son propre remboursement.

Un utilisateur autorisé ouvre la file **En attente de validation** puis :

- **Valider & rembourser** ; ou
- saisit un motif de refus puis **Refuser**.

En cas de validation, DTSC Platform :

1. applique le mouvement de stock prévu ;
2. effectue le remboursement sur le compte autorisé ;
3. crée les traces de trésorerie ;
4. comptabilise le retour ;
5. inverse COGS/Inventory pour les quantités réintégrées ;
6. conserve l’historique.

---

## 6. Modes de remboursement

Disponibles dans cette itération :

- moyens de paiement du ticket d’origine ;
- cash ;
- Mobile Money ;
- virement bancaire ;
- carte via le compte bancaire/clearing autorisé.

Un remboursement cash exige une session de caisse ouverte pour l’utilisateur qui exécute le remboursement.

### Pourquoi « avoir magasin » n’est-il pas encore disponible ?

Un avoir ne peut pas être un simple libellé. Il doit disposer d’un vrai solde dépensable, d’une expiration, d’une protection contre le double usage et d’un historique financier. Cette capacité est prévue dans Shop 2.0 Itération 3.

---

## 7. Erreurs fréquentes

### « Aucun prix applicable »

Vérifiez le prix de vente actif dans Catalogue, sa devise et ses dates d’effet.

### « Configuration fiscale requise »

Le produit taxable doit avoir un code fiscal commun et un taux actif à la date de vente.

### « Quantité de retour dépassée »

Une partie de la ligne a déjà été retournée ou est réservée dans une demande en attente.

### « Auto-validation interdite »

Demandez à un autre responsable disposant de la permission remboursement de valider le retour.

### « Compte de remboursement invalide »

Vérifiez le type du compte, sa devise, son statut et le solde disponible.

---

## 8. Ce que cette version ne fait pas encore

Les capacités suivantes appartiennent aux prochaines itérations :

- fidélité et points ;
- coupons avancés liés au profil client ;
- cartes-cadeaux ;
- avoirs magasin ;
- PSP et webhooks asynchrones ;
- périphériques POS ;
- opérateurs Mobile Money/Télécom connectés ;
- mode offline ;
- omnicanal ;
- multi-store avancé ;
- country packs.
