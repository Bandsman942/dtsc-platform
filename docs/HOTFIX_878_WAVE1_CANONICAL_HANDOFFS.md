# Hotfix #878 — Vague 1 : redirection canonique Temps / Livrables

## Périmètre livré

Cette vague de l'Issue #878 traite **2 opérations sur 14** du catalogue historique de #876, exclusivement pour `PROFESSIONAL_SERVICES` :

| Action historique | Cible réelle | Opération métier | Statut |
|---|---|---|---|
| `DECLARE_TIME_WORKED` | `TIME_ATTENDANCE` | Ouvrir l'onglet **Feuilles de temps** puis le formulaire canonique de déclaration, si l'API autorise l'écriture ; approbation conservée dans le service Timesheets | Raccordement en PR, CI et OWNER_E2E requis |
| `SUBMIT_DELIVERABLE` | `TIME_DELIVERABLES` | Ouvrir le formulaire canonique de livrable ; le projet, le jalon, le document privé lié et les transitions de soumission / revue restent gouvernés par le service Livrables | Raccordement en PR, CI et OWNER_E2E requis |

Ce raccordement **n'exécute pas automatiquement** une création ni une soumission : il ouvre le véritable formulaire ERP. Les données sont enregistrées uniquement par l'API propriétaire après validation métier et les autorisations habituelles.

## Principe de sécurité

- Seuls `PROFESSIONAL_SERVICES.DECLARE_TIME_WORKED` et `PROFESSIONAL_SERVICES.SUBMIT_DELIVERABLE` sont mappés, dans `sector-activity-canonical-handoffs.ts`, vers les vrais codes du registre. Le `targetModuleCode` historique (`TIMESHEETS`/`DELIVERABLES`) n'est **jamais** traité comme une route ou une permission.
- Le loader filtre les blocs par entitlement canonique et par membership ; `canAccessEnterpriseActivity` utilise le secteur vérifié et l'autorisation du **module propriétaire**.
- L'URL n'est transmise au navigateur que si les capacités serveur du même `organizationId` autorisent `canRead`, `canCreate` et `canWrite`, et que le module est navigable.
- La page cible réapplique son RBAC/entitlement, et l'ouverture du vrai formulaire exige `timesheets.canWrite` ou `deliverables.canWrite` issu de l'API propriétaire.
- `POST /api/enterprise/{organizationId}/activities` **refuse toujours** les deux codes avec `422 ENTERPRISE_ACTIVITY_ACTION_NOT_READY` : aucune demande collaborative fictive n'est créée et aucune API sectorielle n'est contournée.
- Aucun nouveau modèle Prisma, aucune migration, aucun déclencheur, aucune modification des comptes Finance/RH, aucune activation commerciale automatique.

## Impact UX

L'onglet **Actions disponibles** d'Activités entreprise affiche **Ouvrir Temps…** ou **Ouvrir Temps et livrables** lorsqu'un vrai module autorisé existe ; sinon l'action reste indisponible. Le CTA est une navigation, et ne prétend jamais que la déclaration ou la soumission est terminée. Le clic passe le seul identifiant d'intention statique `activityAction` reconnu par la cible ; aucun identifiant client non vérifié n'est transféré.

## Critères CI

`pnpm qa:hotfix-878-handoffs` :
- manifeste de mapping explicite (2 codes, secteur strict) et modules ACTIVE du registre canonique ;
- ancienne permission/entitlement contrôlée sur le module réel, sans remappage pour les autres secteurs ;
- liens filtrés `canRead`/`canCreate` et route `isEnterpriseModuleNavigable` ;
- véritable onglet Timesheets et véritables formulaires ouverts seulement si leurs propres API exposent `canWrite` ;
- maintien du refus `422` de l'ancien POST Activities, couverture #876 conservée ;
- QA complète, Prisma, lint, typecheck, build, migrations et workflows ERP spécialisés.

## OWNER_E2E requis

1. Organisation `PROFESSIONAL_SERVICES` avec `TIME_ATTENDANCE` et `TIME_DELIVERABLES` autorisés : sélectionner « Déclarer temps travaillé », vérifier l'onglet Timesheets et le vrai formulaire, enregistrer une feuille vérifiée, puis utiliser la validation indépendante et vérifier son suivi.
2. Depuis « Soumettre livrable », ouvrir le vrai formulaire Livrables, contrôler projets/documents disponibles de la bonne entreprise, enregistrer puis soumettre et faire relire par un validateur différent.
3. Membre sans droit création : aucun CTA vers le module métier et aucune ouverture via `?activityAction=...` ; utiliser directement l'API de création retourne le refus canonique.
4. Essayer un ID, une organisation et des références venant d'un autre tenant ; aucune fuite ni écriture.
5. L'ancien POST Activités pour ces deux codes retourne 422, sans demande ni livrable/temps fantôme.
6. Regressions #876 : 12 autres opérations bloquées, Gaming, Santé/Pharmacie inchangés ; FR/EN, light/dark, largeurs 320/360/375/390/414/768/1024 et clavier/iOS/PWA.

## Suite #878

**Les 12 autres opérations sont hors périmètre de cette vague** et restent indisponibles jusqu'à leur PR métier de domaine, avec documents privés, transitions, permissions, sources de vérité et OWNER_E2E. Ne pas clôturer #878 avec la première PR. Pas de déploiement Vercel depuis une branche PR ; `main` uniquement, après CI et OWNER_E2E.
