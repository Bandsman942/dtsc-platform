# UX-02D — Date métier Assurance Santé (#957)

## Cause
L'ouverture d'une nouvelle demande d'assurance préremplissait `requestDate` en utilisant `new Date().getFullYear(), getMonth(), getDate()` dans le navigateur. Si le professionnel était dans un fuseau différent de celui de son établissement, la date était incorrecte près de minuit.

## Correction
Le GET existant `/api/enterprise/[organizationId]/healthcare/insurance` conserve `getHealthInsuranceAccess(action:"read")` et, après permission, résout `Organization.timezone` via `getEnterpriseBusinessContext` avant de calculer `businessDate` au format `YYYY-MM-DD` avec `formatEnterpriseBusinessDate`. La date est exposée avec les données autorisées du module, sans créer de nouvel endpoint ni seconde source de contexte.

À l'ouverture du formulaire **Nouvelle demande** uniquement, `request(businessDate)` initialise `requestDate`. Le champ peut ensuite être modifié normalement et n'est jamais recalculé pendant la saisie. Si l'organisation n'a pas de date serveur valide, le champ est vide, pas rempli avec l'horloge du téléphone.

Un fuseau non configuré ou invalide est converti en erreur métier existante via `enterpriseDomainErrorResponse` ; aucune date UTC inventée ni donnée privée n'est affichée. La logique des mutations de prise en charge ne change pas.

## QA ciblée
`node scripts/qa-ux-957-health-insurance-date.mjs`, intégré aux Quality Gates ; type-check, regression QA, lint, build et gouvernance de PR obligatoires.

## OWNER_E2E requis
1. Configurer l'organisation Health A en `Africa/Kinshasa`, l'organisation Health B en `America/New_York` (données de test).
2. Depuis un appareil dans un autre fuseau, ouvrir une nouvelle demande à proximité du minuit local de chaque établissement.
3. Vérifier `requestDate` = date du calendrier **de l'établissement**, pas du navigateur.
4. Modifier manuellement la date, remplir le reste du formulaire : aucune modification automatique pendant la saisie.
5. Tester une seconde ouverture après changement du jour côté serveur : nouvelle date mise à jour ; ancienne demande préservée.
6. Sans permission de lecture, aucun `businessDate` divulgué. Un fuseau invalide affiche une erreur compréhensible.
7. Tester 320/390/768/1440, FR/EN et mode sombre, sans données réelles de patients.

## Risques, limites et rollback
Le GET existant charge déjà les référentiels en mémoire : **leur pagination est hors scope et toujours suivie dans #936**. Le correctif ne touche ni le schéma, ni l'horodatage persisté d'une demande, ni les règles d'assurance, ni les montants, ni les droits. Revert applicatif de la PR si régression ; aucune migration, backfill ou secret.
