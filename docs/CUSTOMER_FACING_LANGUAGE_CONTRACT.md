# DTSC Platform — Contrat de langage visible par les clients

## 1. Objectif

Toute information affichée à une entreprise cliente doit être formulée dans le langage du métier, de l’action et de la valeur obtenue.

L’interface cliente ne doit pas exposer l’architecture interne de DTSC Platform lorsque cette information n’aide pas l’utilisateur à décider ou agir.

Ce contrat s’applique en priorité au secteur Retail / Shop et devient la référence pour les autres surfaces clientes.

## 2. Principe directeur

Un message client doit répondre, autant que possible, à trois questions :

1. Qu’est-ce qui se passe ?
2. Quel est l’impact pour mon activité ?
3. Que dois-je faire ensuite ?

Les détails de diagnostic restent disponibles dans les logs, les audits et les outils internes DTSC, pas dans le texte principal montré au client.

## 3. Termes interdits dans les surfaces clientes

Sauf nécessité métier explicite, ne pas afficher directement :

- noms de modèles Prisma, tables ou classes internes ;
- routes API ;
- stack traces ;
- codes HTTP comme explication principale ;
- erreurs provider brutes ;
- enums techniques avec underscores ;
- identifiants internes sans valeur métier ;
- `tenant`, `canonical`, `idempotency`, `webhook`, `adapter`, `payload`, `snapshot`, `server reconciliation`, `posting` ;
- codes tels que `PENDING_PROVIDER`, `PENDING_SYNC`, `UNKNOWN`, `ACTIVE_CORE`, `TENANT_CONFIGURATION_REQUIRED`, `PERCENTAGE`, `STACKABLE`, `SELLABLE`, `RESTOCK` ou `ORIGINAL_TENDER` sans traduction métier ;
- noms d’entités comme `EnterpriseBusinessParty`, `EnterpriseInventoryReservation` ou équivalent.

Les codes restent autorisés comme **valeurs internes** de formulaires, payloads, logs, audits et tests lorsqu’ils ne sont pas rendus comme texte client.

## 4. Vocabulaire Retail recommandé

| Interne / technique | Formulation cliente FR | Formulation cliente EN |
|---|---|---|
| Offline engine | Vente hors connexion | Offline sales |
| Snapshot offline | Préparation des ventes hors connexion | Offline sales preparation |
| PENDING_SYNC | À synchroniser | Waiting to sync |
| SYNCED | Synchronisée | Synced |
| CONFLICT | À vérifier | Needs review |
| PENDING_PROVIDER | Paiement en attente de confirmation | Payment awaiting confirmation |
| UNKNOWN provider state | Confirmation en cours | Confirmation in progress |
| Country pack | Configuration pays | Country configuration |
| Readiness | Mise en service / préparation | Setup / readiness |
| Omnichannel orchestration | Commandes, retraits et livraisons | Orders, pickup and delivery |
| Fulfillment | Retrait / livraison / remise | Pickup / delivery / fulfillment |
| Canonical CRM customer | Client | Customer |
| Server repricing | Prix vérifié automatiquement | Price checked automatically |
| Inventory reservation | Stock réservé | Reserved stock |
| PERCENTAGE | Remise en pourcentage | Percentage discount |
| FIXED_AMOUNT | Remise d’un montant fixe | Fixed amount discount |
| QUANTITY_BREAK | Prix selon la quantité | Quantity-based price |
| BUY_X_GET_Y | Articles achetés + articles offerts | Buy items + get items free |
| BUNDLE | Offre groupée | Bundle offer |
| EXCLUSIVE | Non cumulable | Not combinable |
| STACKABLE | Cumulable | Combinable |
| POS channel | Vente en caisse | Checkout sale |
| RETURN | Retour | Return |
| EXCHANGE | Échange | Exchange |
| SELLABLE | Revendable | Resellable |
| RESTOCK | Remettre en stock | Return to stock |
| SCRAP | Sortir du stock / rebut | Remove from stock / scrap |
| NO_STOCK | Aucun mouvement de stock | No stock movement |
| ORIGINAL_TENDER | Moyen de paiement d’origine | Original payment method |
| STORE_CREDIT | Avoir client | Store credit |
| Posting | Comptabilisation | Accounting entry / posting only when needed |
| Reconciliation | Vérification / rapprochement | Verification / reconciliation only when understood by the role |

## 5. Structure des messages

Pour les erreurs et avertissements, préférer :

- un titre métier court ;
- une explication compréhensible ;
- une action corrective quand elle existe ;
- un niveau visuel cohérent : information, succès, attention ou erreur.

Exemple :

**Paiement en attente de confirmation**

La confirmation de l’opérateur n’est pas encore arrivée. La vente ne sera finalisée qu’après confirmation.

Plutôt que :

`PENDING_PROVIDER / reconciliation required`.

## 6. Séparation entre diagnostic et message client

Le backend peut conserver des reason codes stables et techniques.

Le frontend doit convertir ces codes en messages localisés avant affichage. Le code technique peut être conservé pour :

- ApiLog ;
- AuditLog ;
- observabilité ;
- support DTSC ;
- Console interne ;
- tests automatisés.

Il ne doit pas être injecté tel quel dans un toast, une alerte ou une carte cliente.

Une erreur backend déjà formulée pour un humain peut être conservée lorsqu’elle ne contient aucun détail d’implémentation. Une erreur technique inconnue doit obligatoirement passer par le fallback client.

## 7. Fallback obligatoire

Lorsqu’un code n’a pas encore de traduction dédiée, utiliser un message humain générique plutôt que le code brut.

FR : `Cette action n’a pas pu être terminée. Vérifiez les informations puis réessayez.`

EN : `This action could not be completed. Check the information and try again.`

## 8. Internationalisation

Toute nouvelle formulation cliente doit être disponible au minimum en français et en anglais.

Les traductions doivent être naturelles et orientées métier, pas une traduction littérale de l’architecture interne.

Une valeur d’enum peut rester identique dans le payload technique, mais chaque option rendue dans un sélecteur, badge, liste, tableau ou carte doit utiliser le mapping localisé.

## 9. Liens vers les sources de vérité

Lorsqu’une information est administrée dans un autre module ERP, le texte client ne doit pas expliquer la propriété technique de l’entité. L’interface doit plutôt proposer un lien métier vers l’espace où l’utilisateur peut agir.

Exemples Retail :

- prix produit → Catalogue ;
- compte de remboursement → Trésorerie ;
- stock disponible → Stock & logistique ;
- client → Clients / CRM lorsque la gestion détaillée est nécessaire.

Ces liens ne créent aucun second CRUD et ne changent pas la source de vérité.

## 10. Responsabilité produit

Une fonctionnalité ne doit pas être présentée comme certifiée, conforme ou connectée si la preuve correspondante n’existe pas.

Le langage commercial doit être convaincant sans surpromettre : il décrit ce que le produit permet réellement dans le contexte du client.

## 11. Contrôle CI/CD

Les gates Retail doivent vérifier progressivement :

- l’utilisation du mapping de messages client sur les surfaces Retail critiques ;
- l’absence d’enums bruts connus dans les textes visibles ;
- l’absence de jargon technique interdit dans les copies clientes ;
- la présence des traductions FR/EN ;
- les liens métier vers les sources ERP lorsqu’une action appartient à un autre module ;
- une allowlist explicite pour les outils internes où le détail technique est nécessaire.

Ce contrôle ne doit pas être un grep aveugle de tout le code : il doit cibler les chaînes réellement rendues dans les surfaces clientes et les contrats de mapping.
