# Sprint 5 — Architecture technique de la paie fondée sur le travail approuvé

<a id="SPRINT_05_PAYROLL_TECHNICAL"></a>

## Objet

Ce document décrit l’architecture technique durable du workflow de paie interne DTSC introduit au Sprint 5. Il complète `docs/DTSC_PAYROLL_WORKFLOW.md` et s’inscrit dans l’architecture ERP finale décrite par `docs/TECHNICAL_DOCUMENTATION.md`.

Le workflow est identifié techniquement par la source financière :

```text
PAYROLL_WORKFLOW
```

## Chaîne métier

```text
prestations déclarées
→ soumission hebdomadaire
→ validation indépendante COO/CEO
→ travail approuvé
→ préparation RH & CFO
→ soumission à l’approbateur requis
→ approbation financière
→ transaction de paie idempotente
→ marquage payé
```

La disponibilité du calendrier n’est jamais considérée comme du temps travaillé. Seules les entrées de travail appartenant à une soumission `APPROVED` peuvent constituer une preuve de couverture pour la préparation de paie.

## Sources de vérité

- `DtscWorkEntry` : prestation réellement déclarée ;
- `DtscWorkSubmission` : soumission hebdomadaire et minutes validées ;
- `HrcfoPayroll` : paie préparée, soumise, approuvée puis payée ;
- `HrcfoPayrollWorkEntry` : preuve figée reliant la paie aux prestations approuvées ;
- `HrcfoPayrollReview` : historique append-only des décisions ;
- transaction financière de source `PAYROLL_WORKFLOW` : impact financier unique de la paie approuvée.

Une entrée de travail active ne peut pas alimenter simultanément deux paies. Les relations et index de la base imposent cette unicité.

## Calcul et rémunération

Les minutes approuvées servent à prouver la couverture de la période ; elles ne calculent jamais automatiquement le salaire.

Le montant brut standard provient de la rémunération mensuelle du dossier RH. Une période partielle ou une dérogation exige un override explicite et une justification. Les primes et retenues exigent également un motif.

Une couverture incomplète ne met pas le salaire à zéro : elle bloque la soumission jusqu’à l’ajout d’une justification explicite.

## Matrice d’approbation

- RH & CFO prépare et soumet la paie ;
- le CEO approuve la paie des autres collaborateurs ;
- le COO approuve la paie du CEO ;
- aucune personne ne peut approuver sa propre paie ;
- le poste officiel est revérifié côté serveur au moment de chaque décision.

Les contraintes applicatives et SQL interdisent l’auto-approbation ainsi que les transitions non autorisées.

## Frontière financière

La préparation et la soumission ne créent aucune dépense ni transaction financière.

L’impact financier est créé uniquement dans la branche d’approbation `APPROVED`, au sein d’une transaction Prisma sérialisée par verrou consultatif PostgreSQL. La clé d’idempotence est fondée sur la paie et la source `PAYROLL_WORKFLOW`.

Lorsqu’une transaction existe déjà, le service vérifie qu’elle correspond toujours au budget, au compte, au montant et à la paie attendus. Toute divergence produit `TRANSACTION_IDEMPOTENCY_MISMATCH` au lieu de créer un doublon.

Le passage à `PAID` met à jour la transaction existante ; il ne crée jamais une nouvelle dépense.

## Immutabilité et annulation

Les preuves de travail et les éléments financiers validés deviennent immuables. Une paie annulée libère explicitement les preuves encore réutilisables selon le statut autorisé, sans supprimer l’historique ni recréer une transaction financière parallèle.

Une paie approuvée ou payée ne peut pas être corrigée en réécrivant silencieusement l’historique financier. Toute correction suit les règles de contrepassation et d’audit applicables.

## Justificatifs et confidentialité

Les justificatifs de prime, retenue ou ajustement utilisent un upload privé contrôlé par route serveur. L’accès vérifie l’utilisateur, le poste, la propriété de l’objet, le type de fichier et le périmètre DTSC.

La vue collaborateur n’expose ni le budget ni le compte financier. Le bulletin n’est disponible qu’après validation ou paiement, selon les permissions prévues.

## Sécurité des routes

Chaque mutation applique :

```text
session
→ contexte DTSC_INTERNAL
→ dossier collaborateur et poste officiel
→ propriété ou rôle d’approbateur
→ same-origin
→ validation Zod
→ rate limit attendu
→ transaction
→ ApiLog
→ AuditLog
```

Les opérations de préparation, soumission, approbation, paiement et annulation produisent des événements d’audit explicites.

## Non-régression

Le contrat est contrôlé par :

```bash
pnpm qa:payroll-workflow
pnpm qa:payroll-hotfix
pnpm qa:regression
```

La Production reste exclusivement issue de `main`. Le pipeline exécute `prisma migrate deploy` avant `pnpm build`; aucun Preview Deployment ne constitue une validation du workflow de paie.
