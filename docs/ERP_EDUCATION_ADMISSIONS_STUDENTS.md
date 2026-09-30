# DTSC Education — EDU-2 Admissions, étudiants et tuteurs

## 1. Objectif

EDU-2 livre le registre étudiant et le cycle d’admission sans confondre les identités métier Education avec les comptes DTSC.

Chaîne canonique :

```text
Candidat
  ↓
Dossier d’admission
  ↓
Étude
  ↓
Décision
  ↓
Inscription
  ↓
Affectation académique
  ↓
Étudiant actif
```

## 2. Frontières d’autorité

- `User` et `OrganizationMember` restent l’autorité Core pour les comptes et memberships.
- `EnterpriseBusinessParty` reste l’autorité ERP commune pour un tiers/contact générique.
- `EnterpriseDocument` reste l’autorité pour les fichiers privés.
- Education devient l’autorité pour candidat, admission, étudiant, tuteur Education, inscription et placement académique.
- Aucun document binaire, compte, membership, facture ou paiement n’est dupliqué dans EDU-2.

## 3. Modèles

EDU-2 ajoute :

- `EnterpriseEducationCandidate`;
- `EnterpriseEducationAdmissionApplication`;
- `EnterpriseEducationAdmissionDecision`;
- `EnterpriseEducationStudent`;
- `EnterpriseEducationGuardian`;
- `EnterpriseEducationStudentGuardian`;
- `EnterpriseEducationEnrollment`;
- `EnterpriseEducationEnrollmentPlacement`;
- `EnterpriseEducationEnrollmentHistory`.

Toutes les entités relationnelles portent `organizationId` et les relations académiques utilisent des clés composites tenant-aware.

## 4. Admission

États :

```text
DRAFT
→ SUBMITTED
→ UNDER_REVIEW
→ ACCEPTED | REJECTED | WAITLISTED
```

Une liste d’attente peut repasser en étude. Une admission acceptée peut ensuite être convertie en inscription. La décision crée un `EnterpriseEducationAdmissionDecision` append-only.

La création d’inscription est idempotente : un dossier accepté ne peut produire qu’une seule inscription et un candidat ne peut produire qu’un seul étudiant dans la même organisation.

## 5. Étudiant et inscription

`EnterpriseEducationStudent` peut exister sans `User`. Les champs `userId` et `businessPartyId` sont optionnels et revalidés côté service dans la même organisation.

Une inscription porte l’année académique ; l’affectation campus/programme/niveau/classe est portée par `EnterpriseEducationEnrollmentPlacement`.

Un transfert :

1. clôt l’affectation active via `effectiveUntil`;
2. crée un nouveau placement ;
3. crée un événement `EnterpriseEducationEnrollmentHistory`;
4. incrémente la révision de l’inscription.

Aucun transfert ne réécrit le placement historique.

## 6. Tuteurs

`EnterpriseEducationGuardian` est un profil Education. Il peut référencer un `User` actif de l’organisation et/ou un `EnterpriseBusinessParty` du même tenant, sans créer de membership.

`EnterpriseEducationStudentGuardian` stocke le type de relation et les indicateurs principal, légal, facturation et notifications.

## 7. Documents

Les pièces d’admission et justificatifs restent `EnterpriseDocument` privés. EDU-2 ne crée aucune table de blob.

Les liens documentaires utilisent `sourceEntityType/sourceEntityId` ou `EnterpriseEntityLink` après validation du tenant. Les URL signées, chemins de stockage et fichiers ne sont jamais placés dans les logs Education.

## 8. APIs

```text
GET/POST   /api/enterprise/[organizationId]/education/population?moduleCode=ADMISSIONS|STUDENTS|GUARDIANS
PATCH      /api/enterprise/[organizationId]/education/admissions/[id]
POST       /api/enterprise/[organizationId]/education/admissions/[id]/actions
PATCH      /api/enterprise/[organizationId]/education/students/[id]
POST       /api/enterprise/[organizationId]/education/students/[id]/guardians
POST       /api/enterprise/[organizationId]/education/enrollments/[id]/actions
```

Les mutations appliquent session, contexte organisation, module/entitlement, permission, same-origin, rate-limit, Zod, révision, validation tenant et audit.

Les suppressions physiques de dossiers académiques sont refusées.

## 9. Modules et permissions

Modules actifs :

- `ADMISSIONS`;
- `STUDENTS`;
- `GUARDIANS`.

Préfixes :

- `enterprise.education.admissions.*`;
- `enterprise.education.students.*`;
- `enterprise.education.guardians.*`.

La décision d’admission utilise l’action module `approve`, distincte d’une écriture normale.

## 10. Migration

Migration additive :

```text
prisma/migrations/20260928164000_education_admissions_enrollments/migration.sql
```

Elle ajoute les tables EDU-2 et étend le template Education v2 pour les nouvelles organisations comme pour les organisations Education existantes.

Aucun `DROP`, aucune conversion destructive et aucun dual-write legacy.

## 11. QA

Commande ciblée :

```bash
pnpm qa:education-admissions
```

Elle doit rester intégrée à `pnpm qa:regression`.

Les gates couvrent modèles tenant-aware, migration additive, modules, permissions, transitions, absence de suppression physique, références inter-tenant, pagination, i18n, mobile, guides et runbook OWNER_E2E.

## 12. Rollback

Le rollback applicatif est un revert de la PR EDU-2. Les tables additives peuvent rester inutilisées après revert ; aucune migration destructive de rollback n’est exécutée automatiquement.
