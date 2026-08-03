# Modèle abonnement et capacités

## Chaîne de décision

```text
catalogue plan
+ abonnement
+ statut et période
+ limites
+ module configuré
+ entitlement
+ permission
= capacité serveur
```

## Sources

- `BillingPlan` : catalogue personnel canonique ;
- `Subscription`, `Payment`, `Invoice` : facturation personnelle SaaS ;
- `OrganizationSubscription`, `BillingRecord` : abonnement d’organisation ;
- `lib/billing/entitlements.ts` : décision serveur ;
- `UsageLog` et `KnowledgeDocument` : consommation réelle.

## Séparation ERP

Les factures et paiements SaaS ne sont jamais les factures clients, fournisseurs, ventes, achats ou écritures comptables ERP.

## États

Les valeurs réellement stockées sont affichées avec un libellé professionnel. Un abonnement manquant produit un état gratuit ou absent selon le contexte, jamais un faux abonnement actif.

## Actions commerciales

Une action de paiement ou de changement de plan n’est présentée que lorsque le fournisseur est configuré. Le serveur reste responsable de l’idempotence, du statut et des limites.

## Dépassement

Le frontend présente l’utilisation, la limite, le reste et la période. Il ne décide jamais seul d’autoriser une opération au-delà de la limite.
