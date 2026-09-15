# Guide utilisateur — Encaissement & clôture Gaming / Gaming checkout & daily close

## Français

### Avant d’encaisser une session

Vérifiez que la session a été tarifée et terminée. Une nouvelle session facturable passe automatiquement à `TO_CHECKOUT`. Une ancienne session `ENDED` contenant encore un `finalAmount` et une devise reste encaissable.

Finance doit être configurée : devise active, comptes financiers actifs, validateur de facture, validateur de paiement et, pour un paiement Cash, session de caisse ouverte selon les règles de l’entreprise.

### Préparer un encaissement

Ouvrez **Encaissement Gaming** puis **Préparer un encaissement**.

1. Choisissez la session à encaisser.
2. Choisissez le validateur de la facture.
3. Ajoutez éventuellement des snacks/accessoires depuis le Catalogue commun.
4. Si un produit est suivi en stock, choisissez l’entrepôt commun demandé.
5. Confirmez.

Le serveur crée une facture client Finance en attente de validation et lie le checkout à cette facture. Rejouer la même commande ne crée pas une deuxième facture.

Le temps de jeu est déjà représenté par le service de la session. Il ne doit jamais être ajouté comme produit physique et ne décrémente aucun stock.

### Client identifié et joueur occasionnel

Pour une session avec client CRM, le checkout conserve le même `EnterpriseBusinessParty`.

Pour une session anonyme, DTSC utilise un tiers système walk-in sans donnée personnelle afin que la facture possède une contrepartie comptable valide. Cela ne crée pas une nouvelle fiche joueur personnelle.

### Snacks et accessoires

Les produits complémentaires proviennent du Catalogue et utilisent leur prix de vente actif dans la devise de la session.

Pour un produit suivi en stock :

- un article Inventory actif doit exister ;
- un entrepôt actif doit être sélectionné ;
- si le poste appartient à un site, l’entrepôt doit correspondre à ce site ;
- le mouvement de stock est enregistré par Inventory commun.

Un produit suivi par lot n’est jamais prélevé automatiquement sur un lot arbitraire. Tant que le checkout ne propose pas un choix explicite du lot, DTSC refuse cette ligne.

### Approuver et émettre la facture

Dans le détail du checkout, utilisez **Approuver et émettre** si vous êtes le validateur Finance affecté et disposez des permissions nécessaires.

La facture passe par le workflow Finance normal. Une fois émise, sa créance devient encaissable.

### Ajouter un paiement

Sur un checkout **À encaisser** ou **Partiellement payé** :

1. choisissez le moyen de paiement ;
2. choisissez un compte financier compatible avec la devise de la facture ;
3. saisissez le montant ;
4. choisissez le validateur du paiement ;
5. ajoutez une référence externe si nécessaire ;
6. confirmez.

Le paiement est créé dans le module Paiements commun et entre dans son workflow d’approbation. Vous pouvez préparer plusieurs paiements pour répartir un total entre Cash, Mobile Money, banque ou autres moyens.

DTSC tient compte des paiements déjà préparés : la somme engagée ne peut pas dépasser la créance restante.

### Approuver un paiement

Le validateur affecté approuve le paiement depuis le détail du checkout. DTSC utilise alors le workflow Finance pour confirmer le paiement et l’allouer à la créance.

Quand la facture est entièrement réglée :

- la facture devient `PAID` ;
- le checkout devient `PAID` ;
- la session Gaming devient `PAID`.

Pour Cash, les règles de caisse Finance restent obligatoires : un compte Cash et une session de caisse ouverte doivent être disponibles.

### Reçu Gaming

Sur un checkout payé, utilisez **Reçu**. Le reçu affiche les références réelles de la session, de la facture et des paiements confirmés. Les montants ne sont pas reconstruits dans une caisse Gaming séparée.

Le reçu permet notamment de retrouver :

- montant et devise de la facture ;
- lignes de service/produits ;
- paiements confirmés ;
- éventuels remboursements et avoirs.

### Annuler avant émission

Un checkout dont la facture n’a pas encore été émise peut être annulé avec un motif. Les approbations en attente sont annulées, la facture est annulée et les produits suivis en stock sont restitués.

Après émission/paiement, n’utilisez plus l’annulation directe : passez par le remboursement.

### Demander un remboursement

Un checkout entièrement payé peut entrer dans le workflow de remboursement.

1. choisissez le moyen et le compte financier de remboursement ;
2. choisissez un validateur Paiements ;
3. saisissez un motif explicite ;
4. confirmez la demande.

Le demandeur ne peut pas approuver lui-même le remboursement.

### Approuver un remboursement

Le validateur autorisé utilise **Approuver le remboursement**. DTSC :

- inverse les allocations de paiement client ;
- crée et comptabilise un avoir à partir des montants historiques de la facture ;
- confirme le paiement sortant de remboursement dans Trésorerie ;
- produit le mouvement Cash inverse si nécessaire ;
- restitue les produits physiques dans Inventory ;
- conserve toutes les traces comptables et d’audit.

### Créer une clôture Gaming

Ouvrez **Clôture Gaming** puis **Nouvelle clôture**.

1. choisissez la journée métier ;
2. choisissez éventuellement le site ;
3. ajoutez une ligne pour chaque compte financier / moyen de paiement à rapprocher ;
4. saisissez le montant déclaré ;
5. expliquez tout écart ;
6. soumettez.

Chaque ligne conserve sa propre devise. Ne combinez pas manuellement CDF et USD dans une même ligne.

### Comment DTSC choisit la journée

Si un site est choisi, DTSC utilise sa timezone. La journée métier correspond à minuit → minuit dans cette timezone, même si les timestamps sont stockés en UTC.

Les statistiques de sessions utilisent la date de fin de session. Les flux financiers utilisent la date réelle du paiement ou du remboursement. Ainsi, un paiement reçu aujourd’hui pour une session terminée hier apparaît dans la clôture financière d’aujourd’hui.

### Comprendre le rapprochement

Pour chaque ligne :

`Attendu = encaissements entrants confirmés − remboursements sortants confirmés`

L’écart est :

`Écart = déclaré − attendu`

Un écart différent de zéro exige un motif. DTSC ne convertit jamais automatiquement les devises pour produire un total global.

### Valider ou rejeter la clôture

Une clôture soumise doit être décidée par une autre personne autorisée. Le soumissionnaire ne peut pas valider sa propre clôture.

Une journée/site ne peut avoir qu’une clôture `SUBMITTED` ou `VALIDATED` active à la fois. Un retry technique ne crée pas une deuxième clôture.

---

## English

### Before checking out a session

Make sure the session was priced and ended. A newly billable session automatically moves to `TO_CHECKOUT`. A historical `ENDED` session with a `finalAmount` and currency remains eligible for checkout.

Finance must be configured with an active currency, active financial accounts, invoice/payment approvers, and — for Cash — an open cash session according to organization policy.

### Prepare checkout

Open **Gaming checkout** and choose **Prepare checkout**.

1. Select the session.
2. Select the invoice approver.
3. Optionally add snacks/accessories from the shared Catalog.
4. For stock-tracked products, select the required shared warehouse.
5. Confirm.

The server creates a shared Finance customer invoice in approval status and links the Gaming checkout to it. Retrying the same command does not create a second invoice.

Gaming time is already represented by the session service. It is never treated as a physical stock item.

### Identified customer and walk-in player

An identified session keeps its existing shared CRM `EnterpriseBusinessParty`.

An anonymous session uses a non-personal system walk-in party solely as the accounting counterparty. No duplicate personal Gaming customer is created.

### Snacks and accessories

Extras come from shared Catalog and use an active sale price in the session currency.

For stock-tracked products, an active Inventory item and warehouse are required. When the station belongs to a site, the warehouse must match that site. Lot-tracked items are never silently assigned to an arbitrary lot; the line is rejected until explicit lot selection is supported.

### Approve and issue the invoice

From checkout details, use **Approve and issue** when you are the assigned Finance approver and have the required permissions. The invoice follows the normal Finance workflow and produces a receivable when issued.

### Add payment

For an **Awaiting payment** or **Partially paid** checkout:

1. choose payment method;
2. choose a financial account compatible with invoice currency;
3. enter amount;
4. select payment approver;
5. optionally enter an external reference;
6. confirm.

Payments are created in shared Payments and follow its approval workflow. Multiple payments can split the same receivable across Cash, Mobile Money, bank, or other methods. Already prepared payments reserve their amount so total committed value cannot exceed the remaining receivable.

### Approve payment

The assigned approver confirms the payment through the checkout detail. DTSC uses shared Finance confirmation and allocation primitives. Once fully settled, invoice, checkout, and Gaming session become `PAID`.

Cash keeps the Finance cash-session rules: an appropriate Cash financial account and open cash session are required.

### Gaming receipt

Use **Receipt** on a paid checkout. The receipt projects the real session, invoice, confirmed allocations/payments, refunds, and credit notes. There is no parallel Gaming cash ledger.

### Cancel before issue

A checkout can be cancelled only before the invoice is issued. Pending approval is cancelled, the invoice is cancelled, and stock-tracked extras are returned through Inventory.

After issue/payment, use the refund workflow instead of direct cancellation.

### Request refund

A fully paid checkout can enter refund approval. Select method, financial account, payment approver, and an explicit reason. The requester cannot approve their own refund.

### Approve refund

The authorized approver triggers the canonical inverse flow: payment allocations are reversed, an exact historical credit note is posted, the outbound refund payment is confirmed in Treasury, Cash is reversed when applicable, physical products are returned to Inventory, and all accounting/audit history remains available.

### Create Gaming daily close

Open **Gaming daily close** and choose **New close**.

1. Select business date.
2. Optionally select site.
3. Add one declaration per financial account/payment method.
4. Enter declared amount.
5. Explain every variance.
6. Submit.

Each line keeps its own currency. Do not combine CDF and USD into one declaration.

### How the business day works

When a site is selected, DTSC uses its timezone. Business day means local midnight to local midnight, even though stored timestamps are UTC.

Session counters use the session end date. Financial flows use the actual payment/refund date. Therefore, a payment received today for a session ended yesterday belongs to today’s financial close.

### Reconciliation formula

For each line:

`Expected = confirmed inbound customer payments − confirmed outbound refunds`

`Difference = declared − expected`

A non-zero difference requires a reason. DTSC never performs implicit FX conversion to create a cross-currency total.

### Validate or reject close

A submitted close must be decided by another authorized user. The submitter cannot validate their own close.

Only one active `SUBMITTED`/`VALIDATED` close can exist for the same organization/site/business day, and retrying does not create duplicates.