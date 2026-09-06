# OWNER_E2E #515 — SCALE-4F

À exécuter uniquement après CI verte sur le HEAD final.

## Banque

1. Ouvrir `FINANCE_BANK` sur mobile puis desktop.
2. Importer un petit CSV (≤250 lignes) : le résultat doit rester immédiat et le relevé doit apparaître `IMPORTED`.
3. Importer un CSV >250 lignes : l’UI doit afficher un job durable avec état/progression et ne pas bloquer la navigation.
4. Quitter le module puis revenir : le suivi du même job doit reprendre.
5. À la fin, le relevé doit apparaître `IMPORTED` et être sélectionnable pour un rapprochement.
6. Pendant `QUEUED/PROCESSING` ou après `IMPORT_FAILED`, tenter un rapprochement : il doit être refusé.
7. Vérifier FR/EN, clair/sombre, mobile/desktop et absence de débordement.

## Audit

1. Ouvrir Administration entreprise → Audit.
2. Demander un petit export : téléchargement immédiat.
3. Sur un tenant ayant >500 lignes, demander l’export : afficher `En attente/Génération en cours`, puis `Prêt`.
4. Quitter et revenir : le dernier job doit rester récupérable dans la session.
5. Télécharger l’artefact prêt : CSV privé, pas d’URL publique.
6. Si `sensitiveExportApproval` est activé, vérifier qu’un export sans approbation est refusé.
7. Vérifier l’état expiré/indisponible avec un artefact expiré si l’environnement de test le permet.
8. Vérifier FR/EN, clair/sombre et mobile/desktop.

## Isolation

Avec une seconde organisation, vérifier qu’un job ou un artefact d’une organisation A n’est pas accessible depuis B.
