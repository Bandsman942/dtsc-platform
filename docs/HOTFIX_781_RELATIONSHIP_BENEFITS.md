# Hotfix #781 — Relations & avantages

## Objectif

Le hotfix transforme **Relations avec les entreprises** en façade relationnelle exploitable sans donner au membre un accès au tenant ERP. L’entreprise peut créer des avantages, définir les relations éligibles, traiter les demandes et laisser le serveur recalculer l’éligibilité à chaque action.

## Sources de vérité

- `EnterpriseIdentityLink` reste la source canonique du consentement et de l’état de la relation.
- `RELATIONSHIP_BENEFITS` est le module canonique de gestion du catalogue.
- `EnterpriseRelationshipBenefit*` porte uniquement le catalogue, le ciblage et les usages relationnels.
- Retail conserve ses propres ledgers : `EnterpriseRetailLoyaltyAccount` et `EnterpriseRetailStoredValueAccount` sont lus mais jamais dupliqués.
- Une relation active ne crée jamais un `OrganizationMember`.

## Résolution serveur

Le chemin client est :

```text
User
→ EnterpriseIdentityLink ACTIVE
→ consentement utilisateur + approbation entreprise
→ organisation CLIENT active
→ module RELATIONSHIP_BENEFITS actif
→ abonnement / plan / entitlement
→ audience ou attribution explicite
→ fenêtre de validité
→ quotas
→ avantage affichable / utilisable
```

La même résolution est répétée lors d’une demande d’utilisation. Une carte déjà rendue dans le navigateur n’est jamais une autorisation.

## Administration entreprise

Route : `/enterprise-relationship-benefits`

### Hotfix de découvrabilité #783

Le workspace est accessible depuis **Entreprise & ERP → Relations & avantages**, depuis **Administration entreprise → Relations & avantages**, ainsi que depuis l’action **Ouvrir le module** de la carte correspondante. Ces entrées utilisent toutes la destination canonique résolue côté serveur et ne sont pas affichées lorsque le module n’est pas autorisé.

L’administrateur autorisé peut :

- créer un avantage FR/EN ;
- choisir le type, la valeur, l’action client et la période ;
- cibler automatiquement des types de relation ;
- attribuer explicitement un avantage à des relations actives ;
- combiner ciblage automatique et attribution manuelle ;
- définir des limites totales et périodiques ;
- publier, suspendre ou archiver ;
- approuver ou refuser une demande ; depuis le hotfix #786, le statut « appliqué/consommé » exige une preuve métier serveur et ne peut plus être forcé manuellement.

### Hotfix d’enforcement #786

Le catalogue s’appuie désormais sur un resolver serveur unique. Les 22 types de relation ont un contrat explicite d’avantages. `minimumAmount`, devise, conditions contrôlées, module cible, cumul et quotas sont évalués au serveur. Retail POS possède le premier adaptateur d’effet transactionnel : une remise/prix fixe compatible modifie réellement le ticket et écrit un usage lié à la vente. Une cible métier sans adaptateur certifié est refusée à la configuration. Les avantages manuels sans cible transactionnelle restent des demandes et ne peuvent pas être marqués consommés sans preuve métier.

## Compte global

Route existante : `/enterprise-links`

Le détail d’une relation active charge la façade :

`/api/account/enterprise-relationships/[organizationId]/benefits`

Elle renvoie uniquement les capacités résolues, les avantages autorisés, l’historique des demandes du membre et, lorsque Retail est actif, la projection des vrais points et avoirs du client relié. Une demande encore en attente ou approuvée mais non consommée peut être annulée par son propriétaire ; le serveur revalide l’utilisateur, la relation, le tenant et la révision.

## Révocation

Dès que `EnterpriseIdentityLink.status` n’est plus `ACTIVE`, le résolveur ne retourne plus d’avantage utilisable. Les usages déjà enregistrés restent dans l’historique.

## OWNER_E2E requis

La certification #781 est désormais consolidée par le scénario renforcé de **#786** dans `docs/HOTFIX_786_RELATIONSHIP_BENEFITS_ENFORCEMENT.md`.

Statut : **NOT_EXECUTED** tant que le propriétaire ne l’a pas confirmé. Aucune fusion ne doit présenter cet E2E comme exécuté sur la seule base d’une QA statique ou d’une CI.
