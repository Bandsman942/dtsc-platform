# Résolution des avantages liés à une relation DTSC

Le service `resolveEnterpriseIdentityRelationshipAccess()` est l’unique point de décision pour les avantages issus d’une relation.

Une décision positive exige : entreprise cliente active, utilisateur correspondant, liaison `ACTIVE`, consentement utilisateur, approbation entreprise, date d’activation, modules actifs et droits d’abonnement. Une relation en attente, refusée, expirée, annulée ou révoquée ne retourne aucune capacité.

Les capacités sont extensibles : résumé de relation, notifications ciblées, documents partagés, services client, fournisseur, employé, collaborateur et avantages d’entreprise. Le frontend consomme cette décision serveur et ne déduit pas les accès à partir du seul statut.


## Enforcement d’un avantage

`ENTERPRISE_BENEFITS` autorise la résolution du catalogue, pas un accès ERP implicite et pas une consommation automatique.

Le parcours autoritatif est :

```text
resolveEnterpriseIdentityRelationshipAccess()
→ evaluateRelationshipBenefitSnapshot()
→ adaptateur métier certifié
→ transaction métier
→ preuve d’effet / ledger
```

Les 22 types de relation configurables ont un contrat explicite `ENTERPRISE_BENEFITS`. Le module `RELATIONSHIP_BENEFITS` et son entitlement doivent néanmoins rester autorisés.

Les montants minimums et conditions transactionnelles ne sont pas acceptés comme vérité depuis le navigateur. Ils nécessitent un adaptateur serveur certifié. Retail POS est le premier adaptateur disponible.
