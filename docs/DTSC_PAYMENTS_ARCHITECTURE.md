# DTSC Payments — contrat d'architecture et de cutover (PAY-0)

**Programme :** [#370](https://github.com/Bandsman942/dtsc-platform/issues/370) · **itération :** [#371](https://github.com/Bandsman942/dtsc-platform/issues/371) · **baseline auditée :** `main@ac168a3df1294eb1e5e2449f3d64f4e0192b2ae2` (1er novembre 2026).

**Portée de cette livraison :** diagnostic et règles d'intégration, sans migration, nouveau provider, mutation financière ou changement du runtime. Les éléments marqués **CIBLE** ne sont pas des fonctionnalités déclarées opérationnelles. La QA PAY-0 contrôle le contrat documentaire ; elle ne certifie pas les paiements réels, l'E2E, les secrets PSP ni la Production.

## 1. Conformité contribution / AGENTS

Les références **effectivement présentes sur la baseline auditée** sont `AGENTS.md`, `docs/CONTRIBUTING.md`, `docs/DELIVERY_GOVERNANCE.md` et `.github/PULL_REQUEST_TEMPLATE.md`. Le commentaire du 17 août 2026 sur #370/#371 indiquant qu'aucun `CONTRIBUTING.md` n'existait était exact à sa date, mais **ne décrit plus le `main` actuel**. Le contrat le plus récent et le plus restrictif s'applique.

Une itération PAY doit posséder une Issue, une branche `feat|fix|docs/<issue>-<slug>` née du dernier `origin/main`, une PR Conventional Commits avec labels/milestone requis, une matrice de preuves explicite, une revue et les Quality Gates. Aucun déploiement de branche ni Preview Vercel ; seul `main` peut produire une livraison Production. Les migrations historiques sont immuables. Aucun `OWNER_E2E` n'est revendiqué par PAY-0 ; les parcours financiers introduits ultérieurement exigent une validation du propriétaire avant leur merge lorsqu'indiqué dans l'Issue ou la PR.

## 2. Frontières et sources de vérité réelles

DTSC Payments est une **capacité d'orchestration**, pas une nouvelle comptabilité ni une nouvelle table principale `DtscPayment`. Le terme « commun » n'autorise pas à confondre le produit SaaS vendu par DTSC avec les opérations financières de chaque entreprise cliente.

| Contexte et responsabilité | Source de vérité existante | Fichiers de référence |
| --- | --- | --- |
| Offres et abonnements personnels SaaS | `BillingPlan`, `BillingPlanVersion`, `Subscription` | `prisma/schema.prisma`, `lib/billing.ts`, `lib/billing/commercial-catalog.ts` |
| Abonnements d'organisations clientes **à DTSC** | `OrganizationSubscription`, `BillingRecord` (projection/registre historique), `BillingPlan` | `prisma/schema.prisma`, `lib/subscription-payments.ts` |
| Factures et encaissements **SaaS DTSC** | `Invoice`, `Payment`, `ManualSubscriptionPayment` pour preuve et décision | `prisma/schema.prisma`, `lib/billing.ts`, `lib/subscription-payments.ts` |
| Trésorerie **interne DTSC** | `HrcfoExpense` (écriture opérationnelle), `FinancialAccount` (compte interne), lien `Invoice.hrcfoTransactionId` | `prisma/schema.prisma`, `lib/hr-cfo-finance.ts` |
| Paiements et créances **ERP des entreprises clientes** | `EnterprisePayment`, `EnterprisePaymentAllocation`, `EnterpriseSalesInvoice`, `EnterpriseReceivable`, `EnterprisePayable` | `prisma/enterprise-accounting.prisma`, `lib/enterprise/accounting/payments-service.ts` |
| Trésorerie et comptabilité **ERP cliente** | `EnterpriseFinancialAccount`, `EnterpriseTreasuryTransaction`, `EnterprisePostingBatch`, `EnterpriseJournalEntry`, `EnterpriseJournalLine` | `prisma/enterprise-accounting.prisma`, `lib/enterprise/accounting/posting-service.ts` |
| Secteurs Health et Pharmacy | extension sectorielle avec lien vers `EnterprisePayment`/`EnterpriseSalesInvoice`, sans écriture autonome concurrente | `lib/enterprise/sector-convergence/health-payment-service.ts`, `lib/enterprise/sector-convergence/pharmacy-finance-service.ts` |

`Payment` (SaaS) et `EnterprisePayment` (ERP cliente) ne sont **pas des doublons d'une même vente** : ils ont des créanciers, tenants et responsabilités différentes. Un abonnement à DTSC n'est pas une facture de vente de l'entreprise cliente à ses propres clients. La convergence sectorielle vers Finance ERP utilise **`EnterprisePayment`**, tandis que les règlements d'abonnement DTSC utilisent **`Payment`**. Aucune réplication durable des mêmes paiements entre ces tables n'est admise.

### Chaînes métier canoniques

**SaaS DTSC — CIBLE PAY-1 à PAY-3 :** `BillingPlan → Subscription | OrganizationSubscription → Invoice → Payment → finalisation/affectation → HrcfoExpense + FinancialAccount`, avec une politique explicite de facture émise avant règlement et un rapprochement fiable. Pour les paiements manuels, `ManualSubscriptionPayment` est le dossier de preuve et de décision, **jamais** un second encaissement.

**ERP des entreprises clientes — EXISTANT :** `EnterpriseSalesInvoice/EnterpriseReceivable ou EnterprisePayable → EnterprisePayment → EnterprisePaymentAllocation → EnterpriseTreasuryTransaction → EnterprisePostingBatch → EnterpriseJournalEntry/EnterpriseJournalLine`. `EnterprisePayment` possède déjà son propre workflow de décision, ses événements, son compte, sa session de caisse et sa clé d'idempotence. Il est interdit de le remplacer par `Payment` SaaS.

**Comptabilité interne DTSC :** les écritures `HrcfoExpense` et comptes `FinancialAccount` sont aujourd'hui une trésorerie opérationnelle, **pas** un grand livre complet en partie double. Le projet #993 doit étendre cette comptabilité de manière contrôlée, sans exposer les comptes DTSC à une entreprise cliente ni réutiliser sans contrat tenant-scoped les tables `Enterprise*` clientes.

## 3. Cartographie des parcours existants et écarts

| Parcours | État observé sur `main` | Écart réservé à l'itération suivante |
| --- | --- | --- |
| Checkout personnel | `POST /api/billing/checkout` crée `Subscription` et `Payment` puis appelle MaishaPay si configuré ; `Invoice` est actuellement créée à l'activation, après callback. | PAY-1/PAY-2 : facture et paiement autonomes, reprise idempotente et erreur de finalisation réconciliable. |
| Checkout entreprise | `POST /api/billing/organization-checkout` vérifie OWNER/ADMIN et crée `OrganizationSubscription`/`Payment` avec une référence déterministe ; checkout ponctuel. | PAY-2 : facturation cohérente avant paiement et traitement des retries/échecs. |
| Paiement manuel interne | `POST /api/admin/manual-subscription-payments` exige contexte DTSC, validateur différent, référence contrôlée, notification persistée ; `PATCH /api/admin/manual-subscription-payments/[id]` décide. | PAY-1/PAY-2 : service métier central et preuve fichier privée réelle selon la méthode, validation transactionnelle/audit unifiés. |
| Finalisation manuelle | `lib/subscription-payments.ts` verrouille le dossier, crée `Payment`/`Invoice` et `HrcfoExpense` transactionnellement ; facture envoyée après commit. | PAY-3 : politique d'allocation/rapprochement et contrôle comptable plus complet. |
| Confirmation MaishaPay | `POST /api/billing/maishapay/callback` conserve un `WebhookEvent` unique ; `lib/console/console-webhooks.ts` déclenche `activateSubscriptionFromPayment`. | PAY-4 : vérifier impérativement signature obligatoire, montant, devise, référence provider, concurrence et atomicité de finalisation **avant** extension PSP. |
| Renouvellement manuel | `POST /api/billing/renewal-request` crée un `SupportTicket` borné, sans prélèvement automatique ; `app/billing/page.tsx` et le tableau de bord guident le client. | #995/PAY-2/PAY-7 : échéances et consentement récurrent certifié ; aucun débit sans mandat. |
| Encaissements ERP clients | Routes `app/api/enterprise/[organizationId]/payments/*` utilisant `lib/enterprise/accounting/payments-service.ts`, approbations humaines et posting. | PAY-6 : réutiliser tel quel, avec relations sectorielles structurelles ; aucune seconde machine d'état ERP. |

Les hotfixes [#994](https://github.com/Bandsman942/dtsc-platform/issues/994) (PR #996) et [#1001](https://github.com/Bandsman942/dtsc-platform/issues/1001) (PR #1002) sont déjà intégrés à cette baseline. Leur code ne doit pas être réécrit depuis une ancienne branche. Les tickets ouverts #992 (trésorerie), #993 (comptabilité) et #995 (cycle renouvellement) restent des dépendances métier à solder suivant leurs propres preuves d'acceptation.

## 4. Machine d'état et traduction entre domaines

| Objet | Statuts du schéma / moteur | Contrat de décision PAY |
| --- | --- | --- |
| `Payment` SaaS | `PENDING`, `ACCEPTED`, `PAID`, `FAILED`, `CANCELED` (`PaymentStatus`) | `ACCEPTED` signifie **initiation/acceptation non finale** ; seule une confirmation externe vérifiée ou décision manuelle auditée peut mener à `PAID`. Pas d'activation sur `ACCEPTED`. |
| `Invoice` SaaS | `DRAFT`, `ISSUED`, `PAID`, `CANCELED` (`InvoiceStatus`) | `PAID` doit être la conséquence d'une finalisation cohérente, pas d'un clic ; une facture soldée ne reçoit pas un second encaissement silencieux. |
| `Subscription` personnel | `ACTIVE`, `PENDING_PAYMENT`, `PAST_DUE`, `CANCELED`, `EXPIRED` (`SubscriptionStatus`) | `ACTIVE` uniquement lorsque paiement vérifié, gratuité contractuelle ou décision administrative auditée le justifie. Préserver la période déjà payée. |
| `OrganizationSubscription` | champ `status: String` avec notamment `PENDING_PAYMENT`, `ACTIVE`, `PAST_DUE`, `TRIAL`, `SUSPENDED`, `EXPIRED`, `CANCELED` selon les flux | PAY-1 normalise ces chaînes **sans** changer arbitrairement le schéma existant ; transitions contrôlées. |
| `ManualSubscriptionPayment` | `PENDING_VALIDATION`, `APPROVED`, `REJECTED` (chaînes) | `APPROVED` est une **décision vérifiée** et pointe vers un `Payment` final ; rejet = motif, auteur, horodatage, pas d'activation. |
| `EnterprisePayment` ERP | `DRAFT → PENDING_APPROVAL → APPROVED → CONFIRMED → RECONCILED`, plus `CANCELLED`, `REVERSED` | Machine distincte, déjà implémentée ; initiateur, approbateur et confirmateur séparés ; contrepassation et allocations ERP autonomes. |

PAY-1 devra fournir des transitions testables et nommées **pour `Payment` SaaS** sans introduire un enum incompatible ou une réécriture de l'ERP. Aucune migration de statut n'est autorisée sans mapping/backfill versionné.

## 5. Rôles, scopes et séparation des responsabilités

| Acteur | Lecture permise | Mutation permise | Interdiction |
| --- | --- | --- | --- |
| Abonné personnel | ses offres, échéances, factures et paiements | demande de règlement/renouvellement et dépôt de preuve future | valider son propre paiement, ouvrir une facture tierce |
| OWNER/ADMIN d'entreprise cliente | facturation **de son abonnement à DTSC** via son membership actif | checkout ponctuel ou demande manuelle de renouvellement | consulter comptes internes DTSC, autres organisations ou tickets privés d'un autre administrateur |
| Opérateur Console DTSC | dossiers nécessaires avec `DTSC_INTERNAL` et capacité Console | créer dossier manuel, nommer un collaborateur réellement habilité | s'auto-désigner, bypass tenant/permission par rôle global |
| Validateur désigné DTSC | demandes **qui lui sont assignées**, avec membership interne et statut RH actifs | accepter/rejeter avec justification, de manière idempotente | approuver sa propre demande, une demande non assignée ou une organisation hors contexte |
| RH & CFO DTSC | règlements et anomalies de trésorerie **internes** autorisés | rapprochement/posting selon permissions et séparation des acteurs | accès implicite à la comptabilité des clients |
| Finance d'une entreprise cliente | ses `Enterprise*` financiers selon module et entitlement | workflows `EnterprisePayment` via services canoniques | voir `HrcfoExpense`/`FinancialAccount` DTSC ou l'ERP d'un autre tenant |
| Support | facturation générale et informations volontairement partagées dans un ticket visible | accompagnement borné et escalade | exposition globale de preuves, références, soldes, diagnostics PSP ou données cliniques |

Toute nouvelle route mutante doit contrôler, **côté serveur**, session → contexte (DTSC interne ou `organizationId`) → membership actif → type de tenant/module/entitlement → capacité → propriété/visibilité de l'objet → same-origin (hors webhook authentifié par secret/signature) → validation Zod → `await rateLimit` approprié → transaction → `ApiLog`/`AuditLog`. Un callback PSP ne doit pas dépendre d'un cookie utilisateur et exige une vérification d'authenticité indépendante.

## 6. Contrats de preuve, idempotence et impact financier

1. **Identité stable** : `Payment.reference` unique ; `ManualSubscriptionPayment.idempotencyKey` unique ; `WebhookEvent(provider, idempotencyKey)` unique ; événement de Finance identifié par source, ID et version. Le retry du même objet et montant doit renvoyer un état stable, pas créer un second règlement.
2. **Vérification** : associer explicitement reference, provider, montant `Decimal`, devise, bénéficiaire, facture et abonnement. Une seule divergence invalide la finalisation, même si le callback dit « success ».
3. **Preuve privée** : un champ `externalReference` n'est **pas** un fichier justificatif. Toute preuve PDF/photo future exige upload privé, contrôle MIME/taille, accès par route auth, trace de consultation et garantie de non-réutilisation.
4. **Allocation** : `EnterprisePaymentAllocation` existe pour le client ERP ; **aucun `PaymentAllocation` SaaS n'existe à cette baseline**. En V1 SaaS, paiement partiel et multi-factures restent **désactivés** tant qu'une allocation SaaS traçable n'est pas introduite en PAY-3. Ne jamais inventer un solde à partir de deux projections concurrentes.
5. **Posting** : une décision manuelle réussie doit lier `ManualSubscriptionPayment → Payment → Invoice → HrcfoExpense` et compte interne certifié. Le reporting doit distinguer « paiement confirmé » et « écriture rapprochée » ; le vrai grand livre DTSC relève de #993.
6. **Devises** : pas de somme USD/CDF/EUR. Devise du compte = devise du règlement ; conversion uniquement avec taux et source historisés. `Prisma.Decimal` demeure l'autorité des montants.
7. **Immutabilité** : les écritures financières `POSTED` restent immuables. Correction par remboursement/contrepassation, jamais par mutation silencieuse ou suppression de la preuve.
8. **Notifications** : déclenchement idempotent après engagement durable, deep link exact et permissionné ; push/e-mail sont secondaires et leur échec est présenté honnêtement sans annuler une transaction confirmée.

## 7. Provider framework et MaishaPay — état réel, règles cibles

`lib/maishapay.ts` contient l'adapter HTTP existant. Les routes checkout appelent cet adapter **côté serveur** ; `lib/env.ts` définit les variables actuellement utilisées : `MAISHAPAY_API_URL`, `MAISHAPAY_GATEWAY_MODE`, `MAISHAPAY_PUBLIC_API_KEY`, `MAISHAPAY_SECRET_API_KEY`, `MAISHAPAY_DEFAULT_PROVIDER`, `MAISHAPAY_CALLBACK_SECRET`. Les noms génériques suggérés initialement dans #375 ne doivent **pas** dupliquer ces variables sans décision de migration.

**Bloqueurs à vérifier et traiter en PAY-4 avant la certification provider :**

- la route callback n'exige le secret que **s'il est configuré** (`MAISHAPAY_CALLBACK_SECRET` conditionnel) ; en mode de paiement actif, une configuration sans secret/signature valide doit échouer fermée ;
- `processStoredWebhookEvent()` traite la référence et le statut déclaré, mais ne présente pas de comparaison explicite montant/devise du callback avec `Payment` avant `activateSubscriptionFromPayment()` ; ce contrôle est obligatoire ;
- la finalisation MaishaPay actuelle peut séparer changement de statut, création de facture et impact interne sur plusieurs opérations ; prouver une reprise atomique/idempotente en cas de panne entre étapes ;
- dédupliquer les événements **par identité authentifiée et contenu** sans laisser un callback rejoué ou contradictoire écraser des preuves de traitement ;
- confirmer la documentation MaishaPay officielle, les signatures, statuts, pays/devises et scénarios d'échec avant de déclarer M-Pesa/Airtel/Orange « prêts ».

Une méthode non configurée ou désactivée doit être masquée. Ne jamais appeler un provider depuis React ; aucun bouton décoratif, aucune donnée brute de callback exposée au client. Le recurring est **indisponible** sans consentement/marchand certifié (#995).

## 8. Carte des routes : réutiliser avant de créer

**Existantes, à conserver et éventuellement refactorer en PAY-1 à PAY-4 :**

- `POST /api/billing/checkout`, `POST /api/billing/organization-checkout`, `POST /api/billing/renewal-request` ;
- `POST /api/billing/maishapay/callback` et traitement durable `lib/console/console-webhooks.ts` ;
- `GET|POST /api/admin/manual-subscription-payments`, `PATCH /api/admin/manual-subscription-payments/[id]` ;
- `GET|POST /api/admin/organization-subscriptions`, `PATCH /api/admin/organization-subscriptions/[id]` selon contrat réel ;
- `POST /api/admin/billing/reconcile` (job explicite, jamais au rendu) ;
- `GET|POST /api/enterprise/[organizationId]/payments`, `POST /api/enterprise/[organizationId]/payments/[paymentId]/transition` et `POST /api/enterprise/[organizationId]/payments/[paymentId]/allocations` selon leurs méthodes effectives.

**Candidates PAY-1/PAY-2, à ne créer qu'après audit de collisions et contrat d'accès :** lecture de facture SaaS et paiement ciblée (par propriétaire ou rôle interne), preuve privée, décision unifiée et suivi exact du paiement. Les chemins de #373 (`/api/billing/invoices/*`, `/api/payments/*`) sont des **propositions**, pas des routes existantes. L'adapter central cible est `lib/payments/*`, chargé de déléguer aux services existants, sans nouveau modèle `DtscPayment` ni seconde logique ERP.

## 9. Cutover sectoriel sans double source

| Secteur | Situation actuelle / mapping | Décision PAY-6 |
| --- | --- | --- |
| Health | `HealthMedicalInvoicePayment` et `HealthPaymentExtension` reliés à `EnterprisePayment` ; `HealthPayerAllocation` lié à `EnterprisePaymentAllocation` | conserver l'extension clinique privée ; Finance n'ingère aucun diagnostic ou résultat médical ; bloquer nouvelles mutations sectorielles concurrentes après cutover. |
| Pharmacy | `PharmacyPaymentExtension` et `PharmacySalesExtension` convergent dans `lib/enterprise/sector-convergence/pharmacy-finance-service.ts` | conserver lots/FEFO/caisse dans leur domaine, valider le lien financier et les remboursements. |
| Shop / Retail / Gaming | flux Retail et `lib/enterprise/gaming/payment-convergence.ts` utilisent déjà `EnterprisePayment` et ses allocations selon scénario | auditer chaque parcours, préserver idempotence et sessions de caisse ; ne jamais créer un second encaissement pour la même vente. |
| Education, Transport, Insurance, NGO/Gov | maturité variable ; aucune commercialisation déduite de cette documentation | cartographier lors de l'activation réelle, utiliser les objets ERP autorisés, masquer les fonctionnalités non certifiées. |

Ordre par secteur : audit source → lien structurel tenant-scoped → migration **additive** si indispensable → backfill borné/idempotent avec `--dry-run` → protection des anciennes écritures → lecture legacy privée/paginée → QA ciblée → observation Production → éventuelle suppression lors d'une **release ultérieure** distincte. Aucun dual-write permanent et aucun rapprochement par nom/e-mail libre.

## 10. Backlog de schéma, services et composants (aucune migration PAY-0)

| Ordre | Décision à instruire | Réutilisation obligatoire |
| --- | --- | --- |
| PAY-1 | Service `lib/payments/payment-service.ts`, accès, machine d'état, erreurs, clés d'idempotence ; pas de nouveau modèle principal | `Payment`, `Invoice`, `Subscription`, `OrganizationSubscription`, `ManualSubscriptionPayment`, `lib/subscription-payments.ts`, contrôle Console existant |
| PAY-2 | Facture SaaS avant règlement ; lecture/suivi et preuve privée avec propriété/retention ; montant dû strict | `/billing`, `/dashboard`, `SupportTicket`, `notifyUser`, `components/workspace/*` |
| PAY-3 | Étudier une allocation/écriture idempotente **SaaS** si la facturation multi-paiement est réellement demandée ; ne pas inventer un second solde | lien `Invoice.hrcfoTransactionId`, `HrcfoExpense`, `FinancialAccount`, Finance ERP client **sans** mélange des tenants ; #992/#993 |
| PAY-4 | Verrouiller signature/configuration callback, transaction de finalisation, événements et retries | `WebhookEvent`, `lib/maishapay.ts`, `lib/console/console-webhooks.ts` |
| PAY-5 | `PaymentAttempt` et configuration provider seulement si les preuves d'architecture exigent un état durable absent | `Payment` + provider allow-list existant, pas de boutons non configurés |
| PAY-6 | Liens structurés supplémentaires seulement pour les secteurs non convergés | `EnterprisePayment`, `EnterprisePaymentAllocation`, extensions sectorielles existantes |
| PAY-7 | UI mobile/FR-EN, reçus et notifications exactes, recherche, filtres et pagination serveur | `components/workspace/*`, i18n canonique, Console/Support/Facturation existants |
| PAY-8 | Litiges, remboursements et flags de risque **seulement** si aucun équivalent domaine n'existe | historique, contrepassation, auditeurs et objets Finance existants |
| PAY-9 | QA comportementale/E2E, cutover, monitoring, runbook et certification | `scripts/qa-*`, `docs/TECHNICAL_DOCUMENTATION.md`, QA sectorielle et ERP |

## 11. Matrice de conformité PAY-0 à PAY-9

Chaque ligne ci-dessous complète `AGENTS.md`, `docs/CONTRIBUTING.md` et le contrat de la PR ; elle ne dispense jamais des contrôles globaux.

| Phase | CI/CD et preuve clé | Sécurité/multi-tenant | Finance, migration et données | UX/guide/documentation |
| --- | --- | --- | --- | --- |
| PAY-0 | baseline `origin/main`, QA documentaire, PR revue | matrice d'accès et frontières | inventaire, aucun schema modifié | contrat présent et vérifiable |
| PAY-1 | tests états/idempotence, type-check/lint | RBAC action/objet, anti cross-tenant, audit | conserver modèles existants | erreurs métier documentées |
| PAY-2 | E2E paiement/refus et régression | preuve privée, demandeur ≠ validateur | facture, abonnement, transaction atomique | espace client + Console FR/EN mobile |
| PAY-3 | replay finance, tests USD/CDF | rapports tenant-scoped, SoD | allocation/compte/posting, périodes closes | soldes explicables, guides Finance |
| PAY-4 | callbacks répétés, invalides, hors ordre | signature, secrets, rate-limit adapté | idempotence et cohérence montant/devise | messages humains et runbook incident |
| PAY-5 | tests panne/retour provider | allow-list, configuration serveur | tentatives et cash/bank vérifiés | méthodes réelles uniquement, mobile |
| PAY-6 | QA de chaque secteur et anti-dual-write | séparation clinique/réglementaire | migrations additives/backfills dry-run | guides sectoriels ajustés |
| PAY-7 | E2E FR/EN/320px et accessibilité | deep links autorisés, Support borné | aucune décision financière cliente | détails plein écran, reçus, pagination |
| PAY-8 | tests litiges, doubles remboursements | audit/antifraude et permissions | contrepassation, jamais de réécriture `POSTED` | support et reporting autorisés |
| PAY-9 | clean install + type/lint/regression/build + OWNER_E2E | audit auth, tenant, fichiers et provider | runbook, rollback, observabilité et reconciliation | readiness commerciale explicite |

**Checklist PR standard DTSC Payments :** dernier `origin/main` attesté ; Issue/labels/milestone ; branche dédiée ; diff et suppressions inattendues revus ; migrations historiques intactes ; `git diff --check` et `git diff --cached --check` ; `pnpm prisma:generate` ; `pnpm type-check` ; QA ciblée ; `pnpm qa:regression` ; `pnpm lint` ; `pnpm build` ; contrôles serveur complets ; isolation tenant ; replay/idempotence ; docs/changelog ; `OWNER_E2E` quand requis ; matrice `LOCAL_EXECUTED`/`CI_PROVEN`/`OWNER_E2E`/`NOT_EXECUTED` sincère ; PR revue ; **aucun** déploiement Vercel de branche.

## 12. Plan de vérification et critères de sortie PAY-0

La commande `pnpm qa:dtsc-payments-contract` valide les sources documentées, les modèles, les frontières et les phases PAY-0 à PAY-9. Elle ne teste **aucune mutation réelle**. Les QA existantes à garder dans le pipeline : `qa:regression`, `qa:billing-catalog-v2` si disponible, contrôles Finance/ERP, sécurité sectorielle et hotfix #1001. Les noms effectifs doivent être confirmés dans `package.json` au moment de l'exécution ; ne pas transformer une commande absente en succès fictif.

PAY-0 est prêt pour revue seulement si : les deux sources `Payment`/`EnterprisePayment` et la comptabilité interne sont distinguées, le workflow/état/RBAC est nommé, les écarts provider/finance sont visibles, la liste de routes/services réutilisables est disponible, le cutover évite le dual-write, la matrice de conformité est complète et la QA documentaire est verte. Aucun parcours de paiement ne doit être déclaré certifié par cette seule livraison.

**Risques ouverts identifiés :** #992 trésorerie et devise, #993 comptabilité DTSC, #995 échéances/récurrence, #375 callback/PSP, #377 sector convergence. Leur résolution passe par leurs itérations et E2E dédiés, pas par un traitement « documentaire » implicite.

**Rollback PAY-0 :** revert du commit documentaire et du script QA associé via une PR traçable. Aucune donnée, migration, clé provider ou transaction n'est modifiée ; aucune restauration base n'est nécessaire.
