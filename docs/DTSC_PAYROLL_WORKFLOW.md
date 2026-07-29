# DTSC — Prestations approuvées et workflow de paie

## Objet

Le Sprint 5 prolonge les Sprints 3 et 4 sans raccourcir leur chaîne de responsabilité :

```text
Planning Sprint 3
→ travail réel Sprint 4
→ validation opérationnelle
→ prestations APPROVED
→ préparation HR & CFO
→ approbation financière indépendante
→ paie VALIDATED
→ confirmation du paiement
→ transaction PAYROLL_WORKFLOW / bulletin / historique
```

La disponibilité n'est jamais une source de paie. Une entrée DRAFT ou une soumission SUBMITTED n'est jamais une preuve de paie.

## Source opérationnelle

Le service de paie réutilise `getApprovedWorkForPayroll()` du Sprint 4. Pour une période mensuelle qui coupe une semaine, le service élargit la fenêtre de lecture aux semaines intersectées puis conserve uniquement les `DtscWorkEntry.workDate` réellement compris dans la période de paie.

Exemple : une soumission approuvée du 27 juillet au 2 août peut contribuer aux paies de juillet et d'août, mais seules les entrées datées de juillet sont liées à juillet et seules les entrées d'août restent éligibles à août.

## Salaire de base

Pour un mois calendrier complet, la source standard est `HrcfoEmployee.monthlyCompensation`.

`approvedWorkMinutes` est une preuve opérationnelle. Il ne devient jamais automatiquement un taux horaire, un prorata, une retenue ou un salaire.

Une période partielle n'est pas proratisée automatiquement. Elle exige un `baseAmountOverride` accompagné d'un `baseAmountOverrideReason`. Le même mécanisme est utilisé lorsqu'aucune rémunération mensuelle n'est renseignée dans le dossier RH.

## Ajustements

- `bonusAmount > 0` exige `bonusReason` ;
- `deductionAmount > 0` exige `deductionReason` ;
- les montants sont non négatifs ;
- `netAmount = grossAmount + bonusAmount - deductionAmount` est recalculé côté serveur ;
- une retenue n'est jamais dérivée automatiquement d'une absence ou d'un nombre d'heures.

Un justificatif privé facultatif peut être importé via le mécanisme de fichiers opérationnels déjà contrôlé par DTSC.

## Snapshot des prestations

Chaque nouvelle paie Sprint 5 conserve :

- `approvedWorkMinutes` ;
- `approvedWorkEntryCount` ;
- `approvedSubmissionCount` ;
- `workEvidenceCapturedAt` ;
- `workCoverage` ;
- les liens `HrcfoPayrollWorkEntry` vers les entrées approuvées utilisées.

Une entrée liée activement ne peut pas être réutilisée par une autre paie. Une annulation DRAFT ou un refus terminal libère la réservation sans supprimer l'historique du lien.

## Couverture opérationnelle

`workCoverage` vaut :

- `COMPLETE` : toutes les semaines intersectant la période ont des preuves approuvées utilisées ;
- `PARTIAL` : certaines seulement ;
- `NONE` : aucune entrée approuvée dans la période.

Cette couverture n'est pas une décision salariale. `PARTIAL` ou `NONE` exige une justification explicite avant soumission, par exemple congé payé, maladie autorisée, entrée en fonction ou autre situation RH.

## Machine d'état

```text
DRAFT → PENDING_APPROVAL
PENDING_APPROVAL → VALIDATED
PENDING_APPROVAL → CHANGES_REQUESTED
PENDING_APPROVAL → REJECTED
CHANGES_REQUESTED → PENDING_APPROVAL
VALIDATED → PAID
DRAFT → CANCELLED
```

Les états VALIDATED, PAID, REJECTED et CANCELLED sont terminaux ou fortement verrouillés. Les montants, la période, le collaborateur, le budget et le snapshot ne peuvent plus être réécrits silencieusement après validation.

## Séparation des responsabilités

Le HR & CFO prépare, documente, corrige, soumet puis confirme le paiement après approbation. Il ne réalise pas l'approbation financière.

| Paie concernée | Approbateur financier |
| --- | --- |
| Collaborateur standard | CEO |
| CTO | CEO |
| MPO | CEO |
| SCO | CEO |
| LA | CEO |
| HR & CFO | CEO |
| COO | CEO |
| CEO | COO |

Le poste officiel `HrcfoEmployee → DtscPosition` est réévalué côté serveur. Le rôle global ADMIN ne remplace pas cette matrice.

Aucun collaborateur ne peut approuver sa propre paie. Cette règle existe dans le service et dans la base PostgreSQL.

## Impact financier

DRAFT et PENDING_APPROVAL ne créent aucune transaction.

Lors de `PENDING_APPROVAL → VALIDATED`, le service réutilise le moteur financier de `lib/hr-cfo-finance.ts` dans la même transaction PostgreSQL :

1. verrouillage métier de la paie ;
2. revalidation du snapshot de travail ;
3. revalidation du budget et du compte ;
4. revalidation du net et des motifs ;
5. création au plus une fois d'une transaction `sourceType = PAYROLL_WORKFLOW`, `sourceId = payroll.id` ;
6. passage à VALIDATED et historisation de l'approbateur.

La base possède une unicité partielle sur cette source pour bloquer un double débit.

`VALIDATED → PAID` ne crée pas de seconde transaction : HR & CFO passe la transaction existante de VALIDATED à PAID et enregistre `paidAt`.

## Compatibilité historique

Les anciennes `HrcfoPayroll` ont `workflowVersion = null`. Elles restent consultables et leurs bulletins restent lisibles. Elles ne reçoivent pas de faux snapshots Sprint 4 et ne sont pas pilotées artificiellement par la nouvelle machine d'état.

Les nouveaux champs sont ajoutés de manière nullable ou avec des valeurs par défaut sûres.

## Bulletin

Le bulletin montre le collaborateur, le poste, la période, le brut, la prime, la retenue, le net, un résumé du temps approuvé, le statut, la date de validation et la date de paiement.

Le collaborateur ne voit jamais le budget ou le compte financier sur son propre espace ou son bulletin.

## Notifications

Le système central `notifyUser` / `notifyUsers` + Web Push est réutilisé :

- soumission de paie → approbateur ;
- correction/refus → HR & CFO ;
- validation → HR & CFO + collaborateur ;
- paiement → collaborateur.

Les Push restent synthétiques et n'exposent pas les montants sur l'écran verrouillé.

## Déploiement

Le workflow Vercel reste inchangé :

```text
feature branch
→ GitHub Quality Gates
→ PR / review
→ merge main
→ Vercel Production unique
→ prisma migrate deploy
→ pnpm build
```

Aucun Preview Deployment et aucun `vercel --prod` manuel n'est introduit par le Sprint 5.

## Frontière Sprint 6

Le Sprint 5 ne crée aucun moteur ERP générique, aucune `EnterpriseTask`, `EnterpriseRequest`, `EnterpriseApproval` ou `EnterpriseMeeting`. Ces sujets restent hors de cette PR.


## Sécurité des justificatifs privés

Les justificatifs d'ajustement utilisent exclusivement l'upload privé `operation-files` déjà contrôlé par DTSC. Le backend refuse une URL arbitraire ou un fichier appartenant à un autre utilisateur préparateur. La route d'upload applique same-origin, limites MIME/taille, rate limiting, RBAC, audit et stockage Supabase privé. L'approbateur peut ouvrir le justificatif depuis le détail financier sans rendre le fichier public.

<!-- PAYROLL_PERIOD_RETRY_HOTFIX -->
## Hotfix — soumission explicite et nouvelle préparation après annulation/refus

Une paie `CANCELLED` ou `REJECTED` reste conservée pour l'audit mais ne réserve plus définitivement le couple collaborateur + période. La base conserve une unicité partielle sur les paies financièrement actives ; une nouvelle préparation est donc autorisée après annulation/refus, tandis qu'un DRAFT, PENDING_APPROVAL, CHANGES_REQUESTED, VALIDATED ou PAID continue de bloquer un doublon actif.

La préparation HR & CFO expose désormais une readiness de soumission avec l'approbateur attendu et les blocages lisibles (couverture à justifier, budget/compte, montant, preuve de travail ou approbateur absent). Le bouton de soumission est désactivé lorsque ces prérequis visibles ne sont pas satisfaits, et le backend répète les contrôles au moment du POST. Les erreurs d'action financière sont affichées explicitement comme erreurs et dans la modale, sans dépendre d'une déduction par mots-clés du toast.
<!-- /PAYROLL_PERIOD_RETRY_HOTFIX -->
