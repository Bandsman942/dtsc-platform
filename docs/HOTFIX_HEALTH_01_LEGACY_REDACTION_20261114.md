# P0 #1146 — Assainissement des projections Santé historiques

**Statut : branche de correction, NON fusionnée, NON exécutée sur Production.** Le correctif Santé intégré #1160 réduit les nouvelles copies cliniques et protège plusieurs lecteurs, mais les anciennes valeurs en base restent à examiner.

## Contrat de sécurité

- Table unique cible : `EnterpriseSectorRecord`, secteur `HEALTH_CARE`, 11 modules dédiés Santé connus ; aucun autre secteur, module ou objet clinique canonique ne peut être modifié par cet outil.
- Champs anonymisés : `title = "<MODULE> · historique"`, `summary = null`, `payloadJson = {}`. Identifiants, liens historiques, statuts, auteurs et dates de création sont conservés.
- Toutes les recherches et modifications sont filtrées par `organizationId`, secteur et module ; l'écriture utilise le `updatedAt` précédemment observé afin de détecter une modification concurrente.
- Traitement borné (100 lignes par page, maximum 10 000 examinées par exécution) ; reprise sûre et redaction idempotente.
- Journaux : exclusivement des compteurs agrégés. Jamais de titres, diagnostics, identifiants patients, JSON cliniques ou références de lignes dans les journaux.
- **Le programme est en lecture seule par défaut**. L'écriture exige simultanément `--apply`, `--snapshot-ref`, `--ack` et la variable opérateur `HEALTH_LEGACY_REDACTION_ENABLE=true`.

## Procédure de recette en base isolée

1. Créer une branche Neon privée isolée, sauvegarder l'état et démontrer une restauration depuis un snapshot vérifié. Ne jamais ajouter de PHI réelle aux fixtures GitHub.
2. Préparer un tenant fictif avec enregistrements historiques contenant uniquement des valeurs artificielles. Vérifier l'intégrité des relations `legacyRecordId` pour patients, rendez-vous, consultations, labo et documents.
3. Exécuter la lecture seule, puis vérifier les compteurs, le plafonnement et les contrôles de confidentialité.

```bash
node scripts/health-legacy-projection-redact.mjs \
  --organization-id=TENANT_TEST --max-scanned=5000
```

4. Après confirmation humaine de la sauvegarde restaurable, exécuter l'assainissement en environnement isolé. Le snapshot-ref est une **attestation opérateur, pas une vérification automatique du service Neon**.

```bash
HEALTH_LEGACY_REDACTION_ENABLE=true \
node scripts/health-legacy-projection-redact.mjs \
  --organization-id=TENANT_TEST --max-scanned=5000 \
  --apply --snapshot-ref=SNAPSHOT_NEON_VERIFIE \
  --ack=REDACT_LEGACY_CLINICAL_TEXT
```

5. Refaire un audit : `candidates=0`, `concurrent=0`. Avec plus de 5 000 lignes, répéter à fenêtres bornées jusqu'au rapport complet, sans extrapoler un audit tronqué.
6. Contrôler les vues, historiques, documents, IA, exports, notification, RBAC, deux tenants et l'intégrité des tables Santé canoniques.
7. **Production** : aucune exécution avant validation E2E propriétaire, sauvegarde testée, runbook de réparation et approbation opérateur explicite. Aucun cron ni déploiement de branche ; seules les modifications de code passent par `main`.

## Reprise et rollback

La suppression de textes cliniques d'une projection historique est une transformation de données. Un simple revert Git **ne restaure pas** les champs expurgés. En cas d'erreur, utiliser le snapshot privé vérifié et une restauration sélective contrôlée en base isolée, après revue des changements intervenus ; ne jamais restaurer aveuglément toute la production. Suspendre immédiatement l'outil si `concurrent > 0` ou si les contrôles d'accès échouent.

## Évidence et conditions de fermeture de #1146

- `pnpm qa:health-01` inclut `scripts/qa-health-01-legacy-redaction.mjs` ; CI, Prisma, type-check, lint, régression et build restent obligatoires.
- Cette PR rembourse seulement la **préparation contrôlée du backfill historique** ; elle **ne ferme pas** #1146 sans audit exhaustif des lecteurs, test PostgreSQL réel, preuve de sauvegarde/restore, E2E propriétaire et recette Production.
- Aucune donnée client n'est modifiée par une PR ou par son merge.
