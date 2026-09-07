# OWNER_E2E — SCALE-4 bulk worker claim isolation

Issue : #587

Exécuter uniquement sur le HEAD final inchangé de la PR après gates automatiques vertes. Ne pas créer de Preview Vercel.

## Scénarios requis

1. **Import bancaire durable** : importer un relevé dépassant le seuil synchrone de 250 lignes. Vérifier que la requête retourne un job durable, que le statut ne passe pas artificiellement à terminé avant l’import, puis que le relevé atteint `IMPORTED` avec le nombre de lignes attendu.
2. **Export Audit durable** : demander un export dépassant 500 lignes avec les permissions/approbations requises. Vérifier que le job est traité par le chemin durable et qu’un artefact privé téléchargeable est produit.
3. **Rapport Finance durable** : générer un rapport via `REPORTS`. Vérifier la réponse `202`, puis `QUEUED/PROCESSING` → `COMPLETED`, et l’apparition d’un unique snapshot `EnterpriseReport`.
4. **Absence de vol par Workflow** : pendant les scénarios 1 à 3, laisser les crons/worker workflow fonctionner normalement. Aucun job bulk ne doit devenir `PROCESSED` sans son résultat métier correspondant.
5. **Workflow normal préservé** : exécuter une transition ou un événement workflow ERP normal et confirmer que le worker workflow continue de le traiter.
6. **Retry/idempotence** : relancer au moins une demande bulk identique selon son contrat existant et confirmer qu’aucun doublon métier n’est créé.
7. **Isolation tenant** : vérifier qu’aucun statut, artefact ou snapshot d’une autre organisation n’est visible.
8. **Production-only** : confirmer qu’aucun déploiement Preview de la branche n’a été créé.

## Preuve

Seule une confirmation explicite du propriétaire telle que `E2E #<PR> bon`, sur le HEAD final inchangé, vaut `OWNER_E2E`. Tout commit ultérieur invalide cette preuve.
