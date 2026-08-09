# Clôture du programme de stabilisation ERP #167

Programme : #167  
Itération finale : #173  
Objet : élimination des régressions transverses Finance, RBAC et contrats inter-modules.

## 1. Problème initial

Le diagnostic du programme avait identifié des moteurs métier ERP solides mais plusieurs contrats transverses divergents : readiness Finance concurrente, onboarding désaligné, état READY périmable, décisions RBAC locales, faux zéros KPI en cas d'erreur, observabilité insuffisante des projections et absence d'une acceptance transverse commune vers Finance.

La stabilisation ne devait ni réécrire les domaines ERP ni créer de moteur parallèle. Elle devait consolider les autorités existantes et rendre leurs invariants opposables par CI.

## 2. Résultat par itération

### #168 — Readiness Finance

- `resolveEnterpriseFinanceReadiness()` devient l'autorité commune Setup/Posting.
- les services historiques délèguent à cette autorité ;
- un statut persisté ne suffit plus à déclarer la Finance prête ;
- les mutations structurantes sont recalculées par le contrat serveur.

### #169 — Onboarding Finance

- la Vue d'ensemble financière consomme les diagnostics serveur ;
- les cases ne sont plus déduites de clés frontend divergentes ;
- fiscal year, période, plan, journaux, comptes, taxes et autres prérequis utilisent des preuves métier ;
- les étapes se mettent à jour après configuration réelle.

### #170 — RBAC ERP

- `resolveEnterpriseModuleAccess()` et `resolveEnterpriseModuleCapabilities()` sont l'autorité des modules ERP ;
- l'ancien helper sectoriel n'est plus qu'un adaptateur de compatibilité ;
- les workspaces Core/Procurement dérivent leurs actions des capacités serveur ;
- `MANAGER` n'est pas un administrateur entreprise implicite.

### #171 — États dégradés et projections

- une erreur de source KPI devient `Indisponible` / `Unavailable`, jamais un faux `0` ;
- les projections `FAILED` sont visibles, client-safe et retryables ;
- les erreurs techniques ne sont pas silencieusement assimilées à des données métier valides.

### #172 — Acceptance transverse vers Finance

- Sales, Procurement et Payroll sont exercés en production-like vers le ledger commun ;
- tenant isolation, idempotence et équilibre débit/crédit sont vérifiés ;
- Inventory, Assets, Retail, Health et Pharmacy sont couverts par les contrats permanents de services/adapters et leurs suites dédiées ;
- la clôture distingue une paie approuvée non comptabilisée d'une paie approuvée dont l'écriture `PAYROLL_APPROVED` est déjà `POSTED` ;
- onboarding, cross-module, redémarrage serveur, clôture et protection historique passent dans le même workflow.

### #173 — Consolidation finale

- `lib/enterprise/accounting/access.ts` abandonne `ENTERPRISE_MANAGER_ROLES` et toute seconde décision locale ;
- les actions Finance sont traduites vers les capacités canoniques ;
- `view_sensitive` et visibilité globale exigent `canApprove || canManage` ;
- `scripts/qa-erp-stabilization-final.mjs` agrège readiness, onboarding, RBAC, observabilité et cross-module ;
- ce gate est injecté dans `qa-enterprise-accounting-checks.mjs`, donc dans `qa:regression` et les Quality Gates permanentes ;
- la checklist `docs/ERP_STABILIZATION_QA_CHECKLIST_167.md` formalise l'acceptance de clôture.

## 3. Autorités finales

| Notion | Autorité canonique |
|---|---|
| Readiness Finance | `lib/enterprise/accounting/finance-readiness-service.ts` |
| Accès module ERP | `lib/enterprise/module-access.ts` |
| Capacités UI/API | `resolveEnterpriseModuleCapabilities()` |
| Posting events | `lib/enterprise/accounting/posting-registry-final.ts` |
| Posting transactionnel | `lib/enterprise/accounting/posting-service.ts` |
| Ledger | `EnterpriseJournalEntry` / `EnterpriseJournalLine` |
| Projections | outbox + `EnterpriseCrossModuleProjection` existants |
| Acceptance Finance | `.github/workflows/accounting-acceptance.yml` |
| Gate final | `scripts/qa-erp-stabilization-final.mjs` |

Aucune matrice de posting concurrente ni second ledger n'est introduit par la clôture.

## 4. Invariants durables

1. Une notion métier transverse possède une seule autorité active.
2. Une écriture `POSTED` est immutable.
3. Une correction financière passe par contrepassation, avoir, retour ou workflow métier contrôlé.
4. `MANAGER` n'est pas un administrateur implicite.
5. Les capacités frontend ne remplacent jamais les contrôles serveur et d'objet.
6. Une erreur technique n'est jamais présentée comme une valeur métier valide.
7. Une projection retryée reste idempotente.
8. Health, Pharmacy et Retail ne possèdent pas de ledger parallèle.
9. Le tenant, membership, module, entitlement et permissions sont revalidés côté serveur.
10. La Production provient uniquement de `main` après CI verte.

## 5. Validation CI attendue pour #173

Sur le même head SHA :

```text
Delivery governance
Quality
Migration
Accounting onboarding, cross-module posting, close & history protection
```

Selon les chemins modifiés, les autres workflows spécialisés peuvent également s'exécuter. Aucun test ne doit être neutralisé pour obtenir du vert.

## 6. Validation Production attendue

Après merge :

```text
head PR validé
= SHA merge/main attendu
= SHA Vercel Production READY
= target de la GitHub Release Production
```

Le programme #167 n'est fermé qu'après cette égalité et après vérification de l'état des issues #168 à #173.

## 7. Rollback

La clôture n'ajoute aucune migration destructive. En cas d'incident, revenir applicativement au SHA Production précédent sans réécrire les écritures, périodes, paiements, factures, versions publiées ou historiques.

## 8. Limites explicites

Cette clôture signifie : **régressions transverses du programme #167 stabilisées et protégées par CI/acceptance**.

Elle ne signifie pas :

- certification réglementaire globale ;
- validation fiscale de tous les pays ;
- qualification réglementaire officielle du bootstrap SYSCOHADA ;
- disparition de toute évolution future de l'ERP ;
- promotion commerciale automatique d'un module n'ayant pas reçu les validations produit requises.

Les futures versions comptables et overlays pays restent soumises aux règles de provenance et de validation propres au programme comptable.
