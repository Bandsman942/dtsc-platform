# Issue #307 — Mobile Money multi-devise par opérateur et caisses parallèles

## Objectif

Le hotfix #307 remplace le contrat métier « un opérateur Mobile Money = un seul compte de float » par un contrat canonique **opérateur × devise × compte financier**.

Le changement vise en priorité l’exploitation en RDC, où un opérateur actif doit pouvoir disposer au minimum d’un wallet `CDF` et d’un wallet `USD`, tout en gardant une interface où l’opérateur n’est affiché qu’une seule fois.

Le même hotfix aligne le parcours cash sur l’exploitation réelle : un même agent peut garder plusieurs sessions de caisse ouvertes simultanément sur des comptes distincts, notamment une caisse `CDF` et une caisse `USD`, basculer sans friction entre elles pour ses dépôts/retraits puis compter et soumettre chaque caisse séparément à l’approbation en fin de journée.

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

Le support multi-caisse ne nécessite pas de nouveau modèle : `EnterpriseCashSession` permet déjà plusieurs sessions appartenant au même cashier lorsqu’elles concernent des comptes financiers distincts. `openCashSession(...)` interdit seulement qu’une même caisse ait déjà une session `OPEN`, `CLOSING` ou `PENDING_VALIDATION` pour cet utilisateur. La dette se trouvait donc dans le chargement Retail et l’UX qui ne remontaient qu’une session.

## Readiness RDC et extensibilité

Pour une organisation reconnue comme RDC, chaque opérateur Mobile Money actif est prêt lorsque `CDF` et `USD` sont tous les deux configurés.

Pour un autre pays, le mécanisme reste générique : un opérateur est considéré prêt avec au moins deux devises distinctes explicitement configurées. Aucun compte, devise ou solde n’est fabriqué par le système.

Côté caisse, l’UX recommande en RDC une paire **CDF + USD** mais ne crée ni n’ouvre ces comptes automatiquement. Les comptes de caisse restent des comptes Finance réels, explicitement configurés.

## Plusieurs caisses simultanées

Le dashboard Retail expose désormais les sessions `OPEN`, `CLOSING` et `PENDING_VALIDATION` du cashier courant dans `cashSessions`, tout en conservant `cashSession` comme compatibilité pour les autres workspaces Retail.

Pour chaque session, le serveur calcule un `expectedCurrentAmount` d’affichage à partir du fonds d’ouverture et de ses mouvements cash. Ce montant est un aperçu UX : au moment de la clôture, le service Finance recalcule toujours le théorique sur la donnée transactionnelle courante.

Dans `MOBILE_MONEY_AGENCY` :

1. toutes les caisses `OPEN` de l’utilisateur sont affichées comme cartes sélectionnables ;
2. CDF puis USD sont prioritaires visuellement en RDC ;
3. un clic/toucher change la caisse opérationnelle immédiatement ;
4. changer de caisse change la devise transactionnelle et donc les wallets opérateurs éligibles ;
5. un brouillon de confirmation Mobile Money est annulé si la caisse change avant confirmation ;
6. une autre caisse disponible peut être ouverte sans fermer celles déjà actives ;
7. une caisse en `PENDING_VALIDATION` reste visible mais n’est plus utilisable pour une opération.

La sélection UI n’est pas une autorisation : `createMobileMoneyTransaction(...)` revalide que le `cashAccountId` appartient à une session `OPEN` du même utilisateur et de la même organisation.

## Dépôts et retraits

Le client n’impose plus le compte de float effectif. Au moment de confirmer une opération :

1. l’utilisateur a sélectionné une caisse `OPEN` ;
2. cette caisse détermine la devise transactionnelle ;
3. le serveur revalide la session ouverte sur le compte cash sélectionné ;
4. le serveur charge l’opérateur dans la même organisation ;
5. le serveur résout `EnterpriseRetailProviderAccount` pour cet opérateur et cette devise ;
6. le compte financier lié est revalidé : `MOBILE_MONEY`, actif, même organisation, même devise ;
7. l’effet cash/float est exécuté de façon atomique et relié à la session cash sélectionnée.

Effets conservés :

- `DEPOSIT` : cash augmente ; float opérateur diminue du principal ;
- `WITHDRAWAL` : cash diminue ; float opérateur augmente du principal ;
- un frais encaissé en cash reste distinct du principal ;
- la commission opérateur déclarée reste une donnée opérationnelle tant qu’elle n’a pas été réellement créditée par l’opérateur.

Les mouvements CDF et USD restent donc séparés jusque dans les `EnterpriseCashMovement`, ce qui donne un théorique de clôture indépendant pour chaque session.

L’annulation réutilise les identifiants de comptes stockés sur la transaction historique. Un changement ultérieur de configuration ne peut donc pas annuler sur un autre wallet.

## Clôture de fin de journée

La surface Mobile Money expose une section « Fin de journée » qui réutilise strictement le workflow Finance existant.

Chaque caisse `OPEN` dispose de son propre panneau de comptage :

- coupures usuelles CDF ou USD ;
- possibilité d’ajouter une coupure personnalisée ;
- total compté en temps réel ;
- théorique courant affiché ;
- écart estimé ;
- motif obligatoire côté UI en présence d’un écart.

La soumission passe par une route Retail protégée par le droit `MOBILE_MONEY_AGENCY / submit`, mais cette route délègue le traitement à `submitCashSessionClose(...)`. Le serveur :

1. verrouille la session ;
2. vérifie qu’elle appartient bien à l’utilisateur ;
3. exige le statut `OPEN` et la bonne `revision` ;
4. recalcule le théorique à partir des mouvements réels ;
5. vérifie que la somme des coupures correspond au total compté ;
6. exige un motif si le compté diffère du théorique ;
7. persiste le comptage et l’éventuelle anomalie ;
8. passe la session en `PENDING_VALIDATION`.

L’approbation/rejet reste ensuite assurée par le workflow Finance canonique `validateCashSession(...)`. Le hotfix ne duplique pas cette logique et ne donne pas au cashier un droit d’auto-approbation.

L’utilisateur peut donc, par exemple, clôturer sa caisse CDF, la voir passer « En attente d’approbation », puis clôturer sa caisse USD séparément.

## Comptabilité

Les opérations Mobile Money utilisent le moteur de posting Finance commun et le journal `MOBILE_MONEY`.

Pour un dépôt/retrait, le posting reprend les effets réels :

- ligne du compte de caisse via son `ledgerAccountId` ;
- ligne du wallet Mobile Money via son `ledgerAccountId` ;
- ligne `SERVICE_REVENUE` uniquement lorsque la différence entre cash et float correspond à un frais réellement encaissé.

Les écritures sont idempotentes. L’annulation poste l’inverse du mouvement original.

Le support multi-caisse ne mélange pas les écritures : chaque mouvement cash est rattaché à la session réellement sélectionnée, tandis que la comptabilité conserve la devise transactionnelle et le compte financier d’origine.

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

Le workspace `MOBILE_MONEY_AGENCY` possède une surface dédiée.

### Mes caisses Mobile Money

Les sessions ouvertes sont présentées avant le formulaire d’opération sous forme de cartes tactiles. La carte sélectionnée est mise en évidence et utilise `aria-pressed`. Le parcours permet d’ouvrir une autre caisse depuis le même écran.

L’objectif est d’éviter de refaire un formulaire ou de quitter le module pour passer du CDF à l’USD : le changement de caisse est une action courte et réversible avant toute confirmation métier.

### Configuration

Chaque opérateur apparaît une seule fois avec ses wallets par devise. En RDC, les lignes `CDF` et `USD` sont visibles dans la même carte. Chaque ligne affiche :

- devise ;
- compte financier lié ;
- solde opérationnel ;
- état configuré / à compléter.

Une devise supplémentaire peut être ajoutée sans dupliquer la carte opérateur.

### Opération client

Seuls les opérateurs possédant un wallet dans la devise de la **caisse actuellement sélectionnée** sont proposés. Avant confirmation, l’interface affiche explicitement :

- la caisse utilisée ;
- la devise ;
- le wallet opérateur résolu ;
- la référence opérateur.

Le serveur reste l’autorité finale.

### Fin de journée

Chaque caisse encore `OPEN` possède un comptage séparé. Après soumission, elle est remplacée dans l’interface par un état « En attente d’approbation » et n’est plus disponible comme caisse opérationnelle.

### Transfert entre devises

La section « Transfert entre devises » permet de choisir :

- opérateur ;
- devise source ;
- devise cible ;
- montant source.

Un preview serveur affiche le taux Finance courant, le montant cible et le solde disponible avant confirmation.

Le contrat est localisé FR/EN, responsive mobile/desktop et utilise les tokens DTSC clair/sombre, avec focus clavier et cibles tactiles.

## Sécurité et isolation

Toutes les lectures et mutations sont bornées par `organizationId`.

Les APIs utilisent les droits du module `MOBILE_MONEY_AGENCY` :

- lecture pour charger configuration et preview ;
- `submit` pour l’opération client et la soumission de clôture de la caisse appartenant à l’utilisateur ;
- `manage` pour modifier un mapping, confirmer un transfert FX ou l’annuler.

La validation finale d’une clôture reste dans le domaine Finance et conserve ses protections d’indépendance.

Aucun identifiant envoyé par le navigateur ne permet de contourner la validation de type, devise, tenant, opérateur ou propriété de la session cash.

## Provider connecté

Le chemin provider connecté conserve sa state machine asynchrone. Lorsqu’un provider confirme l’opération, la finalisation locale repasse par `createMobileMoneyTransaction(...)` : le wallet est donc résolu avec le même contrat opérateur + devise que le mode manuel et le compte cash doit toujours correspondre à la session ouverte appropriée.

La comptabilité est ensuite finalisée via la même fonction idempotente, que la confirmation soit immédiate, reçue par webhook ou issue d’une réconciliation.

## QA

Le gate `scripts/qa-307-mobile-money-multicurrency.mjs` protège notamment :

- schéma et migration additive ;
- backfill legacy ;
- DRC `CDF + USD` et minimum générique de deux devises ;
- résolution serveur du wallet par devise ;
- interdiction de revenir au `input.floatAccountId || provider.mobileMoneyFloatAccountId` ;
- liaison d’une opération cash à une session `OPEN` sur le compte sélectionné ;
- capacité du même cashier à avoir des sessions actives sur des comptes distincts ;
- chargement de toutes les sessions actives dans le dashboard Retail ;
- sélecteur de caisse CDF/USD et invalidation du brouillon lors de la bascule ;
- comptage et clôture séparés ;
- réutilisation de `submitCashSessionClose(...)` et passage en `PENDING_VALIDATION` ;
- transfert FX même opérateur avec taux Finance, snapshot, verrouillage et balance ;
- Treasury et comptabilité ;
- reversal ;
- RBAC ;
- UX FR/EN, responsive, focus et cibles tactiles ;
- absence de workflow temporaire dans la branche.

Le gate est intégré à la régression CI canonique. OWNER_E2E reste obligatoire avant merge car le changement touche des flux financiers réels.

## Rollback

Le rollback applicatif consiste à revert la PR. La migration étant additive, les nouvelles tables et leurs données peuvent rester présentes sans casser l’ancienne lecture mono-compte pendant la fenêtre de compatibilité. Le support multi-caisse n’ajoute aucune migration destructive.

## Livraison

Aucun Preview Vercel de branche/PR n’est autorisé. Les commits intermédiaires restent sur GitHub ; seul le commit final fusionné sur `main` est destiné à Vercel Production.
