# Hotfix #1029 — espace RH personnel (Design 2.0)

## Objectif et périmètre

- Réutiliser `EnterpriseEmployee`, `EnterprisePayrollItem`, `EnterprisePayslip`, `EnterpriseTimesheet` sans créer de paie concurrente.
- Ajouter `EnterpriseWorkClockSession` comme observation réelle horodatée par le serveur, **distincte** du planning, de la présence et de la feuille de temps approuvée.
- Offrir à chaque salarié lié à un membre actif de son entreprise : historique personnel de ses paies approuvées, vrai PDF privé téléchargeable, entrée/sortie de pointage, rapport de travail soumis au validateur, historique de statut.
- Interface RH personnelle accessible depuis le hub ERP ainsi que les workspaces Temps et Paie, FR/EN, couleurs sémantiques, responsive et sombre.

## Autorisations et confidentialité

| Action | Autorisation requise |
| --- | --- |
| Ouvrir l’espace personnel | Session DTSC, membership actif, module concerné actif, abonnement et restriction personnelle vérifiés ; aucun droit de lire le registre RH global requis |
| Lire sa paie | Capacité SELF bornée au propriétaire + module `PAYROLL_OPERATIONS` et entitlement ENTERPRISE, bulletin généré et run `APPROVED` |
| Télécharger son PDF | Même autorisation, comparaison stricte `organizationId + employeeId`, audit, cache désactivé |
| Voir ses temps et rapports | Capacité SELF bornée au propriétaire + module `TIME_ATTENDANCE` et entitlement BUSINESS |
| Pointage/rapport | Capacité SELF de `TIME_ATTENDANCE` pour son dossier uniquement, même origine, Zod, rate limit |
| Registre paie d'entreprise | `manage` complet ; `approve` seuls runs assignés ; `write` seuls runs préparés |
| Registre timesheets | `manage` complet ; `approve` seuls dossiers assignés ; salarié, ses seules feuilles |
| Liste de présence | `manage` complet, sinon salarié uniquement |

La capacité SELF ne donne pas `enterprise.payroll.view` ni accès aux listes d’entreprise ; l’autorisation de gestion reste séparée. Le validateur doit posséder `TIME_ATTENDANCE:approve`. La liste des validateurs indépendants provient de `/my-hr/approvers`, pas du registre global.

Le salarié est résolu uniquement à travers `OrganizationMember.status=ACTIVE, removedAt=null` puis `EnterpriseEmployee.organizationMemberId=member.id, employmentStatus=ACTIVE, archivedAt=null`. Aucun lien par email ou par similitude de nom. Les références inter-tenant ne sont pas suivies.

Le PDF ne prouve **jamais** qu'un paiement financier a été exécuté. Il reprend seulement les lignes du run approuvé. Les montants ne sont pas inclus dans l'audit.

## API

- `GET /api/enterprise/:organizationId/my-hr?page=1&pageSize=10` : réponse personnelle bornée, avec capacités par module et indicateur d'association salarié.
- `POST /api/enterprise/:organizationId/my-hr/clock` : `{action:"START"|"STOP",workSummary?}`, horodatage serveur, révision optimiste, une session ouverte maximum garantie par index PostgreSQL partiel.
- `GET /api/enterprise/:organizationId/my-hr/approvers` : validateurs indépendants autorisés, salarié lié uniquement.
- `POST /api/enterprise/:organizationId/my-hr/reports` : entrée de feuille de temps canonique, `employeeId` forcé au dossier de la session, validateur indépendant via service existant.
- `GET /api/enterprise/:organizationId/my-hr/payslips/:payslipId/pdf?lang=fr|en` : PDF natif `application/pdf` en téléchargement, route privée auditée.

## Migration

`20261105210000_employee_work_clock_sessions`, additive. Crée uniquement la table des sessions de pointage, sa relation tenant-scoped vers `EnterpriseEmployee` et un index PostgreSQL garantissant au plus une session ouverte par salarié.

Aucun backfill artificiel d'heures historiques. Les sessions existantes de présence et de feuille de temps ne sont pas altérées.

## Validation

- `pnpm qa:hotfix-1029` et `pnpm qa:regression`.
- CI obligatoire : migrations PostgreSQL propre, `prisma generate`, TypeScript, lint, build, tests non-RH.
- E2E propriétaire : salarié A/B, aucun accès à la paie de B ; compte sans liaison ; suppression/revocation du membership ; changement d'abonnement ; PDF valide ; double clic pointage/concurrence ; rapport soumis avec autre approbateur ; approbation/rejet ; consultation FR/EN, mode sombre, largeur 320–1024 px, clavier.
- Test de l'impossibilité de téléverser un `employeeId` arbitraire via l'API timesheets historique.

## Flux de livraison / rollback

Issue #1029 → branche → PR → CI → **OWNER_E2E** → fusion `main` → déploiement automatique Vercel production seulement (Preview désactivées). Le retour arrière est applicatif par nouvelle PR ; la table et les sessions historiques restent conservées.

## Limites métier explicites

Le pointage n'approuve aucune heure et ne déclenche aucun paiement. Le rapport de travail ne devient officiel qu'après approbation indépendante. Pas de lien implicite entre identité globale et employé, pas de nouveau moteur de paie, pas de PDF public, pas de nouvelle source de vérité pour le temps.
