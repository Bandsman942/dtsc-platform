# Hotfix #756 — Financements canoniques, trésorerie et intégrité du chiffre d’affaires

Baseline : `main@036f550c1c9c470e335aa02b558b3be97d602def`.

## Problème

Un compte financier commun créé avec un solde initial à zéro ne disposait d’aucun workflow canonique pour recevoir ensuite un financement externe. Utiliser une vente, un paiement client, le fonds d’ouverture d’une session de caisse ou une modification du solde d’ouverture aurait mélangé des réalités économiques différentes.

## Contrat métier

`EnterpriseFundingOperation` devient l’unique source commune des financements externes suivants :

- `CAPITAL_CONTRIBUTION` — apport en capital ;
- `SHAREHOLDER_ADVANCE` — avance d’associé ;
- `LOAN_DRAW` — emprunt reçu.

Les autorités existantes restent inchangées :

- transfert interne → `EnterpriseAccountTransfer` ;
- encaissement client → `EnterprisePayment` et allocations ;
- chiffre d’affaires → ventes/factures et écritures de produits `POSTED` ;
- mouvement de trésorerie → `EnterpriseTreasuryTransaction` ;
- caisse physique → `EnterpriseCashSession` et `EnterpriseCashMovement` ;
- comptabilité → posting engine et grand livre commun.

Un mouvement d’argent n’est donc jamais assimilé automatiquement à un revenu.

## Confirmation atomique

Après approbation indépendante, la confirmation exécute dans une transaction Prisma sérialisable :

1. verrouillage et revalidation tenant-scoped de l’opération ;
2. revalidation du compte financier actif ;
3. pour `CASH`, revalidation de la session `OPEN` explicitement liée ;
4. incrément du `operationalBalance` ;
5. création de l’entrée `EnterpriseTreasuryTransaction(FUNDING, INBOUND)` ;
6. création de `EnterpriseCashMovement(FUNDING, INBOUND)` si le compte est une caisse ;
7. posting comptable canonique via `postBusinessEventTx` ;
8. événement opérationnel et audit.

Toute erreur annule l’ensemble.

## Comptabilisation

- apport en capital : débit compte de trésorerie / crédit `EQUITY_CAPITAL` ;
- emprunt : débit compte de trésorerie / crédit `BORROWINGS` ;
- avance d’associé : débit compte de trésorerie / crédit d’un compte `LIABILITY` actif, choisi explicitement dans le plan du tenant.

Le template publié `OHADA_SYSCOHADA@0.1.0` reste immuable. Ses mappings `EQUITY_CAPITAL → 101` et `BORROWINGS → 162` sont seulement consommés. Aucun mapping d’avance d’associé n’est injecté dans cette version publiée.

## Caisse

Le `openingAmount` d’une session reste un comptage physique d’ouverture et ne finance jamais le compte financier. Un financement Cash est lié à une session ouverte et crée son propre mouvement d’entrée. Une contrepassation Cash exige elle aussi une session ouverte compatible pour porter le mouvement physique de sortie.

## Approbation et séparation des rôles

La création affecte immédiatement un `EnterpriseApproval`. L’approbation est réservée au validateur affecté et la confirmation à un troisième acteur autorisé, distinct de l’initiateur et du validateur. La contrepassation est réservée à un acteur indépendant des acteurs précédents.

Le module transversal Validations connaît `EnterpriseFundingOperation`, expose son contexte métier et ouvre le financement précis dans Trésorerie.

La lecture IA existante `FINANCE_TREASURY_READ` reste soumise au même module et aux mêmes permissions ; elle expose désormais la provenance structurée du financement (`fundingType`, numéro et statut) avec le mouvement de trésorerie autorisé. Aucun nouvel entitlement ni outil d’écriture IA n’est ajouté.

## Contrepassation

Une opération confirmée n’est jamais modifiée rétroactivement. La contrepassation :

- appelle `reverseJournalEntryTx(..., DOMAIN_INVERSE)` ;
- décrémente le solde opérationnel ;
- crée `FUNDING_REVERSAL / OUTBOUND` ;
- crée le mouvement Cash sortant si nécessaire ;
- marque l’opération `REVERSED` en conservant l’original.

## UI/UX

L’onglet **Financements** de Trésorerie réutilise les primitives professionnelles DTSC :

- sélecteurs canoniques de compte financier, caisse ouverte, compte de passif et validateur ;
- formulaires `presentation="editor"` ;
- saisie conservée en cas d’erreur ;
- fermeture/réinitialisation uniquement après succès backend ;
- erreurs métier sûres FR/EN ;
- aucune saisie d’UUID ou enum brute ;
- deep-link depuis Validations ;
- contrat mobile/responsive et mode sombre existants.

## Compatibilité QA Trésorerie existante

Le contrat statique du hotfix #580 sur le compteur de l’onglet Comptes financiers a été étendu, pas affaibli : chaque onglet qui affiche un compteur doit utiliser `collection.pagination.total` de sa propre collection active et la QA interdit toujours les compteurs basés sur `collection.items.length`. Cela évite qu’un compteur de page soit présenté comme un total métier et évite aussi de réutiliser le total Financements comme compteur des Comptes financiers.

## Dette

- Dette créée : **aucune visée**.
- Dette remboursée : absence de financement externe canonique sur un compte déjà créé ; confusion potentielle entre trésorerie, encaissement et revenu ; absence de projection du financement dans Validations et l’historique de trésorerie.
- Dette maintenue volontairement : aucune nécessaire au périmètre #756.

## Rollback

Le rollback applicatif est un revert de la PR. La migration additive et les données déjà créées restent présentes. Aucune écriture `POSTED`, transaction de trésorerie ou opération de financement confirmée n’est supprimée ni réécrite.