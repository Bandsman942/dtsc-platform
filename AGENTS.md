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

## 10. UI/UX, mobile et accessibilité

- Réutiliser `ModuleWorkspace`, `ModuleHeader`, `ModuleMetrics`, `ModuleContent`, `ModuleSection`, `BusinessList`, `BusinessListItem`, `BusinessDetail`, `ContextActions`, `StatusBadge` et `EmptyState` avant de créer des primitives parallèles.
- Éviter les cartes dans des cartes ; préférer header métier → contrôles → contenu → actions contextuelles.
- Les actions contextuelles passent par un menu `...`, sont réellement implémentées et respectent les permissions.
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
