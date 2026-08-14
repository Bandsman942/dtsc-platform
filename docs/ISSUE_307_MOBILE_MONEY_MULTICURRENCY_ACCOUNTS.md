# Issue #307 — Mobile Money multi-devise par opérateur

## Objectif

Le hotfix #307 remplace le contrat métier « un opérateur Mobile Money = un seul compte de float » par un contrat canonique **opérateur × devise × compte financier**.

Le changement vise en priorité l’exploitation en RDC, où un opérateur actif doit pouvoir disposer au minimum d’un wallet `CDF` et d’un wallet `USD`, tout en gardant une interface où l’opérateur n’est affiché qu’une seule fois.

## Source de vérité

`EnterpriseRetailProvider` reste la source du service opérateur. Son champ historique `mobileMoneyFloatAccountId` est conservé pendant une fenêtre de compatibilité, mais il n’est plus la source canonique pour une nouvelle opération.

La source canonique des wallets devient `EnterpriseRetailProviderAccount` :

- organisation ;
- opérateur ;
- usage `MOBILE_MONEY_FLOAT` ;
- devise ;
- compte financier `MOBILE_MONEY` actif.

La contrainte unique `(organizationId, providerId, accountUse, currencyCode)` empêche deux wallets actifs concurrents pour la même devise d’un même opérateur.

La migration `20260814101500_mobile_money_multicurrency_accounts` est additive. Elle reprend le mapping historique dans la nouvelle table en utilisant la devise réelle du compte financier existant. Elle ne supprime ni colonne ni table historique.

## Readiness RDC et extensibilité

Pour une organisation reconnue comme RDC, chaque opérateur Mobile Money actif est prêt lorsque `CDF` et `USD` sont tous les deux configurés.

Pour un autre pays, le mécanisme reste générique : un opérateur est considéré prêt avec au moins deux devises distinctes explicitement configurées. Aucun compte, devise ou solde n’est fabriqué par le système.

## Dépôts et retraits

Le client n’impose plus le compte de float effectif. Au moment de confirmer une opération :

1. la caisse ouverte détermine la devise transactionnelle ;
2. le serveur charge l’opérateur dans la même organisation ;
3. le serveur résout `EnterpriseRetailProviderAccount` pour cet opérateur et cette devise ;
4. le compte financier lié est revalidé : `MOBILE_MONEY`, actif, même organisation, même devise ;
5. l’effet cash/float est exécuté avec verrouillage transactionnel et idempotence existants.

Effets conservés :

- `DEPOSIT` : cash augmente ; float opérateur diminue du principal ;
- `WITHDRAWAL` : cash diminue ; float opérateur augmente du principal ;
- un frais encaissé en cash reste distinct du principal ;
- la commission opérateur déclarée reste une donnée opérationnelle tant qu’elle n’a pas été réellement créditée par l’opérateur.

L’annulation réutilise les identifiants de comptes stockés sur la transaction historique. Un changement ultérieur de configuration ne peut donc pas annuler sur un autre wallet.

## Comptabilité

Les opérations Mobile Money utilisent désormais le moteur de posting Finance commun et le journal `MOBILE_MONEY`.

Pour un dépôt/retrait, le posting reprend les effets réels :

- ligne du compte de caisse via son `ledgerAccountId` ;
- ligne du wallet Mobile Money via son `ledgerAccountId` ;
- ligne `SERVICE_REVENUE` uniquement lorsque la différence entre cash et float correspond à un frais réellement encaissé.

Les écritures sont idempotentes. L’annulation poste l’inverse du mouvement original.

## Transfert de float entre devises

`EnterpriseMobileMoneyFxTransfer` stocke le transfert entre deux wallets du **même opérateur** :

- compte et mapping source ;
- compte et mapping cible ;
- devise et montant source ;
- devise et montant cible ;
- taux utilisé ;
- identifiant, date et source du taux ;
- opérateur ;
- utilisateur ;
- clé d’idempotence ;
- état et données d’annulation.

Le serveur :

1. refuse une paire de devises identiques ;
2. résout les deux wallets sur le même `providerId` ;
3. refuse un mapping incomplet ;
4. résout le taux via `resolveExchangeRateDetails(...)`, source Finance canonique ;
5. vérifie le solde source ;
6. verrouille les deux comptes dans un ordre déterministe ;
7. débite le wallet source et crédite le wallet cible de façon atomique ;
8. crée les deux mouvements de trésorerie ;
9. snapshotte le taux réellement utilisé ;
10. poste l’écriture comptable Mobile Money correspondante.

Aucun taux implicite ou codé en dur n’est accepté. Un taux manquant bloque le transfert et l’interface oriente l’utilisateur vers les taux de change Finance.

L’annulation d’un transfert est non destructive : elle remet les deux wallets dans l’état financier inverse, crée les mouvements de trésorerie de reversal et poste l’écriture comptable inverse.

## UX

Le workspace `MOBILE_MONEY_AGENCY` possède désormais une surface dédiée.

### Configuration

Chaque opérateur apparaît une seule fois avec ses wallets par devise. En RDC, les lignes `CDF` et `USD` sont visibles dans la même carte. Chaque ligne affiche :

- devise ;
- compte financier lié ;
- solde opérationnel ;
- état configuré / à compléter.

Une devise supplémentaire peut être ajoutée sans dupliquer la carte opérateur.

### Opération client

Lorsque la caisse est ouverte, seuls les opérateurs possédant un wallet dans la devise de cette caisse sont proposés. Avant confirmation, l’interface affiche explicitement le wallet et la devise qui seront utilisés ; le serveur reste l’autorité finale.

### Transfert entre devises

La section « Transfert entre devises » permet de choisir :

- opérateur ;
- devise source ;
- devise cible ;
- montant source.

Un preview serveur affiche le taux Finance courant, le montant cible et le solde disponible avant confirmation.

Le contrat est localisé FR/EN, responsive mobile/desktop et utilise les tokens DTSC clair/sombre.

## Sécurité et isolation

Toutes les lectures et mutations sont bornées par `organizationId`.

Les APIs de configuration et transfert utilisent les droits du module `MOBILE_MONEY_AGENCY` :

- lecture pour charger configuration et preview ;
- `manage` pour modifier un mapping, confirmer un transfert FX ou l’annuler ;
- `submit` reste le droit de l’opération client normale.

Aucun identifiant envoyé par le navigateur ne permet de contourner la validation de type, devise, tenant ou opérateur.

## Provider connecté

Le chemin provider connecté conserve sa state machine asynchrone. Lorsqu’un provider confirme l’opération, la finalisation locale repasse par `createMobileMoneyTransaction(...)` : le wallet est donc résolu avec le même contrat opérateur + devise que le mode manuel.

La comptabilité est ensuite finalisée via la même fonction idempotente, que la confirmation soit immédiate, reçue par webhook ou issue d’une réconciliation.

## QA

Le gate `scripts/qa-307-mobile-money-multicurrency.mjs` protège notamment :

- schéma et migration additive ;
- backfill legacy ;
- DRC `CDF + USD` et minimum générique de deux devises ;
- résolution serveur du wallet par devise ;
- interdiction de revenir au `input.floatAccountId || provider.mobileMoneyFloatAccountId` ;
- transfert FX même opérateur avec taux Finance, snapshot, verrouillage et balance ;
- Treasury et comptabilité ;
- reversal ;
- RBAC ;
- UX FR/EN et responsive ;
- absence de workflow temporaire dans la branche.

Le gate est intégré à la régression CI canonique. OWNER_E2E reste obligatoire avant merge car le changement touche des flux financiers réels.

## Rollback

Le rollback applicatif consiste à revert la PR. La migration étant additive, les nouvelles tables et leurs données peuvent rester présentes sans casser l’ancienne lecture mono-compte pendant la fenêtre de compatibilité. Aucune migration destructive de rollback n’est prévue.

## Livraison

Aucun Preview Vercel de branche/PR n’est autorisé. Les commits intermédiaires restent sur GitHub ; seul le commit final fusionné sur `main` est destiné à Vercel Production.
