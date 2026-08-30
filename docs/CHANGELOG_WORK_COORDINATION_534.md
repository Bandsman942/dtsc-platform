# Changelog — Work coordination professional contracts (#534)

Date: 2026-08-30

## Portée

Hotfix transverse des modules ERP communs **Tâches et opérations**, **Demandes internes**, **Validations**, **Réunions** et **Workflows**.

## Changements livrés dans la PR

- **Tâches** : terminaison protégée par checklist, blocages et dépendances ; motifs obligatoires pour les actions sensibles ; coordination verrouillée après état terminal.
- **Demandes internes** : convergence sur la machine d’état canonique, catalogue de types contrôlé FR/EN et coordination protégée par révision.
- **Validations** : décision finale après revue d’un snapshot immuable identifié par `reviewedVersionId` ; suppression des raccourcis de décision dans la liste ; correction, resoumission et délégation gouvernées.
- **Réunions** : compte rendu exclusivement versionné, RSVP préservés, champs de localisation conditionnels, mutations bornées par l’état et motifs pour annulation/archivage.
- **Workflows** : publication après revue explicite du brouillon, readiness serveur et token SHA-256 anti-obsolescence ; erreurs locales de graphe et blocage de publication tant que le brouillon local n’est pas enregistré.
- **QA** : contrats permanents ajoutés au runner `qa-standard-work-coordination-checks.mjs` pour les cinq scopes et l’agrégat.
- **Guides** : mise à jour des cinq guides utilisateur concernés.

## Base de données

Aucune migration Prisma. Les modèles existants sont réutilisés.

## Sécurité

Les contrôles tenant, RBAC, révision, idempotence, éligibilité d’approbateur et état courant restent exécutés côté serveur. L’interface n’est pas considérée comme barrière de sécurité.

## Validation

- CI : à prouver sur la PR #538.
- OWNER_E2E #534 : requis avant merge.
- Vercel Preview : interdit pour les commits intermédiaires.
- Production : uniquement depuis `main` après CI + OWNER_E2E.

## Rollback

Revert applicatif de la PR. Aucun rollback de migration n’est nécessaire.
