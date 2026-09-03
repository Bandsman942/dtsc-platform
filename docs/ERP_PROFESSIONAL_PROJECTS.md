# ERP professionnel — Projets et services

## Périmètre

Module canonique : `PROJECTS_SERVICES`.

## Fiche projet

- Référence et nom.
- Client et contrat éventuel.
- Chef de projet et équipe.
- Type, statut, période, budget indicatif et devise.
- Jalons, risques, incidents, livrables et temps.
- Historique et révision.

Les références inter-modules restent gouvernées par leur source de vérité : RH pour les collaborateurs et départements, Documents pour les pièces, Finance Budgets pour les budgets et Achats/Fournisseurs pour les acquisitions. Une référence transmise par le client est toujours revalidée dans la même entreprise et selon les permissions du module source.

## Cycle du projet

Le projet suit un cycle versionné et audité :

- `DRAFT -> PLANNED -> ACTIVE` ;
- `ACTIVE` peut passer à `AT_RISK` ou `BLOCKED`, puis reprendre ;
- `ACTIVE`/`AT_RISK` peuvent passer à `COMPLETED` seulement lorsque le travail métier restant est cohérent ;
- `COMPLETED -> CLOSED` ;
- l’annulation est motivée et conserve l’historique.

La complétion est refusée tant qu’il existe :

- un livrable non `ACCEPTED` ;
- un jalon non `COMPLETED`/`APPROVED` ;
- un risque `OPEN` ;
- un incident projet `OPEN`.

La progression dérivée des livrables utilise les livrables acceptés comme source canonique lorsque le projet possède des livrables.

## Équipe

Les membres sont des collaborateurs actifs de la même entreprise. Chaque affectation possède un rôle, une capacité, une date de début et un retrait logique. Le retrait ne supprime pas l’historique.

## Jalons

Un jalon possède une échéance, un responsable, un statut et une révision.

- Sans validation obligatoire : un jalon `PLANNED` peut être terminé directement et devient `COMPLETED`.
- Avec validation obligatoire : le jalon est soumis à un validateur indépendant éligible pour `PROJECTS_SERVICES`, devient `SUBMITTED`, et crée une `EnterpriseApproval` dans le module canonique `VALIDATIONS`.
- Le demandeur ne peut pas s’auto-approuver.
- `VALIDATIONS` conserve une version immuable de la soumission avant décision.
- Une approbation fait passer le jalon à `APPROVED` ; un rejet à `REJECTED`, avec motif obligatoire côté file de validation.
- Un jalon rejeté peut être resoumis avec une nouvelle validation.
- L’annulation d’une validation en attente remet le jalon à `PLANNED` sans supprimer l’historique.

Il n’existe pas de second moteur de validation spécifique aux projets : `EnterpriseApproval` reste l’unique file d’approbation.

## Risques et incidents

Les risques portent probabilité, impact, sévérité, responsable, plan de réponse et échéance.

- un risque est créé `OPEN` ;
- sa clôture nécessite un motif et le fait passer à `CLOSED` ;
- un risque clôturé peut être rouvert ;
- les projets à risque restent visibles dans les indicateurs.

Les incidents/blocages projet disposent d’un cycle exploitable :

- `OPEN -> RESOLVED -> CLOSED` ;
- une résolution doit être renseignée ;
- un incident `RESOLVED` ou `CLOSED` peut être rouvert ;
- la résolution précédente est conservée dans l’historique opérationnel lors d’une réouverture.

Toutes ces transitions utilisent une révision optimiste, un contrôle d’accès serveur et un événement opérationnel auditable.

## Accès externe

Un compte global ou client ne reçoit jamais automatiquement l’accès au projet. Il faut :

1. une relation d’entreprise active ;
2. un partage explicite ;
3. une permission serveur sur le projet ;
4. une visibilité limitée aux éléments partagés.

## UX

- Portefeuille avec recherche, filtres et pagination.
- Détail plein écran mobile.
- Actions explicites d’équipe, jalons, risques, incidents et livrables.
- Dialogues de confirmation et de saisie des motifs/résolutions ; aucun `window.prompt`, `window.alert` ou `window.confirm` métier.
- Sélection des validateurs de jalon depuis la primitive canonique `approval-candidates` et jamais depuis une liste arbitraire de membres.
- États de chargement/sauvegarde et feedback local + toast global.
- Libellés FR/EN via le contrat i18n professionnel existant.

## Maturité

`PROFESSIONAL_READY` après validation technique ; E2E manuel du propriétaire requis avant commercialisation.
