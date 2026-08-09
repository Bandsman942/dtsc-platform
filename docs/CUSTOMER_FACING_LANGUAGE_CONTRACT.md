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
- codes tels que `PENDING_PROVIDER`, `PENDING_SYNC`, `UNKNOWN`, `ACTIVE_CORE`, `TENANT_CONFIGURATION_REQUIRED` sans traduction métier ;
- noms d’entités comme `EnterpriseBusinessParty`, `EnterpriseInventoryReservation` ou équivalent.

## 4. Vocabulaire Retail recommandé

| Interne / technique | Formulation cliente FR | Formulation cliente EN |
|---|---|---|
| Offline engine | Vente hors connexion | Offline sales |
| Snapshot offline | Préparation des ventes hors connexion | Offline sales preparation |
| PENDING_SYNC | À synchroniser | Waiting to sync |
| SYNCED | Synchronisée | Synced |
| CONFLICT / REJECTED | À vérifier | Needs review |
| PENDING_PROVIDER | Paiement en attente de confirmation | Payment awaiting confirmation |
| UNKNOWN provider state | Confirmation en cours | Confirmation in progress |
| Country pack | Configuration pays | Country configuration |
| Readiness | Mise en service / préparation | Setup / readiness |
| Omnichannel orchestration | Commandes, retraits et livraisons | Orders, pickup and delivery |
| Fulfillment | Retrait / livraison / remise | Pickup / delivery / fulfillment |
| Canonical CRM customer | Client | Customer |
| Server repricing | Prix vérifié automatiquement | Price checked automatically |
| Inventory reservation | Stock réservé | Reserved stock |
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

## 7. Fallback obligatoire

Lorsqu’un code n’a pas encore de traduction dédiée, utiliser un message humain générique plutôt que le code brut.

FR : `Cette action n’a pas pu être terminée. Vérifiez les informations puis réessayez.`

EN : `This action could not be completed. Check the information and try again.`

## 8. Internationalisation

Toute nouvelle formulation cliente doit être disponible au minimum en français et en anglais.

Les traductions doivent être naturelles et orientées métier, pas une traduction littérale de l’architecture interne.

## 9. Responsabilité produit

Une fonctionnalité ne doit pas être présentée comme certifiée, conforme ou connectée si la preuve correspondante n’existe pas.

Le langage commercial doit être convaincant sans surpromettre : il décrit ce que le produit permet réellement dans le contexte du client.

## 10. Contrôle CI/CD

Les gates Retail doivent vérifier progressivement :

- l’utilisation du mapping de messages client sur les surfaces Retail critiques ;
- l’absence d’enums bruts connus dans les textes visibles ;
- l’absence de jargon technique interdit dans les copies clientes ;
- la présence des traductions FR/EN ;
- une allowlist explicite pour les outils internes où le détail technique est nécessaire.

Ce contrôle ne doit pas être un grep aveugle de tout le code : il doit cibler les chaînes réellement rendues dans les surfaces clientes et les contrats de mapping.
