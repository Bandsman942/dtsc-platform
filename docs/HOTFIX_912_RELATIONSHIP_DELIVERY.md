# Hotfix P0 #912 — Avantage relationnel DELIVERY adossé aux livraisons Sales

Parent : #886 / #785 · Baseline : `main@1b3a964831c3b711adf96ee8eaae426b5dbe60dd`.

## Contrat fonctionnel

DELIVERY représente un **service non monétaire**, et non une remise sur les frais de livraison. La configuration requise est : `DELIVERY`, `valueType=NONE`, `targetModuleCode=SALES_QUOTES_ORDERS`, `actionCode=REQUEST`, sans montant, devise, conditions ou cumul. L'entreprise doit avoir le module de commandes et livraisons actif et autorisé.

- Le bénéficiaire n'est reconnu que par une relation DTSC active, consentie et approuvée. La relation ne donne aucun droit ERP ni membership interne.
- Le membre soumet une demande ordinaire `REQUESTED` ; le quota reste réservé pour les autres demandes. Le responsable l'approuve, sans qu'aucune livraison soit réputée faite à ce stade.
- L'administrateur habilité recherche la **référence de livraison réelle** `FUL-...` dans le module Commandes & livraisons et l'inscrit dans la demande approuvée.
- L'API vérifie que la livraison est une `EnterpriseFulfillment` de type `PRODUCT_DELIVERY`, statut `COMPLETED`, liée à une commande `EnterpriseSalesOrder` du même tenant en statut `FULFILLED`, terminée **après l'approbation**.
- Une preuve `EnterpriseDocument` `ACTIVE`, versionnée et liée à cette commande est obligatoire (une simple case « accepté par le client » ne suffit pas). Une commande avec retour Retail omnicanal déjà confirmé est refusée.
- Le tiers `EnterpriseSalesOrder.businessPartyId` doit être relié de façon explicite et active à `EnterpriseIdentityLink.personIdentityId`. Aucune correspondance par email, nom ou téléphone.
- Le contrôleur ne peut être ni le bénéficiaire ni le collaborateur qui a effectué la livraison. Les permissions `RELATIONSHIP_BENEFITS/manage` et `SALES_QUOTES_ORDERS/write` sont vérifiées séparément côté serveur.
- Une transaction `SERIALIZABLE` revalide le statut, la relation, l'audience, l'attribution, les limites, le montant et la devise du contexte Sales, puis enregistre l'unique effet `EnterpriseFulfillment` et passe `APPROVED → CONSUMED`.
- Une nouvelle tentative avec la même référence et le même avantage est idempotente. Une preuve réutilisée par une autre demande provoque un conflit. Les événements financiers, stocks, commandes ou livraisons ne sont **jamais écrits depuis le module Avantages**.

## Cas de non-acceptation

| Cas | Comportement attendu |
|---|---|
| Commande partiellement livrée / annulée / archivée | Refus 409 |
| Livraison d'un autre client ou d'un autre tenant | Refus |
| Preuve absente, brouillon, non versionnée ou hors commande | Refus 409 |
| Livraison réalisée avant approbation | Refus 409 |
| Relation révoquée / attribution retirée / module désactivé | Refus |
| Même membre, même preuve, replay | Aucune consommation supplémentaire |
| Autre demande / même preuve et même avantage | Conflit |
| Validation par le livreur ou le bénéficiaire | Refus 403 |
| Confirmation uniquement par note ou bouton client | Aucun statut CONSUMED |

## QA et preuve

`pnpm qa:hotfix-912` valide le câblage contractuel de manière **structurelle** (ne prouve pas le scénario en base). Le script est inclus dans `qa:regression`. Les suites `qa:hotfix-886`, `qa:hotfix-908`, `qa:hotfix-906` et `qa:regression` doivent rester vertes. L'E2E dans un PostgreSQL isolé doit créer une relation consentie, un avantage, une commande avec document et livraisons partielles/complètes, puis prouver tous les refus et l'idempotence réelle. Vérifier également la présence des deux permissions distinctes, FR/EN, 320/360/375/390/414/768/1024 px et thèmes.

**OWNER_E2E #912 : NON EXÉCUTÉ** jusqu'à confirmation explicite du propriétaire. Aucun merge, aucune Preview, aucun déploiement Production avant preuves et revue.

## Dette & hors scope

- Créée : aucune table ni source de vérité parallèle.
- Conservée : #886 / #785 ouverts ; certification 22 relations et extension des types de bénéfices économiques au canal omnicanal à réaliser séparément.
- Limitation assumée : la saisie de référence est explicite et validée côté serveur ; une future combobox de recherche de livraisons via API paginée pourra améliorer l'ergonomie, sans contourner la preuve.
- Hors scope : frais d'expédition, transporteur/géolocalisation, calcul de remise, nouveaux paiements/avoirs, création de commande ou d'événement logistique à partir d'une demande, reprise a posteriori d'une livraison déjà payée/remboursée, automaticité.

## Rollback

Désactiver les nouvelles créations d'avantages DELIVERY puis revert applicatif via PR. Les preuves documentaires, opérations Sales canoniques, audits et lignes de consommation sont conservés. Aucun DROP, backfill ou réécriture de journal financier. Les anciens avantages DELIVERY de type demande manuelle restent lisibles ; ils ne se convertissent pas implicitement en effets attestés.
