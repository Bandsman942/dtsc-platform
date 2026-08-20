# Health Consultations — convergence FR/EN (#457)

Parent #398. Ce lot branche le workspace **Health → Consultations** sur le contrat clinique i18n canonique.

## Copie système localisée
Titres, CTA, filtres, placeholders, états vides, formulaires, aides, statuts, priorités, types, certitude diagnostique, actions, sections et dates/heures utilisent la locale globale FR/EN.

## Données explicitement non traduites
Les noms patients et professionnels, motifs/plaintes, symptômes, antécédents, allergies, traitements, observations d'examen, diagnostics saisis, prescriptions, notes, résultats laboratoire, motifs d'annulation/réouverture et événements d'historique restent les valeurs canoniques fournies ou saisies. Les libellés de service provenant du référentiel d'organisation restent eux aussi fournis par le serveur.

## QA
- `scripts/qa-health-consultations-i18n-457.mjs` vérifie la parité stricte des catalogues et le contrat de non-traduction des données cliniques ;
- `scripts/qa-health-clinical-i18n-439.mjs` fixe la cible sémantique Consultations à 0 et exécute la QA dédiée ;
- aucune migration, modification RBAC ou API.

## OWNER_E2E
Avant fusion Production, tester FR puis EN sur desktop et mobile : liste, filtres, détail, création/édition non destructive et actions disponibles. Confirmer que la copie système change immédiatement, tandis que les valeurs cliniques existantes restent strictement identiques. Revenir enfin en FR et vérifier l'absence de copie EN résiduelle.
