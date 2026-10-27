# Hotfix #910 — CREDIT relationnel Retail : attribution manuelle et passif client

Baseline : `main@a1706b02884765820d19852c985a2247a89dffbd`.
Parents : #886 et #785. Issue dédiée : #910.

## Contrat métier
Le type `CREDIT` est un montant forfaitaire explicitement accordé au bénéficiaire d'une relation active et consentie. Ce n'est ni une remise POS, ni un cashback proportionnel, ni un prêt/une créance. L'avoir est affecté au `EnterpriseRetailStoredValueAccount` de type `STORE_CREDIT` pour le même client, l'entreprise et la devise ; aucune deuxième table de solde.

Une demande initiée par un administrateur autorisé doit porter justification et document justificatif vérifié. Un second acteur habilité l'approuve. La validation et l'écriture `EARN`, la consommation d'un quota relationnel et la comptabilisation sont une **transaction unique**. Une demande préparée ou rejetée ne crédite jamais le solde. L'auto-validation est interdite.

## États attendus
`REQUESTED` (préparation) → `CONSUMED` (approbation et crédit confirmé), ou `REJECTED`. `CONSUMED` → `CANCELLED` exige une réversion compensatoire réelle. Le marqueur `MANUAL_RETAIL_CREDIT` distingue ce parcours des demandes des membres et des effets automatiques POS.

## Comptabilité
Événements enregistrés dans le registre unique de posting :
- `RETAIL_RELATIONSHIP_CREDIT_GRANTED` : Débit `OPERATING_EXPENSE`, Crédit `CUSTOMER_ADVANCES` ;
- `RETAIL_RELATIONSHIP_CREDIT_REVERSED` : Débit `CUSTOMER_ADVANCES`, Crédit `OPERATING_EXPENSE`.

Le builder vérifie la source `EnterpriseRelationshipBenefitUsage`, l'identité du compte canonique, l'écriture Stored Value `EARN`/`REVERSAL`, la devise et les montants. Il ne peut jamais comptabiliser un simple clic ou une déclaration d'approbation sans mouvement monétaire vérifiable. Journaux `ADJUSTMENT`, période et mappings sémantiques requis ; échec = rollback.

## Clé de reprise
- EARN : `credit:relationship:usage:<usageId>`
- REVERSAL : `credit:relationship:reversal:<usageId>`

Rejeux avec contexte différent = conflit, jamais double attribution.

## Gates non encore prouvées
- [x] Parcours serveur d'initiation/validation indépendante + justificatif EnterpriseDocument ACTIVE et ORGANIZATION avec version.
- [ ] Certification par E2E réel, non acquise par la présence du code.
- [x] Schéma existant EnterpriseRelationshipBenefitUsage réutilisé ; pas de migration nécessaire dans cet incrément.
- [x] UI administration FR/EN avec motif, justificatif existant, états, approbation/rejet/reprise ; contrôle responsive manuel toujours à faire.
- [ ] E2E navigateur PostgreSQL, concurrence et écritures compensatoires.
- [ ] `pnpm prisma generate`, typecheck, lint, régression, build et CI.
- [ ] OWNER_E2E #910 BON.
- [ ] Production READY sur SHA exact.

**Interdit :** activer commercialement CREDIT, fusionner ou déployer tant que ces gates ne sont pas toutes validées. Les parents #886/#785 restent ouverts.

## Implémentation provisoire
Le code est uniquement sur la branche `fix/910-relationship-credit-manual-approval`. Il n'est pas prêt à être fusionné avant contrôle de qualité, migration d'intégration si nécessaire et E2E PostgreSQL/Playwright. L'étape Finance applique le contrôle `FINANCE_ACCOUNTING:approve` au valideur, et requiert une autre personne que le demandeur.
