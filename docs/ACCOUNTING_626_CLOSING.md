# Accounting C5 — FX de clôture, year-end et cession finale d’actifs

## Objet

L’itération #626 finalise le programme Accounting C (#599) sur trois traitements qui manquaient encore au grand livre canonique DTSC :

- réévaluation des postes monétaires en devise à la clôture d’une période ;
- clôture annuelle des comptes de résultat vers le report à nouveau ;
- comptabilisation finale d’une cession d’immobilisation.

Aucun second ledger n’est créé. `EnterpriseJournalEntry` et `EnterpriseJournalLine` restent les seules écritures comptables. Les traitements C5 utilisent les autorités déjà existantes : `EnterprisePostingBatch`, `EnterpriseExchangeRateSnapshot`, `EnterpriseJournalReversal`, `EnterpriseAssetDisposal`, les exercices/périodes et les mappings sémantiques.

## Événements de posting

Trois événements canoniques sont ajoutés au registre :

- `FX_CLOSING_REVALUATION_POSTED` ;
- `YEAR_END_CLOSED` ;
- `ASSET_DISPOSAL_POSTED`.

Ils passent tous par le moteur canonique de posting et conservent son idempotence, ses contrôles de période, ses mappings tenant-scoped et ses écritures auditées.

## Réévaluation FX de clôture

Le traitement reçoit une période et une devise étrangère. Il ne réévalue que les comptes monétaires pris en charge par C5. Les écritures `POSTED` et les originaux ensuite `REVERSED` restent dans l’historique utilisé pour le calcul ; leur contrepassation séparée neutralise ensuite l’impact au bon moment.

Pour chaque solde monétaire concerné, le service :

1. calcule la valeur fonctionnelle historique portée par le grand livre ;
2. résout le taux valide à la date de fin de période ;
3. snapshotte ce taux via `EnterpriseExchangeRateSnapshot` ;
4. calcule l’écart de réévaluation ;
5. utilise `FX_GAIN` ou `FX_LOSS` selon le signe ;
6. poste une seule écriture C5 grâce à la clé d’idempotence du moteur ;
7. crée dans la même transaction une contrepassation liée dans la prochaine période ouverte.

Si aucune période suivante ouverte n’existe, le traitement est refusé avec `FX_REVALUATION_NEXT_OPEN_PERIOD_REQUIRED`. Il n’existe donc pas d’écriture FX partielle sans contrepassation future contrôlée.

## Clôture annuelle et report à nouveau

La clôture annuelle agrège les soldes des comptes de produits et charges de l’exercice et les solde vers le mapping sémantique `RETAINED_EARNINGS`.

Le grand livre DTSC étant continu, C5 ne recrée pas artificiellement les soldes du bilan dans un faux journal d’ouverture. Les actifs, passifs et capitaux propres continuent naturellement dans le GL ; seule la performance de l’exercice est transférée vers le report à nouveau.

Le traitement exige un exercice suivant ouvert afin de préserver la continuité opérationnelle. L’absence d’exercice/période suivante utilisable est bloquée par `YEAR_END_NEXT_OPEN_FISCAL_YEAR_REQUIRED`.

Un retry du même événement ne doit pas créer une seconde écriture de clôture : l’idempotence reste celle du moteur `EnterprisePostingBatch`/`EnterpriseJournalEntry`.

## Cession d’actif

La préparation existante de `EnterpriseAssetDisposal` reste la source métier du brouillon. C5 ajoute la comptabilisation finale.

L’écriture de cession :

- crédite le compte d’immobilisation pour sortir la valeur brute ;
- débite les amortissements cumulés déjà comptabilisés ;
- enregistre le produit de cession ;
- comptabilise le gain ou la perte résiduelle ;
- conserve l’identifiant de l’actif comme dimension de la ligne quand applicable.

La base historique de l’actif reste en devise fonctionnelle selon le profil comptable. Le produit de cession peut être exprimé dans une autre devise et utilise le moteur de conversion/snapshot à la date de cession.

Après posting réussi :

- le brouillon passe à `POSTED` avec son `journalEntryId` ;
- le profil comptable passe à `DISPOSED` ;
- les échéances d’amortissement futures encore planifiées sont marquées `CANCELLED` ;
- les amortissements déjà `POSTED` ne sont jamais supprimés ni réécrits.

## Gain/perte de cession

C5 introduit des alias sémantiques explicites `ASSET_DISPOSAL_GAIN` et `ASSET_DISPOSAL_LOSS` afin que le code métier ne référence aucun numéro de compte réglementaire.

La baseline SYSCOHADA `OHADA_SYSCOHADA@0.1.0` reste immuable. Les alias sont résolus vers les comptes sémantiques divers déjà provisionnés par la baseline actuelle. Une future version réglementaire pourra modifier ses mappings par le mécanisme normal de versioning sans modifier l’algorithme C5.

## Reversal système

`reverseJournalEntryTx` supporte l’autorisation interne `SYSTEM_CLOSING` pour les contrepassations automatiques de clôture. Cette autorisation ne remplace pas le chemin utilisateur normal : une contrepassation manuelle continue d’exiger ses contrôles d’indépendance habituels.

La contrepassation C5 s’exécute dans la même transaction sérialisable que le traitement source. Il n’y a pas de transaction Prisma imbriquée.

## Permissions et multi-tenant

Les routes sont tenant-scoped par `organizationId`.

- lecture de l’espace Opérations de clôture : `FINANCE_CLOSE:view` ;
- réévaluation FX / year-end : `FINANCE_CLOSE:close` ;
- lecture des immobilisations : contrat existant `FINANCE_ASSETS:view` ;
- comptabilisation d’une cession : `FINANCE_ASSETS:post`.

Les pages serveur revalident session active, membership, entreprise cliente active, entitlement et capacité du module. Les API restent l’autorité finale même lorsque l’UI masque une action non autorisée.

## Interfaces

### Clôture financière

`/enterprise-modules/FINANCE_CLOSE/operations`

L’écran permet de :

- choisir une période ouverte/pré-clôturée et une devise étrangère active ;
- lancer la réévaluation FX ;
- choisir un exercice et lancer la clôture annuelle ;
- consulter les écritures C5 récentes et la contrepassation liée lorsqu’elle existe.

### Immobilisations

`/enterprise-modules/FINANCE_ASSETS/disposals`

L’écran permet de :

- préparer un brouillon de cession pour un actif éligible ;
- saisir date, produit, devise et motif ;
- consulter valeur brute, amortissements cumulés, VNC et gain/perte ;
- comptabiliser le brouillon ;
- constater l’écriture finale et l’arrêt des amortissements futurs.

Les deux interfaces sont bilingues FR/EN et n’utilisent ni `window.prompt` ni `window.confirm`.

## Migration et rollback

Aucune migration Prisma C5 n’est requise. Les structures persistantes nécessaires existent déjà.

Le rollback applicatif consiste à désactiver les nouvelles opérations/routes. Les écritures déjà `POSTED` ne sont jamais supprimées. Une correction comptable ultérieure doit utiliser les mécanismes de reversal/écriture contrôlée, conformément aux invariants Accounting.

## Hors scope

Restent hors #626 :

- multi-ledger ;
- intercompany ;
- consolidation ;
- dimensions configurables avancées de Accounting E (#600) ;
- réévaluation d’actifs non monétaires ;
- réécriture de la baseline SYSCOHADA 0.1.0.

## QA permanente

`scripts/qa-accounting-626-closing.mjs` verrouille notamment :

- les trois événements C5 ;
- les builders et services canoniques ;
- la sélection des postes monétaires ;
- l’utilisation des snapshots de taux ;
- le report à nouveau ;
- le reversal système lié ;
- le posting final de cession ;
- l’absence de numéros de compte réglementaires hardcodés dans les builders ;
- les routes RBAC ;
- les deux interfaces et leurs pages protégées ;
- les liens d’accès depuis les modules Finance.

La QA #626 est intégrée à `scripts/qa-enterprise-accounting-checks.mjs`, donc à la chaîne de régression Accounting.

## Parcours OWNER_E2E #626

Avant merge, exécuter au minimum :

1. Ouvrir `Clôture financière > Opérations de clôture`.
2. Choisir une période avec un solde monétaire dans une devise étrangère et un taux de clôture disponible.
3. Lancer la réévaluation FX et vérifier l’écriture dans le GL ainsi que sa contrepassation liée dans la prochaine période ouverte.
4. Relancer la même réévaluation et vérifier qu’aucun doublon n’est créé.
5. Clôturer un exercice comportant produits/charges et vérifier le transfert net vers `RETAINED_EARNINGS` sans duplication des comptes de bilan.
6. Relancer le year-end et vérifier l’idempotence.
7. Ouvrir `Immobilisations > Cessions d’actifs`, préparer une cession puis la comptabiliser.
8. Vérifier valeur brute, amortissements cumulés, VNC, produit et gain/perte dans l’écriture finale.
9. Vérifier que les amortissements futurs de l’actif sont annulés et que les amortissements déjà postés restent intacts.
10. Tester une période fermée/verrouillée ou l’absence de période future et vérifier un refus spécifique sans écriture partielle.
11. Vérifier qu’un utilisateur sans capacité sensible peut consulter selon son droit de lecture mais ne peut pas exécuter les opérations protégées.

Une fois ces contrôles satisfaits, le propriétaire peut répondre exactement `E2E #626 bon`.
