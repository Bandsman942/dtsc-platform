# Hotfix #580 — Trésorerie, Caisse, Banque et Rapprochement

## Baseline

- Issue : #580
- Branche : `fix/580-treasury-cash-bank-reconciliation`
- Baseline : `main@e3c8589227ba2885136f04dbd3698c558e941314`
- Migration : aucune prévue / aucune ajoutée par ce hotfix.

## Diagnostic corrigé

Le hotfix applique aux modules `FINANCE_TREASURY`, `FINANCE_CASH`, `FINANCE_BANK` et `FINANCE_RECONCILIATION` les contrats déjà imposés aux autres modules ERP stabilisés : vérité serveur, capacités granulaires, approbateur affecté, références recherchables, formulaires guidés, feedback global et deep links indépendants de la page chargée.

Les défauts corrigés comprennent :

- recherche Cash/Bank/Reconciliation envoyée par l’UI mais non appliquée avant pagination ;
- deep links dépendant des 25 éléments de la page courante ;
- actions sensibles déduites d’un `canManage` global au lieu de capacités par objet ;
- références Trésorerie chargées par fenêtres fixes de 500/1000 en UI legacy ;
- formulaire de Caisse non aligné avec le comptage physique canonique ;
- rejet de transfert absent du endpoint de transition alors que l’approbation affectée possède ce concept ;
- rapprochement utilisant les états UI historiques au lieu de la machine canonique `DRAFT → IN_PROGRESS → PENDING_VALIDATION → COMPLETED` ;
- cibles de rapprochement peu guidées ;
- validation insuffisante d’un `journalEntryId` fourni et risque de réutilisation concurrente d’une ligne bancaire.

## Trésorerie

`EnterpriseFinancialAccount` reste l’autorité des comptes opérationnels. Le workspace hotfix expose création, consultation, modification des champs mutables, archivage contrôlé, transfert inter-comptes et historique sans maintenir de solde parallèle.

Les transferts conservent le workflow canonique :

1. sélection de deux comptes actifs distincts ;
2. aperçu serveur du taux FX et du montant crédité ;
3. sélection d’un approbateur autorisé ;
4. création du transfert ;
5. `APPROVE` ou `REJECT` uniquement par l’approbateur affecté ;
6. `CONFIRM` selon la capacité d’écriture et après approbation ;
7. mise à jour atomique des comptes et posting selon les services existants.

L’UI utilise les capacités renvoyées par les API (`canEdit`, `canArchive`, `canApprove`, `canReject`, `canConfirm`) et non une liste locale de rôles.

## Caisse

Une session de caisse reste l’objet canonique : ouverture, mouvements, comptage, écart, soumission et validation.

Le hotfix :

- ne propose à l’ouverture que des comptes `CASH` actifs ;
- empêche un second formulaire de produire un solde parallèle ;
- calcule le montant compté depuis les lignes de dénominations/quantités ;
- laisse le serveur recalculer et exiger l’égalité avec le comptage physique ;
- conserve le motif obligatoire en cas d’écart ;
- crée l’affectation `EnterpriseApproval` lors de la soumission ;
- n’expose la décision qu’à l’approbateur affecté ;
- conserve la séparation des rôles et le posting canonique des écarts approuvés.

## Banque

Un relevé bancaire reste un document financier structuré, sans création implicite de paiement ou d’écriture métier.

Le hotfix conserve :

- fichier CSV uniquement ;
- limite client 5 Mo et limite serveur de 10 000 lignes ;
- parsing et neutralisation des préfixes de formule ;
- revalidation serveur du compte, de son type, de la devise et de chaque ligne ;
- unicité tenant-scoped de `EnterpriseBankStatement.reference` déjà présente en base ;
- détail exact accessible par ID, hors pagination ;
- statut `IMPORTED` comme état bancaire initial réel.

## Rapprochement

Le rapprochement reste distinct de l’allocation de paiement.

Les états canoniques utilisés sont :

- `DRAFT` : session créée ;
- `IN_PROGRESS` : au moins une correspondance confirmée ;
- `PENDING_VALIDATION` : soumise à un approbateur affecté ;
- `COMPLETED` : approuvée ;
- un rejet retourne la session en `IN_PROGRESS` pour correction.

### Cibles de matching

L’UI propose désormais des références recherchables et account-scoped pour :

- paiements `CONFIRMED` du compte ;
- transactions de trésorerie `UNRECONCILED` du compte ;
- écritures `POSTED` contenant le compte comptable lié au compte financier ;
- lignes du relevé encore `UNMATCHED`.

Le service verrouille la ligne bancaire par `FOR UPDATE`, revalide chaque référence fournie et refuse explicitement :

- une ligne déjà rapprochée ;
- un paiement non confirmé ou lié à un autre compte/tenant ;
- une transaction déjà rapprochée ou liée à un autre compte/tenant ;
- une écriture non `POSTED` ou sans ligne sur le compte comptable de trésorerie correspondant ;
- un montant supérieur au montant absolu de la ligne bancaire.

## Références recherchables

Le contrat `FinanceReferenceSelect` est étendu à :

- compte financier ;
- compte de grand livre ;
- membre ;
- site ;
- devise ;
- relevé bancaire ;
- paiement de rapprochement ;
- transaction de trésorerie ;
- écriture comptable.

Chaque recherche ciblée est tenant-scoped, autorisée par le module Finance demandé et retourne une fenêtre courte de résultats pertinents. L’utilisateur peut modifier sa recherche au lieu de dépendre des premiers 500/1000 objets d’un lookup global.

Le payload agrégé legacy de `treasury-lookups` est conservé temporairement uniquement pour rollback de l’ancien workspace ; les nouveaux workspaces #580 n’en dépendent plus.

## IA et abonnements

Le hotfix ne modifie aucun plan, quota ou entitlement. Il préserve les associations existantes :

- `FINANCE_TREASURY_READ` → `FINANCE_TREASURY` ;
- `FINANCE_CASH_READ` → `FINANCE_CASH` ;
- `FINANCE_BANK_READ` → `FINANCE_BANK` ;
- `FINANCE_RECONCILIATION_READ` → `FINANCE_RECONCILIATION`.

L’IA continue donc à passer par les mêmes permissions de module et à lire les objets canoniques. Aucun accès cross-tenant ni contournement du Tool Gateway n’est ajouté.

## UX

Les nouveaux workspaces utilisent :

- `Dialog presentation="editor"` pour les opérations longues/sensibles ;
- état `busy` et contrôles désactivés pendant mutation ;
- toast global succès/erreur ;
- recherche serveur et pagination ;
- deep links exacts ;
- références recherchables ;
- libellés FR/EN existants, avec quelques microcopies contextuelles locales uniquement lorsque le catalogue n’expose pas encore une clé dédiée.

## QA permanente

`scripts/qa-hotfix-580-finance-treasury-cash-bank-reconciliation.mjs` vérifie notamment :

- routing vers les workspaces hotfix ;
- contrat editor/toast/busy ;
- absence de `MANAGER_ROLES` local ;
- recherche + `recordId` serveur ;
- capacités par objet et approbateur affecté ;
- rejet de transfert explicite ;
- machine d’état du rapprochement ;
- Cash limité à `accountType: "CASH"` ;
- références de rapprochement account-scoped ;
- verrou de ligne bancaire et validation de toutes les cibles ;
- mapping des quatre outils IA Finance READ.

Cette QA est importée par `qa-enterprise-treasury-checks.mjs`, déjà exécutée par la régression globale.

## OWNER_E2E requis avant merge

Le hotfix modifie des surfaces utilisateur. La PR ne doit pas être fusionnée sans validation OWNER_E2E du HEAD final.

À tester au minimum :

- desktop + mobile ;
- FR + EN ;
- clair + sombre ;
- Trésorerie : créer un compte, rechercher au-delà de la première fenêtre, modifier, vérifier refus d’archivage si contraintes métier, transfert avec aperçu FX, approbation/rejet affecté puis confirmation ;
- Caisse : ouvrir, saisir plusieurs dénominations, soumettre, vérifier validation visible uniquement pour l’approbateur affecté, approuver/rejeter ;
- Banque : importer un CSV valide, refuser mauvais type/taille/données, rechercher, ouvrir un relevé par deep link hors page courante ;
- Rapprochement : créer depuis compte + relevé, matcher une ligne avec une cible recherchée, empêcher réutilisation de la ligne, soumettre, approuver/rejeter avec l’utilisateur affecté ;
- RBAC : un utilisateur sans capacité ne voit pas/ne peut pas appeler l’action correspondante ;
- vérifier qu’allocation de paiement et rapprochement bancaire restent deux opérations distinctes.

## Rollback

Les anciens workspaces restent présents dans le dépôt pendant ce hotfix. Un rollback applicatif peut rétablir leur routing sans rollback de données. Aucune migration #580 n’est nécessaire.
