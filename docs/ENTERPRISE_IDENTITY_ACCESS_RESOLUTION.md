# Résolution des avantages liés à une relation DTSC

Le service `resolveEnterpriseIdentityRelationshipAccess()` est l’unique point de décision pour les avantages issus d’une relation.

Une décision positive exige : entreprise cliente active, utilisateur correspondant, liaison `ACTIVE`, consentement utilisateur, approbation entreprise, date d’activation, modules actifs et droits d’abonnement. Une relation en attente, refusée, expirée, annulée ou révoquée ne retourne aucune capacité.

Les capacités sont extensibles : résumé de relation, notifications ciblées, documents partagés, services client, fournisseur, employé, collaborateur et avantages d’entreprise. Le frontend consomme cette décision serveur et ne déduit pas les accès à partir du seul statut.
