# Checklist QA — Clôture du programme de stabilisation ERP #167

Issue de clôture : #173

Cette checklist complète `pnpm qa:regression`, le workflow `Accounting onboarding & production-like acceptance` et les Quality Gates GitHub. Elle vise les régressions transverses identifiées par le programme #167 ; elle ne constitue pas une certification réglementaire ou fiscale.

## 1. Autorités canoniques

- [ ] `resolveEnterpriseFinanceReadiness()` reste l'unique autorité de readiness Finance/comptabilité.
- [ ] L'onboarding Finance consomme les diagnostics serveur et ne reconstruit pas sa checklist depuis des clés locales.
- [ ] `resolveEnterpriseModuleAccess()` / `resolveEnterpriseModuleCapabilities()` restent l'autorité RBAC des modules ERP.
- [ ] `lib/enterprise/accounting/access.ts` ne contient ni `ENTERPRISE_MANAGER_ROLES`, ni décision locale concurrente.
- [ ] `MANAGER` n'obtient jamais `canManage` sans permission explicite.
- [ ] Les aliases ERP sont normalisés avant la décision d'accès.
- [ ] Le posting passe uniquement par le registre et le service Finance communs ; aucun ledger sectoriel parallèle n'existe.

## 2. Finance neuf et Finance historique

- [ ] Tenant neuf : onboarding Finance FR mobile puis EN tablette jusqu'à l'état prêt.
- [ ] Tenant existant avec écritures `POSTED` : les lectures restent cohérentes et aucune écriture historique n'est modifiée.
- [ ] Une écriture `POSTED` est immutable ; correction par contrepassation/avoir selon le domaine.
- [ ] Période `CLOSED`/`LOCKED` : mutation normale refusée.
- [ ] Clôture : un Payroll `APPROVED` bloque tant que son écriture `PAYROLL_APPROVED` n'est pas `POSTED` ; une paie déjà comptabilisée ne crée pas de faux blocker.
- [ ] Idempotence : une même opération ne génère jamais deux postings.

## 3. RBAC

Tester au minimum OWNER, ADMIN_ENTREPRISE/ADMIN_ENTERPRISE, MANAGER, MEMBER et GUEST :

- [ ] lecture du module ;
- [ ] création/soumission ;
- [ ] modification ;
- [ ] approbation ;
- [ ] gestion ;
- [ ] données sensibles ;
- [ ] accès direct par URL/API ;
- [ ] règle d'acteur indépendant sur les validations sensibles.

## 4. Convergence cross-module vers Finance

- [ ] Sales → `SALES_INVOICE_POSTED` équilibré et idempotent.
- [ ] Procurement → `SUPPLIER_INVOICE_POSTED` équilibré, payable cohérent et idempotent.
- [ ] Payroll → `PAYROLL_APPROVED` équilibré et idempotent.
- [ ] Inventory → réception/sortie valorisées via le moteur commun.
- [ ] Assets → capitalisation/amortissement via le moteur commun.
- [ ] Retail → vente/retour via les behavioral gates Shop 2 et le registre Finance commun.
- [ ] Health → événements financiers adaptés vers les événements Finance communs, sans ledger clinique.
- [ ] Pharmacy → ventes/achats/stocks adaptés vers Finance/Inventory communs, sans ledger pharmacie.

## 5. Erreurs, KPI et projections

- [ ] Une erreur API n'est jamais affichée comme un KPI métier égal à zéro.
- [ ] Les KPI indisponibles affichent `Indisponible` / `Unavailable`.
- [ ] Une projection `FAILED` expose un état client-safe, reste observable et retryable.
- [ ] Une reprise réussie ne duplique ni objet cible ni posting.
- [ ] Les messages techniques sensibles ne sont pas exposés au client.

## 6. Multi-tenant hostile

- [ ] Une référence d'organisation B envoyée depuis A est refusée côté serveur.
- [ ] Une clé étrangère Finance appartenant à B est refusée dans A.
- [ ] Aucun journal, facture, paiement, compte, période, projection ou document privé de B n'est visible depuis A.
- [ ] Un changement manuel d'URL ne contourne ni membership, ni module, ni entitlement, ni permission.

## 7. UI, i18n et appareils

- [ ] FR et EN affichent les statuts, diagnostics et erreurs métier sans enum brute.
- [ ] Mobile 390 px : onboarding, overview, listes et actions Finance utilisables sans débordement.
- [ ] Tablette : navigation et formulaires cohérents.
- [ ] Desktop : capacités et états dégradés cohérents avec l'API.
- [ ] Retour depuis les modules spécialisés vers la Vue d'ensemble recharge la readiness persistée.

## 8. Auth, session et sous-domaines

- [ ] `account` → login → `app` conserve une session valide.
- [ ] Console reste réservée à `DTSC_INTERNAL`.
- [ ] App, Support et Account n'exposent pas la Console par erreur.
- [ ] Logout expire correctement la session partagée en Production.
- [ ] Aucun changement #173 ne modifie le contrat SSO ou middleware sans test dédié.

## 9. Commandes et CI obligatoires

- [ ] `git diff --check`.
- [ ] `git diff --cached --check` lorsque pertinent.
- [ ] `pnpm prisma:generate`.
- [ ] migrations depuis PostgreSQL propre.
- [ ] parité schéma Finance.
- [ ] `pnpm type-check`.
- [ ] `pnpm lint`.
- [ ] `pnpm qa:regression`.
- [ ] `node scripts/qa-erp-stabilization-final.mjs`.
- [ ] `pnpm build`.
- [ ] Accounting production-like acceptance verte.
- [ ] Delivery governance, Quality et Migration verts sur le même head SHA.

## 10. Production et clôture

- [ ] PR #173 fusionnée depuis le head validé, jamais depuis une branche non vérifiée.
- [ ] SHA `main` égal au SHA fusionné attendu.
- [ ] Vercel Production `READY` sur ce SHA exact.
- [ ] GitHub Release Production cible ce SHA exact.
- [ ] Les issues #168 à #173 sont terminées.
- [ ] Aucun P0/P1 du diagnostic #167 n'est encore reproductible.
- [ ] L'issue parent #167 est fermée uniquement après les vérifications précédentes.

## Limite de portée

La clôture #167 prouve la stabilisation technique et opérationnelle des contrats ERP ciblés. Elle ne transforme pas le bootstrap SYSCOHADA en source réglementaire officielle et ne vaut pas qualification fiscale/réglementaire globale d'un pays.
