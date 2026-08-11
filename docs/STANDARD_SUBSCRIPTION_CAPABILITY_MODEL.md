# Modèle abonnement et capacités

## Terminologie canonique

DTSC distingue désormais explicitement trois notions qui ne doivent plus être présentées sous le même mot « plan » :

- **Offre commerciale** : ligne `BillingPlan` administrable et versionnée, par exemple `Découverte`, `Organisation Croissance` ou `Organisation Premium`.
- **Abonnement** : instance qui relie un utilisateur ou une organisation à une offre (`Subscription` ou `OrganizationSubscription`) avec statut et période.
- **Niveau de capacité** : classe technique dérivée `STARTER | BUSINESS | ENTERPRISE`, présentée en français comme **Essentiel | Professionnel | Entreprise**. Ce niveau pilote les exigences de modules et fonctionnalités ; il n’est pas le nom de l’offre achetée.

Une même personne peut donc avoir une offre personnelle `Découverte` et travailler simultanément dans une organisation dont l’offre est `Organisation Premium`. Le contexte actif détermine l’autorité commerciale applicable.

## Chaîne de décision

```text
catalogue d’offres BillingPlan
+ audience PERSONAL / ORGANIZATION / BOTH
+ abonnement du contexte actif
+ statut et période
+ résolution canonique lib/billing/commercial-context.ts
+ niveau de capacité
+ limites
+ module configuré
+ entitlement
+ permission
= capacité serveur
```

## Sources de vérité

- `BillingPlan` : catalogue commercial canonique pour les offres personnelles et d’organisation ;
- `Subscription` : abonnement personnel ;
- `OrganizationSubscription` : abonnement de l’organisation active ;
- `lib/billing/commercial-context.ts` : résolution canonique offre → abonnement → niveau de capacité selon le contexte ;
- `lib/billing/plans.ts` : taxonomie et ordre des niveaux `STARTER | BUSINESS | ENTERPRISE` ;
- `lib/billing/plan-limits.ts` : limites de capacité générales par niveau ;
- `lib/billing/entitlements.ts` : décision serveur modules/fonctionnalités ;
- `lib/billing/ai-usage-limits.ts` : projection des limites IA depuis le contexte commercial canonique ;
- `UsageLog` et `KnowledgeDocument` : consommation réelle.

Le fichier `config/billing-plans.bootstrap.json` sert uniquement à initialiser les offres manquantes. Une fois créées, les lignes `BillingPlan` en base restent l’autorité administrable. Les anciens quotas `User.dailyMessageLimit` / `User.dailyTokenLimit` ne sont qu’un repli personnel historique, sauf pour le contexte interne DTSC où ils restent les limites administrées par membre.

## Priorité par contexte

### Organisation cliente

Le serveur utilise exclusivement l’abonnement de l’organisation active. Il ne retombe jamais sur l’abonnement personnel ou l’offre freemium d’un membre pour déterminer les quotas IA ou le niveau commercial du tenant.

Une référence historique d’`OrganizationSubscription` vers les anciennes offres personnelles `freemium`, `starter`, `growth` ou `premium` est résolue vers l’offre organisation équivalente et réparée par migration :

- `freemium` / `starter` → `org-starter` ;
- `growth` → `org-growth` ;
- `premium` → `org-premium`.

Si aucune offre organisation valide n’existe, le contexte organisation reste fail-closed pour les quotas IA : aucune capacité personnelle n’est empruntée silencieusement.

### Compte personnel

Le serveur utilise d’abord un abonnement personnel actif et dans sa période, puis l’offre `freemium` active. Les anciens quotas du profil utilisateur ne servent qu’en dernier repli de compatibilité.

### DTSC interne

Le contexte `DTSC_INTERNAL` conserve le niveau de capacité `ENTERPRISE`. Les quotas messages/tokens sont les valeurs du membre administrées dans la Console DTSC et ne sont pas confondus avec un abonnement client.

## Séparation ERP

Les factures et paiements SaaS ne sont jamais les factures clients, fournisseurs, ventes, achats ou écritures comptables ERP.

## États

Les valeurs réellement stockées sont affichées avec un libellé professionnel. Un abonnement manquant produit un état gratuit ou absent selon le contexte, jamais un faux abonnement actif.

## Actions commerciales

Une action de paiement ou de changement d’offre n’est présentée que lorsque le fournisseur est configuré. Le serveur reste responsable de l’idempotence, du statut, de l’audience de l’offre et des limites.

## Dépassement

Le frontend présente l’utilisation, la limite, le reste et la période. Il ne décide jamais seul d’autoriser une opération au-delà de la limite.
