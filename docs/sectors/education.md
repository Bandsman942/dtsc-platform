# DTSC Education — Contrat d’architecture EDU-0

Statut : **opposable avant EDU-1**
Programme : #279
Itération : #280
Baseline : main@85a119cd9a55b800ae8364e16dcf25b02f2a9323

Sources auditées EDU-0 : `docs/enterprise-sector-modules.md`, `lib/enterprise/module-registry.ts`, `prisma/schema.prisma` et la migration historique `prisma/migrations/20260527143000_enterprise_sector_templates/migration.sql`. Livraison suivie par la PR #677.

## 1. Mission

DTSC Education est une extension sectorielle de DTSC Platform pour écoles, instituts, centres de formation et universités. Elle consomme le Core et l’ERP commun au lieu de recréer un ERP parallèle.

EDU-0 ne crée aucun modèle académique de production. Il fixe les frontières que les itérations EDU-1 à EDU-10 devront respecter.

## 2. Sources de vérité

| Domaine | Autorité canonique | Education peut faire | Education ne doit jamais faire |
| --- | --- | --- | --- |
| Organisation, utilisateurs, memberships | Core Platform | référencer Organization, User et OrganizationMember | recréer comptes, memberships ou rôles globaux |
| Collaborateurs / RH | ERP commun RH | ajouter un profil ou une affectation académique reliée au collaborateur | recréer paie, contrat RH, congés ou dossier employé |
| Tiers / contacts | ERP commun Tiers | relier tuteurs, responsables et partenaires lorsque pertinent | créer une deuxième source générique de tiers |
| Finance | ERP Finance | exprimer un besoin de frais, remise ou bourse et relier la facture commune | créer EducationInvoice, EducationPayment, caisse, allocation ou GL parallèle |
| Comptabilité | ERP Comptabilité | fournir dimensions et source métier au posting commun | écrire un journal comptable sectoriel concurrent |
| Achats | ERP Procurement | consommer achats et fournisseurs communs | recréer commandes ou factures fournisseur |
| Documents | Documents communs | classifier et relier un document privé au contexte académique | stocker des fichiers publics ou des blobs sectoriels parallèles |
| Tâches / demandes / validations / workflows | moteurs communs | créer des liens source minimaux vers les objets académiques | dupliquer leurs machines d’état |
| Notifications | service commun | émettre des événements métier et deep links | maintenir une seconde inbox |
| Audit | AuditLog / ApiLog | ajouter événements Education sans données sensibles inutiles | créer un journal d’audit privé non corrélé |
| IA | AI Platform / Tool Gateway | exposer outils READ/PREPARE autorisés par module et tenant | contourner RBAC, entitlements ou Tool Gateway |

## 3. Identités métier

Les identités User, OrganizationMember, futur EducationStudent et futur EducationGuardian restent distinctes. Un étudiant ou un tuteur peut exister sans compte DTSC. Une liaison vers un compte DTSC est explicite, tenant-scoped, révocable et ne change pas automatiquement les droits académiques.

Le futur profil académique d’un collaborateur est une extension métier d’un membre ou staff existant, jamais un second dossier RH.

## 4. Modèle conceptuel cible

### Institution et structure

EducationInstitutionSettings décrit uniquement les paramètres académiques propres à l’organisation. Le multi-campus est obligatoire dès EDU-1 avec une entité campus tenant-scoped. Les structures prévues couvrent année académique, périodes, niveaux, programmes, facultés ou départements académiques, classes ou cohortes, matières, offres de cours et calendrier.

### Admissions et population scolaire

Admissions, dossiers candidats, décisions, inscriptions, étudiants, tuteurs, transferts, retraits et statuts académiques appartiennent à Education. Les pièces jointes passent par Documents.

### Enseignement

Les affectations pédagogiques lient un collaborateur autorisé à une offre de cours, un campus, une période et éventuellement une classe. Le planning doit détecter les conflits et ne remplace pas le calendrier transversal.

### Présences et évaluations

Les présences, évaluations, barèmes, notes, résultats et bulletins sont des autorités Education. Les corrections sensibles sont versionnées et auditées ; une note publiée n’est jamais réécrite silencieusement.

### Frais scolaires

Education possède le besoin métier : type de frais, échéancier, affectation à l’étudiant, remise ou bourse et contexte académique. La facture, la créance, le paiement, l’allocation, la trésorerie et l’écriture comptable restent des objets Finance communs reliés de façon idempotente.

## 5. Multi-campus et isolation

Toute table Education future porte organizationId ou une relation tenant-aware équivalente. Les objets dont la portée est locale portent également campusId.

Règles obligatoires :

1. aucune référence croisée entre deux organisations ;
2. un campus appartient à une seule organisation ;
3. une inscription, une affectation pédagogique et une session de présence sont résolues dans la même organisation ;
4. les listes volumineuses sont paginées côté serveur ;
5. un identifiant fourni par le client est toujours revalidé dans le tenant actif ;
6. aucun rôle DTSC global n’accorde automatiquement un accès aux données scolaires d’un client.

## 6. Modules canoniques cibles et états

Codes réservés par le programme #279 : EDUCATION_SETTINGS, ACADEMIC_STRUCTURE, ACADEMIC_CALENDAR, ADMISSIONS, STUDENTS, GUARDIANS, TEACHING_STAFF, COURSES, TEACHING_ASSIGNMENTS, TIMETABLES, ATTENDANCE, ASSESSMENTS, GRADES, ACADEMIC_RESULTS, REPORT_CARDS, SCHOOL_FEES, SCHOLARSHIPS, DISCIPLINE, EDUCATION_DOCUMENTS, ACADEMIC_REPORTING, EMIS_REPORTING, EDUCATION_AUDIT et EDUCATION_INTEGRATIONS.

Décision EDU-0 : **aucun de ces modules ne devient ACTIVE ou BETA par simple déclaration**. Chaque code reste conceptuellement PLANNED jusqu’à l’itération qui fournit modèle ou service, route, workspace, permission, entitlement et QA. Le registre canonique est étendu au fur et à mesure des itérations, sans carte active prématurée.

## 6.1 Audit du template Education v1 existant

La migration historique `20260527143000_enterprise_sector_templates` seed déjà un template Education v1 avec les modules : STUDENTS, TEACHERS, CLASSES, COURSES, ATTENDANCE, EXAMS_GRADES, SCHOOL_FEES, PARENTS_GUARDIANS, DISCIPLINE et ACADEMIC_REPORTS.

Elle seed également les blocs d’activité REPORT_ABSENCE, SUBMIT_CLASS_REPORT, ENTER_GRADES, REQUEST_PARENT_MEETING, REPORT_DISCIPLINE_INCIDENT et REQUEST_ACADEMIC_VALIDATION.

Décision de cutover EDU-0 : cette migration historique est immuable. Les noms v1 ne deviennent pas automatiquement des codes canoniques actifs. Les itérations suivantes créent une **nouvelle version de template additive** et gèrent explicitement les convergences :

- STUDENTS → STUDENTS ;
- TEACHERS → TEACHING_STAFF ;
- CLASSES → ACADEMIC_STRUCTURE, avec classes/cohortes comme entités du domaine ;
- COURSES → COURSES ;
- ATTENDANCE → ATTENDANCE ;
- EXAMS_GRADES → ASSESSMENTS + GRADES, donc pas d’alias automatique un-vers-plusieurs ;
- SCHOOL_FEES → SCHOOL_FEES ;
- PARENTS_GUARDIANS → GUARDIANS ;
- DISCIPLINE → DISCIPLINE ;
- ACADEMIC_REPORTS → ACADEMIC_REPORTING.

Les anciens targetModuleCode des blocs d’activité ne doivent être réorientés qu’au moment où leur module canonique dispose d’un vrai resolver, workspace et QA. Aucun code v1 ne doit ouvrir un CRUD générique en contournant le registre canonique.

## 7. Capabilities et permissions

Les permissions Education utiliseront des préfixes dédiés et des actions bornées : EDUCATION_SETTINGS:manage, ACADEMIC_STRUCTURE:read|write|manage, ADMISSIONS:read|write|decide, STUDENTS:read|write, ATTENDANCE:read|record|correct, ASSESSMENTS:read|write|publish, GRADES:read|record|correct|publish, SCHOOL_FEES:read|prepare, DISCIPLINE:read|write|review et ACADEMIC_REPORTING:read|export.

Les actions Finance réelles restent contrôlées par les permissions Finance correspondantes. Une permission Education n’accorde jamais implicitement une permission Finance.

## 8. Entitlements et template sectoriel

Le secteur EDUCATION existe déjà dans BusinessSector. Le template sectoriel doit rester idempotent et n’activer que des modules effectivement livrés.

Le template peut recommander Finance, Documents, RH et IA, mais une recommandation n’est ni un entitlement ni une permission. Une entreprise sans entitlement d’un module reste bloquée par le resolver canonique.

## 9. Événements métier

Les événements futurs utilisent des noms stables : EDUCATION_ADMISSION_SUBMITTED, EDUCATION_ADMISSION_DECIDED, EDUCATION_ENROLLMENT_CREATED, EDUCATION_ENROLLMENT_STATUS_CHANGED, EDUCATION_ATTENDANCE_RECORDED, EDUCATION_ATTENDANCE_CORRECTED, EDUCATION_ASSESSMENT_PUBLISHED, EDUCATION_GRADE_RECORDED, EDUCATION_GRADE_CORRECTED, EDUCATION_RESULTS_PUBLISHED, EDUCATION_FEE_ASSIGNED, EDUCATION_FEE_FINANCE_LINKED, EDUCATION_DISCIPLINE_RECORDED et EDUCATION_DISCIPLINE_REVIEWED.

Les événements ne transportent pas de secret ni de document complet. Ils référencent les objets nécessaires au deep link et au traitement autorisé.

## 10. Documents et confidentialité

Les documents académiques restent privés. Les routes de téléchargement contrôlent session, tenant, permission et relation à l’objet Education avant d’émettre un accès temporaire.

Les données disciplinaires, résultats non publiés et pièces d’admission sont classées au minimum CONFIDENTIAL. Une intégration IA externe n’y accède pas sans politique explicite.

## 11. IA gouvernée

Education ne crée pas de provider ni de routeur IA. Les assistants utilisent le catalogue, l’orchestrateur, les quotas, le Tool Gateway et les classifications existants. EDU-9 pourra exposer des outils Education seulement après vérification du module actif, de l’entitlement, de la permission, du tenant et du périmètre de données. SECRET n’est jamais transmis au modèle.

## 12. Cutover et rollback

EDU-1 commence de façon additive. Aucun objet générique historique n’est converti par similarité textuelle. Si une donnée Education historique existe dans EnterpriseSectorRecord, sa migration future doit disposer d’un script idempotent, borné, --dry-run, avec preuve de mapping et archivage read-only de la source. Aucun dual-write permanent n’est autorisé.

Rollback EDU-0 : revert documentaire et QA uniquement. Aucun schéma ni donnée n’est modifié.

## 13. Gates EDU-0

La QA EDU-0 doit échouer si le contrat disparaît, si Finance, Documents ou RH cessent d’être déclarés comme autorités communes, si un modèle Prisma EducationInvoice, EducationPayment, EducationCashSession, EducationJournalEntry ou EducationPayroll apparaît, si le secteur EDUCATION disparaît, si des modules académiques sont activés prématurément, ou si la QA EDU-0 sort de qa:regression.

## 14. Dépendances des itérations

EDU-0 → EDU-1 → EDU-2 → EDU-3 → EDU-4 → EDU-5 → EDU-6 → EDU-7 → EDU-8 → EDU-9 → EDU-10.

Les développements peuvent préparer des interfaces entre itérations, mais aucune itération ne contourne les autorités et gates définies ici.
