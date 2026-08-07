# AGENTS.md

## Projet

DTSC Platform est une application Next.js App Router, React, TypeScript, Prisma et PostgreSQL, déployée sur Vercel. Elle combine un tenant interne DTSC, des organisations clientes multi-tenant, un ERP commun, des extensions sectorielles Health/Pharmacy et des services collaboratifs.

Ce fichier contient uniquement les règles durables automatiquement applicables. Les contrats détaillés vivent dans `docs/TECHNICAL_DOCUMENTATION.md`, `docs/ERP_FINAL_ARCHITECTURE.md`, `docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md`, les documents de domaine et les checklists QA.

## 1. Workflow Git et CI/CD

- Toujours partir du véritable dernier `origin/main` vérifié.
- Utiliser une branche feature dédiée ; ne jamais développer directement sur `main`.
- Avant push : `git diff --check`, `git diff --cached --check`, `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, tests ciblés, `pnpm qa:regression`, puis `pnpm build` lorsque les outils sont disponibles.
- Ne jamais retirer, neutraliser ou contourner un test pour faire passer la branche.
- La Production provient uniquement de `main` : branche → contrôles → commits → push → PR → Quality Gates → revue → merge → unique déploiement Vercel Production.
- Ne jamais exécuter `vercel`, `vercel deploy` ou `vercel --prod` depuis une branche feature.
- Les previews Vercel désactivées sont attendues et ne constituent ni une erreur ni une validation.
- Ne jamais réécrire l’historique de `main` ni modifier une migration déjà appliquée.

## 2. Sécurité serveur

Toute route mutante sensible applique, selon son domaine :

```text
session
→ activeOrganizationId
→ membre actif
→ type d’organisation attendu
→ module actif
→ entitlement
→ permission
→ visibilité/propriété de l’objet
→ same-origin
→ validation Zod
→ await rateLimit
→ transaction
→ ApiLog
→ AuditLog
```

- Masquer un bouton ne remplace jamais un contrôle serveur.
- `rateLimit()` est asynchrone : toujours utiliser `await`.
- Les actions admin globales exigent le contexte `DTSC_INTERNAL` et les permissions appropriées.
- Un rôle global `ADMIN`, `MANAGER` ou `SUPPORT` n’accorde aucun accès implicite aux données privées d’une entreprise cliente.
- `MANAGER` n’est jamais administrateur entreprise automatiquement.
- Toute référence fournie par le client doit être revalidée dans le même `organizationId`.
- Les erreurs utilisateur restent humaines ; les détails techniques sensibles restent dans des logs protégés.
- Aucun secret, token, mot de passe, URL de webhook secrète ou clé de stockage ne doit apparaître côté client, dans les migrations, fixtures, captures, rapports ou logs.

## 3. Multi-tenant et rôles métier

- Toute donnée interne d’entreprise porte `organizationId` ou une relation tenant-scoped équivalente.
- Toute lecture/écriture vérifie le membership actif et le contexte de session.
- Le tenant interne stable est `dtsc-internal`; ses modules privés ne sont accessibles qu’en contexte `DTSC_INTERNAL` avec membership actif.
- Les entreprises clientes n’accèdent jamais aux données DTSC ou d’une autre organisation, même en modifiant une URL ou un identifiant.
- Les tickets support ne donnent accès qu’aux informations volontairement partagées dans le ticket.
- Les groupes internes restent limités à leur organisation ; les groupes transversaux exigent une invitation acceptée.
- Les permissions internes DTSC utilisent les postes officiels reliés au dossier RH, jamais un texte libre.
- `CEO`, `COO`, `HR_CFO`, `CTO`, `MPO`, `SCO` et `LA` conservent leurs responsabilités documentées ; aucun rôle ne sert de bypass universel.

### Disponibilités, absences et temps travaillé DTSC

- Chaque collaborateur est seul autorisé à créer, modifier ou supprimer ses propres disponibilités hebdomadaires et exceptions ; les responsables disposent uniquement d’une lecture d’équipe autorisée.
- Les disponibilités décrivent un temps planifiable, jamais une prestation réalisée, un timesheet, une présence pointée ou un montant de paie.
- Les absences et exceptions datées restent distinctes du planning hebdomadaire et sont résolues dans le fuseau horaire applicable.
- L’historique passé est immuable ; toute modification future d’une disponibilité récurrente crée une version temporelle traçable.
- Le temps travaillé, sa validation indépendante et son intégration à la paie utilisent leurs domaines dédiés et ne sont jamais déduits automatiquement d’une simple disponibilité.

### SPRINT_04_WORK_PRESTATIONS_RULES

- Les prestations réelles sont déclarées par leur collaborateur, calculées côté serveur, soumises par semaine et deviennent immuables après soumission sauf demande de correction explicite.
- No employee may approve their own work submission; le COO valide les collaborateurs et le CEO valide le COO selon les postes officiels.
- Les minutes approuvées constituent une preuve de travail pour le workflow suivant, mais ne calculent jamais automatiquement une rémunération.
- Les routes mutantes restent same-origin, validées, limitées, auditées et le déploiement reste production-only depuis `main`.

### SPRINT_05_PAYROLL_WORKFLOW_RULES

- Only approved DTSC work peut alimenter la preuve de couverture d’une paie préparée ; une couverture incomplète exige une justification explicite.
- Les minutes approuvées ne proratisent ni ne calculent automatiquement le salaire mensuel ; la rémunération de base vient du dossier RH et toute dérogation est justifiée.
- No employee may approve their own payroll; la paie du CEO est approuvée par le COO et les autres paies par le CEO selon le workflow officiel.
- La préparation et la soumission ne créent aucun impact financier ; la transaction financière idempotente n’est créée qu’à l’approbation, puis réutilisée lors du paiement.

## 4. Registre canonique et navigation ERP

1. Le registre canonique est l’unique catalogue actif de modules.
2. Une ligne `EnterpriseModule` en base configure un tenant mais ne peut pas rendre ouvrable un code absent ou masqué du registre.
3. Chaque module a un statut explicite : `ACTIVE`, `BETA`, `PLANNED`, `DEPRECATED`, `HIDDEN` ou `RETIRED`.
4. Un module sans modèle/service réel, route, workspace, permission, entitlement et QA ne peut pas être `ACTIVE`.
5. Les modules planifiés ou masqués n’ont ni carte active, ni route métier, ni entrée de navigation.
6. Les codes administratifs historiques restent seulement des aliases/redirections vers l’administration consolidée.
7. Les workspaces sont allow-listés dans le code ; aucun import dynamique ou accès Prisma arbitraire piloté par `moduleCode` n’est autorisé.
8. Les dépendances, secteurs, plans et permissions sont résolus côté serveur avant navigation ou ouverture.

## 5. Source unique de vérité et legacy

1. Une seule source de vérité est autorisée par domaine.
2. Aucun dual-write permanent n’est autorisé.
3. Aucun CRUD générique ne peut écrire dans un domaine disposant d’un modèle dédié.
4. `EnterpriseCoreRecord`, `EnterpriseSectorRecord` et `EnterpriseWorkflow` sont des archives `LEGACY_READ_ONLY` ; leurs mutations sont interdites.
5. Les anciennes routes mutantes répondent explicitement `410 Gone` après contrôle d’accès et audit ; jamais de succès silencieux.
6. Les lectures historiques restent tenant-scoped, paginées, bornées et soumises aux permissions.
7. Les anciens objets non migrables sont archivés sans invention de champs ni fusion par similarité textuelle.
8. Toute projection reste reconstruisible et ne devient jamais une seconde autorité.
9. Les scripts de backfill conservés sont idempotents, bornés, documentés, supportent `--dry-run` et exigent une confirmation explicite avant écriture.
10. Les flags temporaires de cutover sont retirés seulement après preuve Production et indépendance du rollback.

## 6. Finance, comptabilité et trésorerie

- Toute écriture commune respecte la partie double : `Σ débits = Σ crédits` avec `Prisma.Decimal`.
- Toute comptabilisation issue d’un événement métier possède une clé d’idempotence stable et une version de posting.
- Une écriture `POSTED` est immuable ; toute correction utilise une contrepassation liée, puis une nouvelle écriture si nécessaire.
- Une période `CLOSED` ou `LOCKED` ne reçoit aucune nouvelle écriture.
- Un paiement est un objet autonome avec approbation, confirmation, trésorerie et allocations ; ne jamais le réduire à un simple statut de facture.
- Les allocations confirmées déterminent les soldes ouverts ; ne jamais maintenir un second solde concurrent.
- Une réception de stock n’est pas une facture fournisseur ; une commande n’est pas une facture client.
- Les devises différentes ne sont jamais additionnées directement ; le taux réellement utilisé est conservé dans un snapshot historique.
- Les rapports financiers utilisent uniquement les écritures communes `POSTED`, filtrées par organisation, période, devise et dimensions autorisées.
- Toute facture sectorielle possède une facture commune unique ; tout paiement sectoriel utilise le paiement commun.
- Les budgets/dépenses, dettes fournisseurs, paie interne DTSC et paie client conservent des responsabilités distinctes.

## 7. Frontières Pharmacy et Health

### Pharmacy

- Pharmacy conserve produits réglementés, lots, FEFO, péremption, rappels, blocages, qualité, pharmacovigilance et quantités réglementées.
- Les fournisseurs, catalogues communs, achats, factures, paiements, caisses et écritures sont reliés aux domaines communs par extensions/mappings.
- Une vente, réception, retour, ajustement, perte, remboursement ou clôture caisse doit rester transactionnel, idempotent et auditable.
- Une annulation de mouvement validé crée un mouvement inverse ; elle ne réécrit jamais silencieusement l’historique.

### Health

- Health conserve patients, rendez-vous, consultations, dossiers médicaux, laboratoire, prescriptions, documents et données cliniques.
- Finance ne reçoit aucune donnée clinique inutile : ni diagnostic, symptôme, prescription, résultat de laboratoire, note médicale ou historique clinique.
- Les factures, créances patient/assurance, paiements et allocations utilisent les objets financiers communs.
- Les rôles administratifs/Finance n’accèdent pas aux détails cliniques sans permission médicale explicite.
- Les documents médicaux restent privés, versionnés et téléchargés via une route serveur auditée.

## 8. Prisma et migrations

- Toute modification du schéma Prisma possède une migration SQL correspondante.
- Les migrations historiques ne sont jamais modifiées.
- Privilégier les migrations additives : statuts, index, contraintes, relations et champs de cutover.
- Une suppression physique exige deux releases :
  - Release A : code n’utilisant plus l’objet, anciennes écritures bloquées, lecture/observabilité conservées ;
  - observation Production ;
  - Release B : suppression éventuelle après sauvegarde, export, restauration testée et validation explicite.
- Ne jamais supprimer dans la même release la dernière utilisation applicative et la colonne/table correspondante.
- Une installation depuis une base vide doit rester fonctionnelle avec `prisma migrate deploy`, génération Prisma et build, sans ancien backfill manuel caché.
- Les relations tenant-aware doivent empêcher les références croisées entre organisations.
- Ajouter des index uniquement lorsqu’ils correspondent aux filtres et parcours réels : `organizationId`, statut, date, référence, période, compte, tiers, module, source et clé d’idempotence.

## 9. TypeScript, Next.js et Zod

- Ne pas nommer une variable locale `module` dans les routes/helpers/composants Next.js.
- Ne pas utiliser `Array.includes(session.role)` avec un tableau étroit ; préférer des comparaisons explicites ou un `Set<UserRole>` correctement typé.
- Ne pas appeler `.partial()`, `.pick()`, `.omit()` ou `.extend()` sur un schéma Zod déjà raffiné ; dériver depuis un objet de base puis appliquer les raffinements finaux.
- Normaliser les valeurs optionnelles avant un callback asynchrone ou une transaction Prisma pour préserver le narrowing TypeScript.
- Les composants serveur transmettent aux composants clients uniquement des objets JSON simples.
- Supprimer toute prop, variable, import ou paramètre de handler inutilisé avant build.
- Les effets React gardent des dépendances complètes ou des callbacks stabilisés.
- Les clés d’objets partagés ne sont jamais dupliquées.
- Ne pas passer `title` directement aux icônes Lucide ; utiliser un élément HTML englobant.

## 10. UI/UX métier DTSC, mobile et accessibilité

- Réutiliser les primitives de `components/workspace/*`, notamment `ModuleWorkspace`, `ModuleHeader`, `ModuleMetrics`, `ModuleContent`, `ModuleSection`, `BusinessList`, `BusinessListItem`, `BusinessDetail`, `ContextActions`, `StatusBadge` et `EmptyState`, avant de créer des primitives parallèles.
- Éviter les cartes dans des cartes ; préférer header métier → contrôles → contenu → actions contextuelles.
- Les actions contextuelles passent par un menu `...`, sont réellement implémentées et respectent la permission serveur résolue pour l’objet et le module.
- Les actions destructives exigent confirmation et soft delete/archivage métier lorsque nécessaire.
- Les listes volumineuses sont paginées côté serveur ; ne jamais charger toutes les écritures, patients, produits, messages ou mouvements en mémoire.
- Mobile-first : `min-w-0`, safe areas, aucun débordement global, rail KPI horizontal local, dialogs/sheets scrollables, clavier iPhone et selects tactiles.
- Sur mobile, privilégier liste → détail plein écran → formulaire plein écran → retour.
- Les conversations/commentaires sont bornés, scrollables et paginés ; la zone de saisie reste accessible.
- Les champs visibles utilisent des libellés métier traduits, jamais des codes techniques, enums bruts ou clés camelCase.
- Toute interface réutilisable respecte i18n FR/EN, mode sombre, accessibilité clavier et cibles tactiles.
- Aucun bouton ou bloc décoratif ne peut être un placeholder.

## 11. Documents, fichiers, notifications et PWA

- Les fichiers passent par une route serveur privée avec validation MIME/taille, stockage privé et contrôle RBAC ; aucun champ texte libre ne remplace un upload.
- Les téléchargements sensibles sont audités.
- Les notifications et Web Push restent génériques lorsqu’une donnée est verrouillée et ne contournent jamais l’authentification.
- Un deep link ouvre le module, l’objet précis et la section pertinente après contrôle d’accès.
- Le service worker ne met jamais en cache `/api/*`, les pages privées HTML, l’authentification ou les données utilisateur.
- Le fallback offline reste public, autonome et sans donnée privée.

## 12. Documentation et validation finale

- Toute évolution fonctionnelle, API, schéma, sécurité, intégration, workflow CI/CD ou comportement admin/client est documentée dans le même travail.
- Mettre à jour en priorité `docs/TECHNICAL_DOCUMENTATION.md`, les documents de domaine concernés, le changelog et la checklist QA.
- Une API documente méthode, accès, validation, réponse, erreurs et variables d’environnement éventuelles.
- Les aides utilisateur n’exposent aucun secret, nom de table, route interne sensible ou détail clinique/financier inutile.
- Le programme ERP n’est déclaré terminé qu’après : PR revue, checks verts, merge, migrations Production réussies, SHA Production égal à `main`, smoke tests Core/Finance/Pharmacy/Health/legacy/mobile concluants et audit d’intégrité comptable sans anomalie critique.

## Règles ERP finales — résumé normatif

1. registre canonique unique ;
2. une source de vérité par domaine ;
3. aucun dual-write permanent ;
4. aucun CRUD générique pour un domaine dédié ;
5. legacy read-only ou supprimé ;
6. routes legacy mutantes interdites ;
7. facture sectorielle → facture commune unique ;
8. paiement sectoriel → paiement commun ;
9. toute écriture métier/comptable idempotente ;
10. écriture comptabilisée immuable ;
11. correction comptable par contrepassation ;
12. aucune donnée clinique dans le Core financier ;
13. données réglementaires Pharmacy conservées ;
14. données cliniques Health conservées ;
15. rapports financiers fondés sur les écritures communes ;
16. aucun double comptage d’une projection sectorielle ;
17. modules planifiés masqués ;
18. permissions côté serveur ;
19. route mutante : same-origin, Zod, rate limit et audit ;
20. suppression Prisma destructive en deux releases ;
21. migrations historiques immuables ;
22. installation base vide fonctionnelle ;
23. listes volumineuses paginées côté serveur ;
24. contrat responsive global obligatoire ;
25. Production uniquement depuis `main`.

## Professionnalisation des modules ERP

- Un module ERP commercial doit disposer d’un workspace dédié, de formulaires professionnels, de détails, d’actions métier, d’un onboarding, d’une aide, d’un support, d’un contrat mobile et de QA probantes.
- Une interface générique ou en simple lecture ne peut pas être déclarée commercialisable.
- Les sélecteurs n’exposent jamais les UUID; ils affichent des noms, références et résumés autorisés.
- Toute liaison compte DTSC ↔ fiche entreprise est consentie, révocable, auditée et distincte des autorités de données métier.
- Les avantages liés à une relation sont décidés côté serveur et exigent une relation active.
- Les notifications ouvrent l’objet précis et la section pertinente après authentification.
- Les migrations de professionnalisation restent additives et la Production provient uniquement de `main`.

## Règles durables — professionnalisation sectorielle finale

1. Les modules Health et Pharmacy utilisent les primitives DTSC et des workspaces dédiés.
2. Une extension sectorielle ne recrée jamais une source commune.
3. Toute facture sectorielle financière possède une facture commune unique.
4. Tout paiement sectoriel utilise le moteur commun.
5. Toute caisse sectorielle utilise les sessions communes.
6. Les mouvements de stock sectoriels sont idempotents.
7. Pharmacy conserve lots, FEFO, péremption, rappels et données réglementaires.
8. Health conserve patients, dossiers et données cliniques.
9. Aucune donnée clinique inutile ne doit entrer dans Finance.
10. Les documents médicaux restent sous contrôle Health.
11. Les documents réglementaires restent sous contrôle Pharmacy.
12. Une fiche patient, client ou professionnel peut exister sans compte DTSC.
13. Toute liaison à un compte DTSC exige un consentement explicite.
14. Une relation active ne donne aucun accès médical, financier ou administratif automatique.
15. Les formulaires longs utilisent des étapes ou sections métier.
16. Aucun UUID, enum brute ou type Prisma n’est visible dans l’interface.
17. Les messages français utilisent des dictionnaires contrôlés et des erreurs humaines.
18. Les notifications sensibles restent génériques.
19. Relations avec les entreprises reste visible dans la navigation globale, sans tenant actif.
20. Les modules sans contrat professionnel restent masqués.
21. Le registre canonique contrôle l’ordre, les groupes et les icônes.
22. Les tests E2E manuels ne sont jamais déclarés réussis sans confirmation explicite du propriétaire.
23. `COMMERCIAL_READY` exige la validation manuelle du propriétaire et une promotion auditée.
24. Les migrations historiques ne sont jamais modifiées et les nouvelles migrations restent non destructives.
25. La Production provient uniquement de `main`; aucun déploiement manuel de branche n’est autorisé.

## ERP cross-module consolidation invariants

These rules are durable for every common or sector ERP change:

1. Each business concept has one canonical source of truth.
2. A sector extension must reference, not recreate, common master data, Finance, inventory or accounting objects.
3. Cross-module projections are durable, observable and idempotent.
4. Every derived object retains its structural source reference.
5. Duplicate invoices, payments, stock movements and journal entries are forbidden.
6. Status changes happen through business services, never direct frontend writes.
7. Cross-module references use identifiers and relations, not names, e-mail matching or free text.
8. Forms never expose UUID entry; selectors are tenant-, permission-, status- and context-filtered.
9. Notifications and collaboration actions use exact deep links to the object and thread.
10. Business documents use real private uploads, classifications and permission checks.
11. Comments remain separate from workflow decisions and preserve history.
12. Server-side access resolution is authoritative; frontend capabilities are display hints only.
13. An active enterprise relationship grants no implicit tenant, Finance, HR, Health, Pharmacy, project or document access.
14. Finance must never receive unnecessary clinical content.
15. Navigation order, icons, labels, dependencies and plan eligibility come from the canonical module registry.
16. Every professional module has an exact, accessible user guide.
17. French surfaces expose no raw enum, Prisma type, metric key or technical error.
18. Mobile surfaces follow the DTSC responsive contract, including horizontal KPI/rail visibility and full-screen long forms.
19. A module with an unresolved workflow, permission, duplication, guide, notification, deep-link or critical mobile defect must be downgraded honestly.
20. `COMMERCIAL_READY` requires explicit manual owner validation; automated QA never promotes it alone.
21. Historical migrations are immutable; new migrations are additive and non-destructive.
22. No release physically deletes business, financial, clinical, lot or audit history.
23. Posted financial consequences are corrected with credit notes, refunds, reversals or corrective entries, never silent deletion.
24. Projection retries reuse the same receipt and source; they never create a competing projection path.
25. Production is deployed only from `main` through the configured pipeline.

## 12. STANDARD_AI_ITERATION_05_RULES

- Toute nouvelle interface utilise le moteur i18n canonique ; aucun texte visible nouveau n'est codé en dur sans exception documentée et les `reasonCode` restent indépendants de la langue.
- Les réponses IA suivent la langue explicitement demandée puis la locale du compte ; les messages, documents, commentaires et citations utilisateur ne sont jamais traduits silencieusement.
- Les guides utilisent le registre et le composant natifs existants, avec leurs locales ; aucun registre ou rendu parallèle de guides n'est autorisé.
- Administration DTSC → Maturité commerciale reste la source canonique ERP et standard. Toute transition est contrôlée côté serveur, motivée, prouvée, idempotente et auditée.
- `COMMERCIAL_READY` exige Production, SHA, E2E manuel `PASSED` et validation explicite du propriétaire ; aucune promotion automatique n'est autorisée.
- Une dégradation de maturité exige un incident documenté ; un glisser-déposer ne modifie jamais seulement l'état client.
- Toute conversation IA possède un contexte et une locale explicites. Les modèles et fournisseurs proviennent du catalogue canonique.
- Un fallback ne peut jamais affaiblir confidentialité, tenant, permission, plan, sortie structurée ou langue attendue.
- Les outils IA appellent les services métier canoniques ; une mutation sensible exige aperçu, confirmation, idempotence et audit.
- Toute recherche RAG filtre tenant, permission, statut et confidentialité avant de retourner un fragment.
- Les coûts sont enregistrés au moment de l'appel ; un tarif absent reste `UNKNOWN` et n'est jamais remplacé par zéro.
- Les prompts critiques sont versionnés et rollbackables. Le raisonnement interne privé n'est jamais exposé.
- Les surfaces IA et Kanban restent utilisables à 320 px.
- Les E2E manuels restent `NON_EXÉCUTÉ` tant que le propriétaire ne les a pas confirmés explicitement.

## 13. STANDARD_ENTERPRISE_GOVERNANCE_ITERATION_06_RULES

1. Les budgets ne remplacent jamais les écritures ERP.
2. Tout montant réalisé possède une source canonique et une date de fraîcheur.
3. Les engagements et les réalisations restent distincts et ne sont jamais comptés deux fois.
4. Toute formule budgétaire ou de reporting est centralisée, documentée et testée.
5. Un budget approuvé ou gelé est versionné avant révision ; il n'est jamais écrasé silencieusement.
6. Les validations budgétaires utilisent le moteur commun de validations et de workflows.
7. Les prévisions assistées par IA restent des propositions avec méthode, hypothèses et limites.
8. Tout indicateur possède une définition canonique, une source, une unité, une période et une fraîcheur.
9. Les graphiques, tableaux, APIs et exports utilisent les mêmes formules.
10. Aucune valeur statique ou absente n'est présentée comme donnée métier réelle.
11. Les exports respectent filtres, permissions, organisation, locale, devise et classification.
12. L'administration d'entreprise reste strictement isolée par tenant et distincte de la Console DTSC.
13. Un collaborateur retiré perd immédiatement son membership, ses capacités et ses canaux temps réel, sans suppression de son compte global.
14. Le dernier administrateur critique est protégé contre la révocation, la suspension et la rétrogradation accidentelles.
15. Les rôles système critiques ne sont ni supprimables ni affaiblissables par un rôle personnalisé.
16. Toute mutation de rôle, permission, module, paramètre ou politique de sécurité est contrôlée côté serveur et auditée.
17. L'héritage des permissions est déterministe et sa source reste explicable.
18. Une simulation de permission ne modifie jamais le membership, le rôle ou les capacités.
19. L'activation d'un module vérifie le registre, le plan, l'abonnement, les dépendances, la configuration et la disponibilité technique.
20. La désactivation d'un module conserve les données et bloque les nouvelles mutations selon la politique canonique.
21. Aucun paramètre visible ne doit être fictif ; tout contrôle affiché produit un effet persistant et vérifiable.
22. Toutes les surfaces de l'itération utilisent le moteur i18n canonique et des reason codes stables.
23. Les guides utilisent le composant et le registre natifs existants ; aucun registre documentaire parallèle n'est autorisé.
24. Les modules de l'itération 6 sont suivis dans le Kanban canonique de maturité commerciale avec preuves et historique.
25. Toute transition de maturité est contrôlée côté serveur, motivée, auditée et liée aux preuves disponibles.
26. `COMMERCIAL_READY` exige Production stable, E2E manuel `PASSED` et validation explicite du propriétaire ; aucune promotion automatique n'est autorisée.
27. Les budgets, rapports, matrices, audits, guides et Kanban restent utilisables à 320 px avec une alternative clavier aux actions de glisser-déposer.
28. Les E2E manuels ne sont jamais déclarés réussis sans confirmation explicite du propriétaire.
29. Les migrations historiques restent immuables et toute migration de gouvernance est additive, non destructive et compatible base vide/base existante.

## 14. STANDARD_DTSC_CONSOLE_ITERATION_07_RULES

1. Une page Console de lecture ne produit aucune mutation métier.
2. Les synchronisations financières ne sont jamais lancées pendant le rendu.
3. Les routes Console utilisent les identifiants canoniques de `lib/console/console-routes.ts`.
4. Les anciennes sections sont gérées par des aliases contrôlés sans boucle et avec conservation des filtres.
5. Chaque section charge uniquement ses données.
6. Les listes Console sont paginées côté serveur ; un `take` fixe n’est pas une stratégie de consultation.
7. Aucun KPI ne peut être fictif ; toute métrique possède source, définition, période, unité et fraîcheur.
8. Les permissions Console sont vérifiées par capacité côté serveur.
9. Voir une section ne donne pas toutes les mutations.
10. Le dernier administrateur global et le dernier administrateur critique d’une organisation sont protégés.
11. Les organisations restent isolées ; la Console n’ouvre pas arbitrairement les données métier privées.
12. Une suspension ou un archivage conserve les données et exige un motif audité.
13. La réconciliation est explicite, bornée, idempotente et jamais exécutée au rendu.
14. Les historiques commerciaux conservent les versions de plan et de publication.
15. Les tickets utilisent le moteur Support canonique ; une conversation générale n’est pas un ticket sans lien explicite.
16. Les contenus utilisent le modèle public canonique et une suppression Console archive au lieu de détruire l’historique.
17. Les secrets ne sont jamais affichés ; seuls leurs états de configuration peuvent être exposés.
18. Les retries webhook sont contrôlés, bornés, idempotents, redacted et audités.
19. Les textes Console utilisent le moteur i18n et des `reasonCode` stables.
20. Les guides utilisent `ContextualUserGuide` et le registre natif ; chaque section possède un guide exact.
21. Les modules de l’itération 7 apparaissent dans le Kanban sous `STANDARD-07`.
22. `COMMERCIAL_READY` exige Production, E2E propriétaire et validation explicite ; aucune promotion automatique.
23. Les interfaces restent utilisables à 320 px et toute action drag-and-drop possède une alternative clavier.
24. Node 22 et les protections de build ne sont pas retirés sans preuve.
25. Aucune QA historique n’est supprimée et aucun déploiement Production manuel depuis une branche n’est autorisé.

## DTSC DELIVERY GOVERNANCE

Pour tout changement matériel :
1. partir du dernier `origin/main` vérifié ;
2. Issue obligatoire avec labels structurés ;
3. milestone obligatoire pour impact matériel ;
4. branche dédiée liée à l’Issue ;
5. Conventional Commits ;
6. PR liée à l’Issue ;
7. Delivery governance + Quality + Migration vertes ;
8. Review réelle et conversations résolues ;
9. merge uniquement après validation, normalement par squash ;
10. Production uniquement depuis `main` ;
11. GitHub Release uniquement après Production Vercel READY prouvée par le statut de déploiement natif.

**Un commit n’est pas une livraison. Une PR mergée n’est pas encore une livraison Production. Une livraison DTSC n’est considérée réussie que lorsque son SHA a passé les contrôles requis, a été mergé dans "main", déployé avec succès sur Vercel Production et enregistré dans une GitHub Release traçable.**
