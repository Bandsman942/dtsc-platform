# Hotfix #509 — Inventaire des frontières de validation comptable

## Pourquoi cet inventaire existe

Le hotfix #509 impose d’inventorier les workflows ERP qui utilisaient historiquement `assertIndependentActor` et de ne jamais transformer mécaniquement toute séparation des fonctions en auto-validation.

Deux catégories doivent rester distinctes :

1. **validation humaine à affecter** : une personne est explicitement responsable d’approuver ou rejeter un objet ; cette catégorie doit converger vers le contrat `EnterpriseApproval` et les candidats RBAC de #509 ;
2. **exécution indépendante** : une personne réalise, poste, confirme, clôture, réouvre ou renverse une opération déjà approuvée ; cette séparation reste stricte et l’override d’auto-validation de #509 ne s’y applique pas.

Les familles déjà raccordées directement dans #509 sont les transferts de trésorerie, achats, budgets, dépenses et workflows RH/paie couverts par le contrat partagé. Les frontières comptables structurellement différentes ci-dessous sont suivies par **#511**.

## Matrice canonique

| Service / opération | Nature | État dans #509 | Suite |
|---|---|---|---|
| Transfert de trésorerie — APPROVE/REJECT | validation humaine simple | **Raccordé** à `EnterpriseApproval`, validateur explicite et revalidation RBAC | aucune dette #509 |
| Transfert de trésorerie — CONFIRM | exécution financière | **Strict** après approbation | ne jamais autoriser via self-approval override |
| Écriture comptable — APPROVE/REJECT | validation humaine simple | inventorié, modèle d’affectation à compléter | #511 |
| Écriture comptable — POST | posting comptable | **Strict** | conserver l’indépendance lorsque le journal exige une validation |
| Paiement — APPROVE | validation humaine simple | inventorié, modèle d’affectation à compléter | #511 |
| Paiement — CONFIRM | mouvement de trésorerie / exécution | **Strict** | ne pas assimiler à APPROVE |
| Paiement — REVERSE | réversibilité financière | **Strict** | ne jamais autoriser via self-approval override |
| Facture client — APPROVE | validation humaine simple | inventorié | #511 |
| Facture fournisseur — REVIEW puis APPROVE | validation multi-étapes | inventorié ; exige des responsables distincts par étape | #511 |
| Avoir client — APPROVE_AND_POST | validation et posting combinés | inventorié ; **override interdit tant que les étapes ne sont pas séparées** | #511 |
| Avoir fournisseur — APPROVE_AND_POST | validation et posting combinés | inventorié ; **override interdit tant que les étapes ne sont pas séparées** | #511 |
| Solde d’ouverture — APPROVE_AND_POST | validation et posting combinés | inventorié ; **override interdit tant que les étapes ne sont pas séparées** | #511 |
| Clôture financière — APPROVE | validation humaine | inventorié | #511 |
| Clôture financière — CLOSE | clôture irréversible de période | **Strict** | conserver la séparation d’exécution |
| Clôture financière — REOPEN | gouvernance de réouverture | **Strict** | conserver la séparation d’exécution |
| Session de caisse — VALIDATE/REJECT | validation avec possible posting d’écart | inventorié ; affectation explicite à concevoir sans confondre validation et posting | #511 |
| Rapprochement — COMPLETE | contrôle final de rapprochement | inventorié ; responsable explicite à concevoir | #511 |
| Contrepassation d’écriture | réversibilité comptable | **Strict** | hors override d’auto-validation |

## Contrat opposable pour #509

### Raccordements réalisés dans cette PR

Le transfert de trésorerie n’utilise plus la route d’approbation historique comme autorité : la route métier passe par `treasury-approval-service.ts`, qui revalide l’affectation via `assertEnterpriseApprovalDecision` et synchronise la `EnterpriseApproval`. Les achats, budgets, dépenses et approbations RH/paie utilisent le même contrat transverse dans leur famille respective.

### Contrôles stricts conservés

Le hotfix ne doit pas supprimer les contrôles d’indépendance sur :

- `postJournalEntry` ;
- `confirmEnterprisePayment` ;
- `REVERSE` d’un paiement ;
- `reverseJournalEntry` ;
- `CLOSE` et `REOPEN` d’une clôture financière ;
- les opérations combinées `approveAndPost*` tant qu’elles n’ont pas été découpées ;
- la confirmation/exécution d’un transfert déjà approuvé.

Ces barrières protègent l’exécution et la comptabilisation. La politique `approvalPolicy.selfApprovalModuleCodes` ne leur confère aucun droit implicite.

## Pourquoi #511 est séparée

Les workflows comptables restant à migrer ne sont pas une simple variante du sélecteur de validateur : certains n’ont aujourd’hui aucun champ d’affectation, certains ont deux étapes humaines distinctes (`REVIEW` puis `APPROVE`) et d’autres fusionnent approbation et posting dans la même fonction. Les modifier dans le hotfix sans découpage explicite risquerait d’affaiblir la séparation des fonctions ou de créer une deuxième source de vérité.

L’Issue #511 porte donc le cutover structurel suivant : affectations explicites, `EnterpriseApproval` par étape humaine, synchronisation du Centre des actions et séparation des opérations combinées avant toute éventuelle politique d’auto-validation.

## Règle de reprise

Tant que #511 n’est pas implémentée :

- aucune nouvelle famille comptable ne doit adopter un override ad hoc ;
- aucune suppression d’`assertIndependentActor` sur une étape POST/CONFIRM/REVERSE/CLOSE/REOPEN n’est autorisée ;
- toute évolution d’une validation comptable inventoriée doit soit utiliser le contrat partagé de #509, soit être réalisée dans #511.
