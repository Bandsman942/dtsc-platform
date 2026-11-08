# RETAIL #1044 — Activation sécurisée par entreprise

**Statut :** candidat v1.4.0 sur branche dédiée. **L'OWNER_E2E de #1044 n'est pas encore validé.** Pas de Preview Vercel ni de déploiement depuis la branche. Aucun flag activé par défaut.

## Accès dans l'application

1. Ouvrir l'entreprise cliente ayant le secteur canonique `COMMERCE_RETAIL`, son module ERP **Shop / Point de vente** (`/enterprise-modules/RETAIL_POS`). L'abonnement doit autoriser le module.
2. Dans **Outils complémentaires → Mise en service & équipements du Shop**, terminer la checklist **Mise en service du Shop**.
3. Dans **Activation des fonctionnalités avancées**, seul un `OWNER`, `ADMIN_ENTREPRISE` ou `ADMIN_ENTERPRISE` ayant son appartenance active et la permission `RETAIL_POS.manage` peut basculer un flag. Les employés non administrateurs n'ont ni panneau ni droit API.
4. Suivre chaque lien de prérequis (boutiques/dépôts, comptes Finance, équipe et affectations). **Activer d'abord l'accès cloisonné par boutique**, puis **Facturation et encaissement RETAIL**.
5. Renseigner **un motif de 8 à 500 caractères**, confirmer par le mot de passe DTSC et, si configuré, le code MFA ou de récupération. Valider le dialogue. Les valeurs ne sont pas conservées dans les audits.
6. Lire le résultat et l'historique paginé. Recharger si un autre administrateur a modifié la révision.

Ces interrupteurs pilotent les capacités issues de la PR #1043 ; ils **ne** remplacent **pas** les réglages de souscription SaaS, de modules ERP, de pays, de Mobile Money, des ventes POS classiques ou de TELCO.

## Contrôles de préparation

| Code | Condition requise |
| --- | --- |
| `RETAIL_ACTIVE` | Entreprise `CLIENT` active du secteur `COMMERCE_RETAIL` et configuration Retail active. |
| `SITES_CONFIGURED` | Au moins une boutique active, maximum opérationnel de 100 dans le panneau. |
| `WAREHOUSES_PER_SITE` | Au moins un dépôt actif tenant-scoped dans chaque boutique. |
| `ACCOUNTS_PER_SITE` | Un compte Finance actif dans chaque boutique et dans la devise Retail/Finance choisie, avec compte du grand livre actif. |
| `STAFF_PER_SITE` | Au moins une affectation active par boutique avec `VIEW_SALES`. |
| `INVOICERS_PER_SITE` | Au moins une affectation active par boutique avec `PREPARE_INVOICE`. |
| `CASHIERS_PER_SITE` | Au moins une affectation active par boutique avec `COLLECT_PAYMENT`. |
| `FINANCE_READY` | Contrôleur Finance canonique POSTING OK et configuration `READY` : comptes, mappings, journaux, périodes et fiscalité requis. |
| `ISOLATION_ACTIVE` | Cloisonnement déjà activé avant la facturation. |

Les affectations sont évaluées sur leur **capacité réellement accordée** (y compris overrides), pas simplement sur le titre du rôle. Limites du panneau de préparation : 100 boutiques, 1 000 dépôts, 1 000 comptes et 1 000 affectations ; au-delà, la vérification échoue fermée et un accompagnement est requis avant activation.

## API et sécurité

- `GET /api/enterprise/:organizationId/retail/feature-activation?page=N` renvoie `{revision, flags, checks, prerequisites, counts, history, historyPagination}` ; page bornée et réponse privée `no-store`.
- `POST /api/enterprise/:organizationId/retail/feature-activation` accepte exclusivement `{feature:"siteStaffIsolationEnabled"|"invoiceCheckoutEnabled", enabled:boolean, revision:number, reason:string}`. Validation Zod stricte, module/RBAC tenant-scoped, same-origin, limitation de débit et step-up récent (5 minutes) obligatoire. `428 STEP_UP_REQUIRED` est audité.
- La transaction Prisma `SERIALIZABLE` verrouille la configuration, recalcule les prérequis côté serveur, compare `revision` et incrémente celle-ci. Le JSON existant est fusionné sans écraser les autres paramètres. L'audit `AuditLog` (`CRITICAL`, état avant/après, acteur, justification) est créé **dans la même transaction**. En cas de conflit ou d'erreur d'audit, l'activation est annulée ; `409` renvoie une erreur métier explicite.
- Si le module est masqué côté client, les contrôles serveur continuent d'interdire les mutations ; aucune donnée d'une autre entreprise n'est accessible.

## Retour arrière sûr

- **Facturation OFF :** impossible lorsqu'il existe des factures Retail liées non soldées (ou payées mais dont le stock n'a pas été posté), des demandes de retour non finalisées, ou des propositions Finance en attente.
- **Cloisonnement OFF :** impossible si la facturation est encore active ou s'il reste un collaborateur non propriétaire/admin actif dans l'entreprise ; cela évite le retour à une lecture historique inter-boutiques.
- Les deux désactivations requièrent également la justification et le step-up MFA ; aucun script de rollback aveugle sur `settingsJson` n'est autorisé.

## Validation et limites

1. `pnpm qa:hotfix-1044-retail-activation` : défaut OFF, tenant croisé, ordre d'activation, affectations, Finance non prêt, révision périmée, no-op, blocage des retours, audit et i18n.
2. `pnpm qa:hotfix-1042-site-staff`, `pnpm qa:hotfix-1042-retail`, `pnpm qa:regression`, `pnpm type-check`, lint et build, ainsi que Quality Gates GitHub sur le SHA final.
3. **OWNER_E2E à demander avant merge** avec une entreprise de test réellement configurée : non-admin voit 403 ; propriétaire constate OFF ; essai incomplet est refusé sans effet ; attribution staff, compte et Finance ; activation isolation puis facturation ; facturier et caissier n'accèdent qu'aux boutiques autorisées ; mot de passe/MFA erroné est refusé ; historique/révision cohérents ; désactivation bloquée avec opération ouverte ; exercice de retour arrière uniquement sur tenant synthétique sans personnel.
4. L'E2E #1043 historique ne vaut pas E2E #1044. Après E2E #1044 BON : fusion autorisée sur `main` et déploiement Vercel Production **uniquement depuis main**.

Pas de migration Prisma pour #1044 : les deux flags résident dans `EnterpriseRetailConfiguration.settingsJson` préexistant, avec `revision` et `AuditLog` existants.
