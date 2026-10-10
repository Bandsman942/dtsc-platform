# Hotfix #786 — Enforcement serveur des avantages relationnels

## Objectif

Le hotfix transforme **Relations & avantages** d’un catalogue avec demandes en moteur serveur d’enforcement :

```text
relation active
→ capability et entitlement
→ audience / rôle / attribution
→ fenêtre temporelle
→ contexte métier contrôlé
→ devise / montant minimum / conditions
→ cumul
→ quotas
→ effet métier vérifié
→ ledger d’usage
→ audit
```

Une relation n’accorde toujours aucun membership au tenant. L’interface n’est jamais l’autorité.

## Contrat des 22 relations

Les 22 types exposés par `ENTERPRISE_IDENTITY_RELATION_TYPES` ont désormais un contrat explicite `ENTERPRISE_BENEFITS` :

- PROSPECT
- CUSTOMER
- CUSTOMER_CONTACT
- SUPPLIER_REPRESENTATIVE
- EMPLOYEE
- COLLABORATOR
- CONTRACTOR
- PARTNER
- PATIENT
- STUDENT
- PARENT_GUARDIAN
- POLICYHOLDER
- BENEFICIARY
- DONOR
- VOLUNTEER
- TENANT
- OWNER_CLIENT
- DISTRIBUTOR
- RESELLER
- ALUMNI
- VIP
- OTHER

Cette capability ne signifie pas qu’un avantage est accordé automatiquement. Il faut toujours que l’entreprise publie un avantage dont l’audience ou l’attribution correspond et que toutes les règles serveur soient satisfaites.

## Resolver unique

`lib/enterprise/relationship-benefits/enforcement.ts` centralise l’évaluation.

Il vérifie :

- relation `ACTIVE`, compte exact, consentement et approbation ;
- organisation, module `RELATIONSHIP_BENEFITS` et entitlement ;
- audience `relationType` et `roleCode` ;
- attribution manuelle et son intervalle de validité ;
- statut et période de l’avantage ;
- `targetModuleCode` et entitlement du module cible ;
- devise ;
- `minimumAmount` ;
- conditions métier contrôlées ;
- limites totale et périodique ;
- contexte de l’opération ;
- révocation et concurrence.

Les conditions acceptées sont strictement bornées :

- canaux ;
- sites ;
- articles ;
- catégories ;
- jours de la semaine ;
- quantité minimale.

Toute clé inconnue est refusée. Il n’existe pas d’exécution de JSON arbitraire.

## Modes d’exécution

### Retail POS automatique

L’adaptateur automatique actuellement certifié concerne les avantages monétaires sur `RETAIL_POS` :

- remise en pourcentage ;
- remise en montant ;
- prix fixe.

Ils doivent avoir `actionCode = NONE` afin d’éviter une double demande.

Le POS :

1. résout le client actif côté serveur ;
2. retrouve toutes les relations actives liées au même `businessPartyId` ;
3. évalue chaque avantage éligible ;
4. calcule le ticket avec le moteur Retail canonique ;
5. applique la règle de cumul ;
6. affiche l’aperçu serveur avant encaissement ;
7. au moment de la vente, revérifie relation, businessParty, module, conditions et quotas dans la transaction ;
8. persiste la vente et l’usage `CONSUMED` avec la preuve `EnterpriseRetailSale` dans la même transaction sérialisable.

Une annulation de ticket passe l’usage automatique à `CANCELLED`, ce qui libère le quota.

Un avantage qui ramènerait le ticket à zéro est refusé tant que le POS exige un paiement strictement positif.

### Demandes / adaptateurs non encore certifiés

`REQUEST`, `CLAIM`, `BOOK` et `CONTACT` peuvent créer une demande **sans prétendre à une exécution transactionnelle**.

Une `targetModuleCode` n’est acceptée que lorsqu’un adaptateur serveur certifié sait produire l’effet. Dans ce hotfix, Retail POS est la seule cible automatique certifiée. Une cible métier non certifiée est refusée à la configuration au lieu de créer un avantage impossible à exécuter.

Les règles dépendant d’un montant minimum, d’un panier, d’un site, d’un canal, d’un article ou d’une catégorie sont elles aussi refusées sans adaptateur certifié.

Les demandes manuelles ne peuvent plus être marquées `CONSUMED` par un bouton administratif. Leur contrat public est `REQUESTED → APPROVED | REJECTED | CANCELLED`. Le statut `CONSUMED` exige une preuve structurée produite par un adaptateur serveur :

- module d’effet ;
- type d’entité ;
- identifiant d’entité ;
- clé d’idempotence d’effet ;
- horodatage d’exécution.

Les schémas API de demande et de décision sont stricts et n’acceptent pas de contexte transactionnel forgé par le navigateur.

## Contexte transactionnel de confiance

Le type interne `RelationshipBenefitExecutionContext` existe pour les adaptateurs serveur. Il n’est pas une preuve que le navigateur peut fournir.

- l’API compte n’accepte pas `context` dans une demande d’avantage ;
- l’API d’administration n’accepte pas `context` dans une décision ;
- une devise seule peut décrire la valeur d’un avantage manuel sans transformer cette valeur en contrainte transactionnelle ;
- `minimumAmount` et les conditions contrôlées exigent un adaptateur métier certifié ;
- les références de site, article et catégorie sont rechargées dans le même tenant lors de la configuration.

## Cumul avec Retail

Le moteur ne duplique pas `EnterpriseRetailPromotion`.

- avantage relationnel `stackable=true` : il peut s’ajouter aux promotions Retail dans la limite du montant éligible ;
- avantage relationnel non cumulable : il concurrence le résultat promotions + avantages cumulables ;
- le moteur choisit la meilleure réduction pour le client ;
- plusieurs avantages non cumulables ne se cumulent jamais ;
- aucun montant de remise ne peut dépasser le prix éligible.

## Fidélité et avoirs

Les points et stored value restent intégralement détenus par :

- `EnterpriseRetailLoyaltyAccount` ;
- `EnterpriseRetailStoredValueAccount`.

Le hotfix ne crée aucun second ledger et ne fait aucun dual-write.

La projection vers le compte global passe désormais aussi par l’entitlement Retail canonique, pas seulement par `isEnabled`.

## Désactivation administrative sûre

Une mise à jour **exclusivement** composée de `revision` et de
`status: SUSPENDED` ou `status: ARCHIVED` reste possible lorsque la
configuration d'origine n'est plus certifiable (adaptateur, devise,
références ou entitlement indisponibles). Il s'agit d'une transition
restrictive qui empêche de nouveaux usages ; elle n'exécute aucun effet métier.

Le schéma PATCH conserve les validations Zod des champs facultatifs mais
**ne réapplique aucune valeur par défaut de création** aux champs absents
(`assignmentMode`, `relationTypes`, `identityLinkIds`, `valueType`,
`actionCode`, `stackable`, `status`). Ceci évite la remise à zéro
silencieuse d'un avantage Retail existant lors d'un simple changement
de statut.

Toute réactivation (`ACTIVE`) et toute modification de configuration,
y compris une modification envoyée simultanément à une suspension,
passent toujours par la validation complète du module, de l'adaptateur,
de la devise et des conditions. Les permissions serveur et la révision
optimiste sont inchangées. Le parcours E2E de suspension après la vente
vérifie cette règle.

## Concurrence et idempotence

- demandes : transaction `Serializable` + advisory lock relation/avantage ;
- effets Retail : advisory lock et clé `effectIdempotencyKey` unique par vente/avantage ;
- le replay d’une vente déjà validée retourne les effets et promotions réellement persistés ; il ne rattache jamais un nouvel avantage issu d’un recalcul différent ;
- quotas recalculés sous verrou avant écriture ;
- une clé d’idempotence ne peut pas être réutilisée pour un autre compte, une autre relation ou un autre avantage ;
- chaque FK issue du navigateur est rechargée dans le même `organizationId`.

## Override Retail

Une dérogation manuelle de prix/remise/taxe conserve le parcours Retail historique mais désactive l’application automatique des avantages relationnels sur cette vente. Ce choix évite les doubles remises ambiguës et maintient la règle fail-closed.

## OWNER_E2E requis

Statut initial : **NOT_EXECUTED**.

1. Créer un avantage pour un type historiquement bloqué, par exemple `PROSPECT` ou `CONTRACTOR`, activer la relation et vérifier que l’avantage peut être résolu.
2. Tester une relation non ciblée : aucun avantage.
3. Tester audience, attribution manuelle et rôle.
4. Tester dates, devise et `minimumAmount`.
5. Tester condition canal, jour et quantité.
6. Créer un avantage Retail POS 10 % avec `actionCode=NONE`.
7. Sélectionner le client relié dans le POS et vérifier que l’aperçu serveur réduit réellement le total avant paiement.
8. Encaisser : le ticket doit contenir le total réduit et exactement un usage `AUTO_RETAIL / CONSUMED` lié au vrai `EnterpriseRetailSale`.
9. Rejouer la même vente/idempotence : aucun second usage.
10. Rejouer une vente où un avantage non cumulable avait exclu une promotion : le replay ne doit ni ajouter une autre relation éligible entre-temps, ni créer une promotion absente du ticket original.
11. Annuler la vente : usage relationnel `CANCELLED` et quota à nouveau disponible.
12. Tester promotion Retail + avantage cumulable.
13. Tester promotion Retail + avantage non cumulable : pas de double remise, meilleur résultat uniquement.
14. Tester quota total et périodique, puis deux tentatives concurrentes.
15. Révoquer la relation puis retenter : aucun nouvel effet.
16. Tester un `businessPartyId`, `identityLinkId`, site ou article d’un autre tenant : refus ou absence d’effet, sans fuite.
17. Tester un avantage `BOOK` ou `CLAIM` sans cible automatique : il peut rester une demande, mais l’admin ne dispose d’aucun bouton permettant de le déclarer consommé.
18. Tenter de configurer une cible métier sans adaptateur certifié : refus explicite.
19. Tenter d’envoyer un `context` transactionnel forgé depuis l’API compte ou décision : validation stricte en erreur 400.
20. Tester une condition JSON inconnue : refus à la création.
21. Vérifier que fidélité et avoirs Retail n’ont pas été dupliqués ni modifiés par le moteur d’avantages.
22. Vérifier FR/EN, clair/sombre, 320/360/375/390/414/768/1024 px et clavier mobile.

Aucune fusion ne doit présenter cet E2E comme exécuté avant confirmation du propriétaire.
