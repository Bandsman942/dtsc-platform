# Hotfix #1222 — RETAIL : politique de retours, inspection et provenance des avoirs

> **Statut : IN_PROGRESS / DRAFT — NE PAS FUSIONNER, NE PAS DÉPLOYER.**
> Issue : https://github.com/Bandsman942/dtsc-platform/issues/1222
> Indépendant de #1215. Candidat v1.24.2, base `main` au 23/11/2026.

## Contrat approuvé
- Mode `SIMPLIFIED` paramétrable par société, portée `ALL_SITES`, plafond initial 100 USD.
- Propriétaire/administrateur actif ou gérant habilité peut attester son propre contrôle de retour, si la politique de la demande l'autorisait.
- La décision appartient toujours au validateur désigné ; auto-décision seulement sous délégation.
- Avoir automatique, remboursement `NOW` ou `LATER`, sans approbations Finance redondantes **restent à implémenter**.
- Factures émises/comptabilisées non encaissées : avoir uniquement, créance réduite, zéro paiement sortant.

## Développement présent dans la branche (non certifié)
1. `invoice-return-policy.ts` : contrat Zod fail-closed; lecture/merging JSON par entreprise; pré-calcul `creditAgainstReceivable`/`payoutAmount`.
2. API `GET/PUT /api/enterprise/:organizationId/retail/return-policy`, accès module et rôle propriétaire/admin actif; step-up, révision optimiste, transaction, AuditLog, ApiLog.
3. Panneau Admin FR/EN; les autorisations demeurent propres à chaque boutique.
4. Nouvelle migration **additive** de `EnterpriseRetailInvoiceReturnRequest.returnPolicySnapshot` et `inspectionMode`; aucun backfill, historique legacy = `STANDARD`.
5. Demande et inspection enregistrent un snapshot et `SELF_ATTESTED` ou `INDEPENDENT`; l'API de lecture et la prévalidation de règlement distinguent les deux. Le validateur désigné reste obligatoire.
6. Finance `sales-credit-notes` enrichit chaque avoir lié à une facture checkout RETAIL avec sa provenance et son éventuel retour. `canPost=false` sur les crédits RETAIL, deep-link vers le flux de retour depuis le détail; une pièce sans demande liée affiche un rapprochement requis. Le garde HTTP 409 reste actif.
7. QA de contrat et comportements purs `qa:hotfix-1222` dans Quality Gates.

## Manques bloquants et risques
- L'UI de configuration expose `autoPostCreditNote` et `promptImmediateRefund`, **mais le moteur transactionnel express correspondant n'est pas encore intégré**. Ne pas activer ce mode en entreprise réelle sur cette seule branche.
- Absence de choix `NOW/LATER` rattaché à un ordre transactionnel unique. Ne pas confondre validation métier et décaissement effectivement confirmé.
- Créance de remboursement différé non finalisée dans Finance. Rapprochement des paiements originaux, débit caisse/bancaire et anti-fractionnement du plafond 100 USD non certifiés.
- La comptabilisation atomique de retour standard demeure la voie opérationnelle; les validations Finance séparées restent obligatoires en attendant l'orchestrateur express.
- La concurrence, les remboursements externes, les lots, CDF/USD et les 33 scénarios E2E PostgreSQL/Playwright ne sont pas certifiés.
- Les tests statiques ne prouvent ni une migration complète, ni un navigateur, ni un posting, ni un remboursement.

## E2E — liste bloquante de livraison
E01–E30 tels que spécifiés dans l'Issue #1222; E31 (facture non encaissée, avoir total et payout 0), E32 (avoir partiel impayé), E33 (avoir historique RETAIL, rapprochement et zéro duplication).

| Contrôle | Statut | Preuve |
|---|---|---|
| Lecture du code et contrat existant | CODE_INSPECTED | Références #1185/#1191/#1042, AGENTS.md |
| Fonction policy fail-closed et calcul `payout=0` | NOT_EXECUTED | QA #1222 raccordée à CI, résultat à obtenir |
| Migration PostgreSQL | NOT_EXECUTED | Quality/Migration du SHA final |
| TypeScript / ESLint / build | NOT_EXECUTED | CI requise |
| Parcours financier express | NOT_IMPLEMENTED | Éviter toute certification prématurée |
| E2E PostgreSQL + navigateur E01–E33 | NOT_EXECUTED | Requis sur SHA final |
| OWNER E2E final | NOT_EXECUTED | Attente de validation propriétaire |
| Fusion / Production | NOT_EXECUTED | Interdit tant que blocants ouverts |

## Rollback
Aucune écriture en Production par la branche. Retour applicatif possible via PR de revert. Les colonnes additives peuvent rester si déjà appliquées lors d'un déploiement futur; aucun effacement des preuves et écritures existantes.

## Politique de release
`main` vérifié → issue #1222 → branche dédiée → PR DRAFT → CI verte + preuves E2E réelles → validation explicite `E2E final BON` par propriétaire → fusion `main` et Vercel production native. Ne jamais importer un succès de SHA précédent.
