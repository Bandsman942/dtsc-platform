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
- approuver, refuser ou marquer une demande comme utilisée.

## Compte global

Route existante : `/enterprise-links`

Le détail d’une relation active charge la façade :

`/api/account/enterprise-relationships/[organizationId]/benefits`

Elle renvoie uniquement les capacités résolues, les avantages autorisés, l’historique des demandes du membre et, lorsque Retail est actif, la projection des vrais points et avoirs du client relié. Une demande encore en attente ou approuvée mais non consommée peut être annulée par son propriétaire ; le serveur revalide l’utilisateur, la relation, le tenant et la révision.

## Révocation

Dès que `EnterpriseIdentityLink.status` n’est plus `ACTIVE`, le résolveur ne retourne plus d’avantage utilisable. Les usages déjà enregistrés restent dans l’historique.

## OWNER_E2E requis

Statut initial : **NOT_EXECUTED**.

1. Dans une entreprise BUSINESS ou supérieure, ouvrir **Relations & avantages**.
2. Créer un avantage automatique ciblant `CUSTOMER`, le publier, puis vérifier sa présence dans le catalogue.
3. Depuis un compte global possédant une relation `CUSTOMER` active et approuvée, ouvrir **Relations avec les entreprises** puis le détail de l’entreprise.
4. Vérifier l’affichage de l’avantage et l’absence d’accès au tenant ERP.
5. Appuyer sur l’action de l’avantage ; vérifier toast succès et création d’une demande unique.
6. Rejouer volontairement la même clé idempotente via le scénario E2E : aucune seconde demande ne doit être créée.
7. Créer une deuxième demande puis l’annuler côté compte global ; vérifier qu’elle passe à `CANCELLED`, qu’elle n’est plus comptée dans le quota et qu’une autre personne ne peut pas l’annuler.
8. Côté entreprise, approuver puis marquer la première demande comme utilisée ; vérifier notification et état côté client.
9. Vérifier que le quota restant diminue pour les usages actifs/consommés et se rétablit après annulation/refus.
10. Révoquer la relation ; l’avantage doit disparaître ou devenir inaccessible immédiatement.
11. Tester un identifiant `identityLinkId`, `benefitId` ou `usageId` d’un autre tenant/utilisateur : refus sûr sans fuite.
12. Avec une entreprise Commerce Retail, vérifier que points et avoirs proviennent des comptes Retail existants et qu’aucun second ledger n’est créé.
13. Vérifier l’aperçu des capacités résolues (services/documents) sans lien vers un workspace tenant non autorisé.
14. Vérifier 320/360/390/414 px, desktop, clair/sombre, FR/EN et clavier mobile.

La fusion ne doit pas présenter cet E2E comme exécuté tant que le propriétaire ne l’a pas confirmé.
