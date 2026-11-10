# Hotfix #1101 — consolidation du POS RETAIL / SHOP (quatre lots)

**Candidate 1.8.1 · 10 novembre 2026 · Branche `fix/1101-retail-pos-four-lots` · Aucun déploiement depuis la branche.**

## Contrat fonctionnel et frontières de données

### Lot 1 — Sécurité multi-boutiques (P0)

- Les commandes multicanales sont filtrées en lecture par `sourceSiteId` autorisé, et leur création/annulation exige la permission `PREPARE_INVOICE` pour la boutique source. Les dépôts de préparation et sites de retrait impliqués exigent `VIEW_STOCK` lorsqu'ils diffèrent.
- Les demandes de retour multicanal exigent l'accès à la boutique source ; les décisions et les étapes Finance de remboursement utilisent les restrictions Finance de cette boutique et conservent l'indépendance du validateur.
- Les snapshots et synchronisations hors connexion vérifient **à nouveau** le droit de caisse de la boutique sélectionnée, y compris après révocation d'une affectation. Un identifiant de boutique fourni par le navigateur n'est jamais un droit.
- Le catalogue des périphériques POS contient des informations de configuration internes : son API est réservée à l'administration de l'entreprise. Les postes sans droit reçoivent une erreur au lieu de données globales.

### Lot 2 — Factures, ventes, stocks (P0)

- L'activation `invoiceCheckoutEnabled` impose le circuit **préparer → approuver → émettre → encaisser**. L'ancien moteur de vente directe est fermé aussi bien à l'API historique qu'aux réexécutions hors connexion. Les anciens tickets restent lisibles ; aucune écriture n'est migrée ou dupliquée.
- La génération de nouveaux snapshots de vente hors ligne est explicitement refusée après activation du circuit Finance. **Cette phase n'introduit pas de facturation hors connexion autonome** : la reprise nécessite une connexion et un passage par la facture canonique. Ne jamais réessayer une ancienne file hors connexion sans vérification.
- Une facture `REJECTED` reste non émise ; son créateur peut la soumettre de nouveau avec un validateur désigné. L'administrateur ou le titulaire du droit d'annulation peut aussi l'annuler avec motif : l'annulation libère la promesse de stock puisque le statut final devient `CANCELLED`. Aucune sortie de stock, créance, remboursement ou journal n'est fabriqué à l'annulation.
- Les factures refusées ne sont pas modifiables en place dans ce lot : l'utilisateur peut annuler et recréer une facture corrigée au comptoir si les articles/prix doivent changer. Préserver l'historique d'approbation et les numéros existants.

### Lot 3 — Finance, préparation, pilotage (P1)

- « Suivi des paiements » montre séparément les anciennes transactions de canaux et les `EnterprisePayment` réellement liés à une proposition d'encaissement d'une facture RETAIL, avec pagination, statuts et filtrage serveur par boutique autorisée.
- Le KPI multi-boutiques distingue **ventes directes historiques**, **tickets encaissés historiques**, **factures Finance émises dans la période**, **paiements Finance confirmés et affectés pendant la période**, et **solde actuel des factures**. Les paiements Finance sont agrégés depuis les allocations confirmées non extournées, par date du paiement, méthode et devise. Ces cinq sources ne sont pas additionnées comme un chiffre d'affaires unique.
- Les bornes de dates civiles sont calculées dans le fuseau de l'entreprise pour les comparaisons multi-sites. Export Excel/PDF : colonne « Encaissements Finance de la période » distincte des encaissements POS historiques.
- Le contrôle de mise en service vérifie les affectations actives par boutique pour la consultation, la facturation et la caisse, en plus du drapeau d'isolation et de l'activation du circuit Finance. Le propriétaire seul ne valide pas les prérequis d'une équipe opérationnelle.

### Lot 4 — Expérience administrateur et point de vente (P2)

- Le comptoir se concentre sur le panier et ouvre le registre par lien dédié ; le registre conserve les statuts et les actions de correction/annulation. Tous les libellés modifiés sont bilingues FR/EN.
- L'assistant de création de boutique saisit le code pays ISO 2 et un vrai fuseau IANA, incluant explicitement `Africa/Kinshasa` et `Africa/Lubumbashi`.
- Le panneau Équipements montre chargement, accès refusé/erreur et liste vide ; il ne reste plus blanc lorsqu'aucun appareil n'est déclaré.
- Les suivis de paiement ont des états vides contextualisés et une pagination indépendante pour les flux historiques et Finance.

## Invariants de non-régression

1. Isolation de `organizationId`, puis site, sur chaque lecture et mutation.
2. Les approbateurs Finance ne valident pas leurs propres factures ; le gérant peut émettre **après** approbation, jamais à sa place.
3. Pas de réservation de stock supplémentaire, ni sortie lors de la préparation, ni débit de caisse avant confirmation.
4. Pas de conversion implicite CDF/USD dans les KPI ou exports ; aucun chiffre « bénéfice net certifié » n'est déduit du coût catalogue.
5. Une annulation/reprise utilise la révision et une trace Finance ; aucun effet de caisse, stock ou journal en double.
6. Le mode hors ligne n'est pas présenté comme compatible avec le circuit d'approbation Finance actif.

## Vérification avant mise à disposition

- Contrôles : `git diff --check`, `pnpm prisma:generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:hotfix-1101-retail-pos`, tests antérieurs `qa:hotfix-1080-retail-pos`, `qa:hotfix-1044-retail-activation`, puis `pnpm qa:regression` et build dans l'environnement de CI officiel.
- Aucune migration Prisma, aucun secret/variable d'environnement, aucun changement de politique de déploiement.
- PR sur `main`, Quality Gates / Delivery / Migration CI, revue, puis **E2E final du propriétaire**. Ne fusionner qu'après retour explicite `E2E final #<PR> BON`.

## Recette manuelle ciblée

1. Administrateur : créer les boutiques A (Kinshasa) et B (Lubumbashi), leurs dépôts, comptes de caisse et affectations distinctes.
2. Affecter un facturier et un caissier par boutique ; retirer un accès et vérifier l'absence de vues/écritures croisées, y compris commandes, retours et snapshots hors connexion.
3. Activer isolation puis facturation Finance avec MFA après les prérequis. Vérifier que l'ancien endpoint des ventes directes et les tentatives hors connexion refusent la comptabilisation.
4. Préparer une facture A ; refuser par le validateur désigné ; resoumettre avec la même facture ou annuler avec motif ; constater la libération du stock uniquement à l'annulation. Refaire une facture, l'approuver, l'émettre, payer partiellement puis totalement.
5. Contrôler une seule créance et les mêmes paiements dans Finance et « Suivi des paiements ». Vérifier stock, caisse, trésorerie et écritures à chaque transition, sans doublon ; contrôler une nouvelle tentative idempotente.
6. Comparer A/B et CDF/USD, dates exactes au fuseau de l'entreprise, KPI et exports Excel/PDF ; confronter les règlements de la période aux allocations Finance confirmées.
7. Tester desktop/mobile, FR/EN, registre depuis le comptoir, refus/réessai, panneau équipements vide et pagination.

## Issues connexes

- `#1101` : ticket de cette livraison, à fermer **uniquement après E2E BON et fusion**.
- `#918` : politique de tarification POS/multicanal à vérifier sur tous les cas promotionnels ; périmètre plus large.
- `#377` : convergence financière de l'ensemble des secteurs ; périmètre plus large.
- `#521` : certification historique, remboursements complexes et autres écarts Finance ; périmètre plus large.
- `#939` : harmonisation complète des interfaces sectorielles ; périmètre plus large.

Les issues transversales ne sont pas clôturées au titre de ce hotfix sans preuve que **tous** leurs critères sont satisfaits.
