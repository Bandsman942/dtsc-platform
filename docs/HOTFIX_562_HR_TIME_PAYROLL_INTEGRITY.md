# Hotfix #562 — Intégrité Ressources humaines, Temps/présences/congés et Paie

## Statut

Hotfix P1 sur la branche `fix/562-hr-time-payroll`, créée depuis `main@c2f26a53a46004a5bb9cfae3063bc80cdd654ac7`.

Cette correction applique aux domaines People les mêmes principes déjà stabilisés dans les workspaces professionnels récents : source de vérité unique, formulaires guidés, références canoniques, revue explicite des transitions sensibles, erreurs métier humaines, isolation tenant, audit et continuité inter-module sans dual-write.

## Frontières métier opposables

```text
Dossier RH / contrat actif
        ↓
horaire attendu ≠ présence observée ≠ congé/absence ≠ temps déclaré ≠ temps approuvé
                                                          ↓
                                                   preuve de couverture
                                                          ↓
                                                   paie opérationnelle
                                                          ↓
                                                approbation + bulletins
                                                          ↓
                                              paiement Finance explicite
```

Règles :

- `HUMAN_RESOURCES` reste l’autorité du collaborateur, du poste, du département, du responsable, du site et de la rémunération contractuelle ;
- `TIME_ATTENDANCE` rapproche planning, présence, congés et feuilles de temps sans les fusionner ;
- le temps approuvé est une preuve de couverture, pas une formule automatique de salaire ;
- `PAYROLL_OPERATIONS` calcule, soumet, approuve et génère les bulletins ;
- une paie approuvée n’est **pas** un paiement effectué ;
- `FINANCE_PAYMENTS` reste l’autorité du décaissement, de la confirmation, de la trésorerie et de la comptabilisation associée ;
- aucune auto-approbation n’est autorisée pour RH, Temps/présences/congés ou Paie.

## Diagnostic approfondi

### Ressources humaines

| Incohérence | Risque | Correction |
|---|---|---|
| Le champ historique `jobTitle` pouvait transporter du texte libre puis contaminer `EnterpriseEmployee.positionCode`. | Divergence avec `EnterprisePosition`, organigramme incohérent, RBAC métier fragile. | `jobTitle` ne transporte plus que le `positionCode` canonique ; le serveur résout le poste actif et met à jour `positionId` + `positionCode`. |
| Poste, département et site n’étaient pas tous réconciliés comme un ensemble métier. | Poste rattaché au mauvais département ou référence hors tenant. | Validation serveur même `organizationId`, statut actif et contrôle `position.departmentId`. |
| Une politique générique pouvait encore rendre possible une auto-validation de secours. | Validation de son propre contrat ou de ses propres données sensibles. | Liste stricte `HUMAN_RESOURCES`, `TIME_ATTENDANCE`, `PAYROLL_OPERATIONS` dans le helper RH avant le moteur générique. |
| Les écrans historiques mélangeaient sélecteurs et validations ponctuelles. | UX instable et logique dupliquée. | Lookup spécialisé `hr-payroll-lookups`, approbateurs préfiltrés par capacité et exclusion du demandeur. |
| Les anciens flux de décision utilisaient des interactions non guidées. | Motifs faibles, mauvais comportement mobile, audit peu lisible. | Dialogs `presentation="editor"`, motif obligatoire au rejet, loading/disabled et toast. |

### Temps, présences et congés

| Incohérence | Risque | Correction |
|---|---|---|
| `EnterpriseWorkSchedule` et `EnterpriseAttendance` existaient dans le modèle mais n’étaient pas réellement exposés dans le workspace. | Module incomplet et confusion entre planning, présence et timesheet. | Quatre vues distinctes : horaires planifiés, présence observée, congés, feuilles de temps. |
| Une présence pouvait être enregistrée sans rapprochement avec un congé approuvé. | Présent et absent toute la journée simultanément. | Refus d’une présence non-ABSENT pendant un congé complet approuvé. |
| Une absence pouvait porter des heures observées. | Sémantique contradictoire. | `ATTENDANCE_ABSENT_WITH_OBSERVED_TIME`. |
| Plusieurs présences pour un collaborateur et une date. | Double preuve. | Unicité existante + contrôle métier `ATTENDANCE_ALREADY_RECORDED`. |
| Horaires planifiés chevauchants. | Planning contradictoire. | Contrôle des intervalles et des périodes d’effet dans `createEnterpriseWorkSchedule`. |
| Les références avancées de timesheet n’étaient pas toutes revalidées. | Fuite cross-tenant ou lien vers un objet sans rapport. | Validation projet, jalon, livrable, tâche, contrat, tiers et catalogue dans le même tenant. |
| La durée pouvait dépendre d’un total déclaré par le client alors que début/fin étaient fournis. | Temps manipulable ou incohérent. | Recalcul serveur `(fin - début - pause)` ; rejet des durées impossibles. |
| Une feuille hebdomadaire chevauchant deux mois pouvait disparaître de la preuve de paie d’un mois. | Couverture de temps incomplète. | La paie agrège les lignes approuvées dont `workDate` appartient réellement à la période. |
| L’annulation d’un congé n’avait pas de parcours professionnel explicite. | Historique difficile à expliquer. | Route d’annulation révisionnée avec motif, audit et conservation de l’objet. |

### Paie opérationnelle

| Incohérence | Risque | Correction |
|---|---|---|
| Primes/retenues pouvaient être non nulles sans justification suffisamment forte. | Variable non auditée. | `PAYROLL_BONUS_REASON_REQUIRED` et `PAYROLL_DEDUCTION_REASON_REQUIRED`, plus champs distincts dans la revue guidée. |
| Une variable pouvait cibler un collaborateur hors population sélectionnée. | Ajustement caché ou erreur de mapping. | `PAYROLL_ADJUSTMENT_EMPLOYEE_OUTSIDE_POPULATION`. |
| L’ancienne UX utilisait `window.prompt` pour certaines décisions. | Mauvais contrat mobile/accessibilité et perte de contexte. | Dialogs de revue pour validation, rejet et annulation. |
| Le rôle du temps approuvé pouvait être interprété comme une base de prorata implicite. | Salaire contractuel modifié sans règle de paie explicite. | Le backend conserve `approvedTimeMinutes` comme preuve uniquement ; `baseGrossAmount` vient du contrat actif. |
| La transition vers Finance n’était pas suffisamment explicite dans le workspace. | Utilisateur susceptible de considérer « approuvé » comme « payé ». | Message de frontière + lien vers `FINANCE_PAYMENTS` uniquement après approbation. |

### Continuité Finance

Un paiement de paie est désormais contrôlé côté Finance :

- `PAYROLL_PAYMENT` exige `payrollRunId` ;
- une référence `payrollRunId` est interdite pour un autre type de paiement ;
- la paie doit être `APPROVED` dans la même entreprise ;
- le paiement doit être `OUTBOUND` ;
- la devise doit être identique à celle de la paie ;
- le paiement global de paie ne mélange pas simultanément tiers ou collaborateur individuel ;
- la somme des paiements non annulés/non reversés ne peut pas dépasser le net de la paie ;
- un paiement de paie n’est pas une allocation client/fournisseur et son `unallocatedAmount` est donc nul ;
- la confirmation reste l’étape qui crée le mouvement de trésorerie et déclenche le posting Finance existant.

Cette correction ne crée volontairement ni dette fournisseur artificielle ni paiement automatique au moment de l’approbation de la paie.

## Workflows et Validations

Les objets RH, congés, timesheets et paie continuent d’utiliser `EnterpriseApproval` comme source canonique de validation et `publishHrEvent` alimente le moteur de workflow. Le hotfix ne crée aucun deuxième moteur de validation.

Les approbateurs visibles sont dérivés des permissions du module et revalidés au serveur au moment de la mutation. Les trois domaines sensibles interdisent explicitement l’auto-approbation.

## UX appliquée

Les formulaires touchés suivent le contrat professionnel :

- `Dialog presentation="editor"` pour les flux longs/sensibles ;
- sélecteurs canoniques au lieu d’IDs techniques ;
- pagination des listes ;
- détails ouvrables ;
- revue séparée avant rejet/annulation/approbation ;
- motif requis pour les rejets/annulations ;
- état loading/disabled pendant mutation ;
- toast global ;
- saisie conservée si le backend refuse l’opération ;
- séparation explicite des concepts métier dans les libellés.

## Prisma / migration

**Aucune migration.**

Les tables `EnterpriseWorkSchedule`, `EnterpriseAttendance`, `EnterpriseLeaveRequest`, `EnterpriseTimesheet`, `EnterprisePayroll*` existaient déjà. Le hotfix rembourse une dette d’exploitation de ces modèles au lieu de créer une seconde source de vérité.

## Sécurité

Les routes nouvelles ou modifiées conservent :

- session ;
- contexte organisation ;
- accès module ;
- permission d’action ;
- validation Zod ;
- same-origin pour mutation ;
- rate limiting ;
- références revalidées dans le même `organizationId` ;
- transaction lorsque plusieurs écritures doivent rester atomiques ;
- ApiLog/AuditLog ;
- événements de workflow.

## QA permanente

`qa-enterprise-hr-payroll-checks.mjs` couvre désormais :

- validation des référentiels RH ;
- indépendance des approbations ;
- planning et présence ;
- annulation de congé ;
- références timesheet et calcul serveur de durée ;
- preuve de temps consommée par la paie ;
- justification des variables ;
- frontières paie/paiement ;
- intégrité du paiement de paie ;
- absence de `window.prompt` ;
- formulaires `editor` et états de mutation.

Le gate People i18n mesure le nouveau contrat sans exiger l’ancien mécanisme `approval-eligibility` dans le frontend.

## Preuves avant merge

Les statuts restent `NOT_EXECUTED` tant que GitHub Actions ou un environnement d’exécution ne les a pas réellement produits.

| Contrôle | Statut |
|---|---|
| Diff final vs `main` | NOT_EXECUTED |
| Prisma generate | NOT_EXECUTED |
| Type-check | NOT_EXECUTED |
| QA RH/Temps/Paie | NOT_EXECUTED |
| QA People i18n | NOT_EXECUTED |
| QA professionnelle RH | NOT_EXECUTED |
| QA professionnelle Temps/congés | NOT_EXECUTED |
| QA professionnelle Paie | NOT_EXECUTED |
| Régression globale | NOT_EXECUTED |
| Lint | NOT_EXECUTED |
| Build | NOT_EXECUTED |
| OWNER_E2E RH | NOT_EXECUTED |
| OWNER_E2E Temps/présences/congés | NOT_EXECUTED |
| OWNER_E2E Paie | NOT_EXECUTED |

## Rollback

Le rollback applicatif consiste à revert la PR #562. Aucune migration de schéma ou suppression de donnée n’étant introduite, aucun rollback SQL n’est nécessaire.

Les nouveaux horaires, présences, congés, timesheets, paies ou paiements créés après mise en production restent des données métier canoniques et ne doivent jamais être supprimés par un rollback de code.

## Dette de contribution

- **Dette créée :** aucune visée.
- **Dette maintenue :** la colonne historique `EnterpriseEmploymentContract.jobTitle` reste physiquement nommée ainsi ; elle transporte désormais uniquement le code du poste canonique afin d’éviter une migration destructive dans ce hotfix.
- **Dette remboursée :** écrans Temps incomplets, prompts de décision, références métier insuffisamment revalidées, durée de timesheet trop confiante envers le client, variables de paie non justifiées, couverture de temps par bornes de timesheet, ambiguïté paie/paiement.
- **Dette reportée :** aucune dette fonctionnelle nécessaire au contrat de #562 n’est volontairement reportée.

- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
