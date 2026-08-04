# Modèle canonique de pilotage et de gouvernance d’entreprise

**Itération :** Modules standards 06/08  
**Date :** 5 août 2026  
**Statut :** implémenté, E2E propriétaire non exécuté

## 1. Autorités de données

DTSC Platform conserve une seule autorité par concept. Les budgets décrivent des enveloppes, hypothèses, scénarios, versions, seuils et prévisions. Ils ne créent ni écritures comptables, ni factures, ni paiements, ni paie, ni mouvements de stock. Les montants réels et engagés sont calculés depuis les services ERP canoniques déjà consolidés.

| Concept | Source canonique | Propriétaire | Mutation | Confidentialité |
|---|---|---|---|---|
| Organisation et membership | `Organization`, `OrganizationMember` | Administration entreprise | Services d’organisation | Interne tenant |
| Budget | `EnterpriseBudget` | Responsable budgétaire | Service Finance entreprise | Finance tenant |
| Version/scénario | relation parent/enfants de `EnterpriseBudget` | Responsable + validateur | Révision contrôlée | Finance tenant |
| Ligne budgétaire | `EnterpriseBudgetLine` | Responsable budgétaire | Budget non gelé | Finance tenant |
| Engagement | moteurs achats/demandes/contrats autorisés | Domaine ERP source | Domaine source | Finance tenant |
| Réalisé | dépenses et moteurs ERP canoniques | Finance/Comptabilité | Domaine source | Finance tenant |
| Prévision | budget/version | Responsable ou modèle identifié | Budget révisable | Finance tenant |
| Alerte | `EnterpriseBudgetAlert` | Politique budgétaire | Dédupliquée par règle/période | Finance tenant |
| Indicateur | registre `METRIC_DEFINITIONS` | Produit DTSC | Code versionné | Métadonnée produit |
| Rapport | `EnterpriseReport` + catalogue | Utilisateur autorisé | Service reporting | Selon source |
| Vue enregistrée | `EnterpriseReportView` | Utilisateur ou organisation | Service tenant-scoped | Personnelle/partagée |
| Département | `EnterpriseDepartment` | Admin entreprise | API administration | Interne tenant |
| Poste | `EnterprisePosition` | Admin entreprise | API administration | Interne tenant |
| Rôle d’organisation | `EnterpriseOrganizationRole` | Admin autorisé | API RBAC | Sécurité tenant |
| Permission | registre de capacités + rôles/postes | Produit + admin | Résolveur serveur | Sécurité tenant |
| Politique de sécurité | `EnterpriseOrganizationSecurityPolicy` | Admin sécurité | API sécurisée | Critique |
| Audit | `AuditLog` canonique | Plateforme | append-only logique | Restreint |
| Maturité commerciale | registre standard + preuves/transitions | Administration DTSC | Service canonique | Interne DTSC |

## 2. Budget, version et scénario

Un budget appartient obligatoirement à une organisation. Il possède un exercice, une période, une devise, un scénario, un numéro de version, un responsable, des contributeurs et validateurs, un statut et un historique. Une révision utilise `CREATE_REVISION`, clone les lignes et conserve `parentBudgetId` ; elle ne modifie jamais silencieusement la version approuvée ou gelée.

Scénarios supportés : `BASE`, `CONSERVATIVE`, `OPTIMISTIC`, `REVISED`, `CUSTOM`. Les comparaisons n’ont de sens que sur un périmètre, une période et une devise compatibles.

## 3. Formules centralisées

Le registre `lib/enterprise/reporting/metric-registry.ts` est l’autorité pour les formules communes :

- `budget = planned` ;
- `engagé = committed` ;
- `réalisé = actual` ;
- `disponible = budget - engagé - réalisé` ;
- `écart = budget - réalisé` ;
- `taux de consommation = réalisé / budget × 100`, avec traitement explicite d’un budget nul.

L’API, les workspaces et les exports consomment les mêmes résultats. Une absence de données n’est pas remplacée par zéro sans politique explicite.

## 4. Sources, fraîcheur et devises

Chaque rapport retourne source, unité, méthode d’arrondi et `freshnessAt`. Une conversion de devise doit réutiliser le moteur de devises existant et conserver devise source, devise cible, taux, date du taux et arrondi. La présente itération n’introduit aucun second moteur de change.

## 5. Relations canoniques

Les relations utilisent des identifiants : organisation, département, projet, site, responsable, compte ou groupe comptable autorisé. Les rapprochements par libellé, nom ou adresse e-mail sont interdits lorsqu’une relation canonique existe.

## 6. Accès

Toute lecture ou mutation vérifie session, organisation, membership actif, module, rôle, poste, permission, plan, capacité, objet, statut et propriété. Les rôles personnalisés sont agrégés au résolveur d’accès canonique. Le frontend n’est qu’une représentation de la décision serveur.

## 7. Audit et observabilité

Les événements sensibles enregistrent, selon disponibilité : `requestId`, `userId`, `organizationId`, action, objet, résultat, `reasonCode`, niveau de risque, ancien état, nouvel état et métadonnées autorisées. Secrets, mots de passe, OTP, tokens et données de carte sont exclus.
