# Hotfix #664 — validations Finance, erreurs métier et collaboration partagée

Date : 2026-09-18
Baseline : `main@f7616ac9fb0a6ce739867485817caf7eb1913239`
Issue : #664

## Problème

Les modules Finance professionnels partageaient trois défauts transversaux :

1. les schémas d’approbation imposaient quatre caractères à un commentaire pourtant facultatif ; une approbation accompagnée de « Ok » était donc rejetée avant le moteur métier ;
2. les API pouvaient connaître la cause exacte d’un échec, mais l’interface retombait souvent sur « Transition impossible » ou « Validation impossible » ;
3. `FinanceCollaboration` présentait Documents et Commentaires comme deux blocs plats, et certains types réellement exposés par le frontend (avoirs et soldes ouverts) n’étaient pas acceptés par l’API de commentaires.

## Correction du contrat de décision

Le commentaire d’une décision positive reste facultatif et accepte désormais tout texte non vide jusqu’à 1 000 caractères lorsqu’il est fourni. La chaîne « Ok » est donc valide pour une approbation.

Les décisions négatives ou destructives qui exigent un motif conservent une contrainte explicite d’au moins quatre caractères. L’interface aligne ses attributs `required` / `minLength` sur le serveur et explique la règle sous le champ.

La séparation des fonctions n’est pas modifiée : l’approbateur désigné, les permissions, l’interdiction d’auto-validation, le statut attendu et la révision optimiste restent vérifiés côté serveur.

## Erreurs métier

`financeValidationErrorResponse()` normalise les erreurs Zod des workflows Finance en :

- `error` : code stable ;
- `message` : explication client sûre ;
- `details.fieldErrors` : nom logique du champ et catégorie de validation, sans valeur saisie ni donnée sensible ;
- statut HTTP adapté.

Les routes de décision humaines (écritures, paiements, factures, clôture, rapprochement, soldes d’ouverture, avoirs et caisse) utilisent ce contrat au lieu de `Invalid payload`.

Côté client, `FinanceApiError` conserve déjà `code`, `clientMessage`, `details` et `status`. `safeFinanceError()` exploite maintenant les codes connus puis, si nécessaire, le `clientMessage` explicitement sûr du serveur avant le fallback. Un `Error.message` arbitraire n’est pas rendu au client.

## Collaboration financière

`FinanceCollaboration` reste l’unique surface partagée pour Paiements, Caisse, Créances, Dettes, Banque et Rapprochement.

La surface contient maintenant :

- une section **Documents financiers** repliable ;
- deux actions distinctes : **Voir les documents** et **Ajouter un document** ;
- un état visible indiquant le stockage privé et l’accès contrôlé ;
- une **Conversation financière** repliable avec compteur ;
- un fil borné et scrollable ;
- des messages présentés comme une conversation avec auteur, date et initiales ;
- une zone de saisie multiligne accessible et maintenue près du bas du fil ;
- édition/suppression secondaires pour l’auteur ;
- toast global d’erreur en complément du message local.

Les types de collaboration Finance sont désormais cohérents entre frontend et API : factures, avoirs, créances/dettes ouvertes, paiements, comptes financiers, sessions de caisse, relevés et rapprochements.

## Sécurité et isolation

Aucun changement d’autorité métier n’est introduit.

Les commentaires vérifient toujours :

- l’organisation active ;
- le module Finance correspondant ;
- la permission `view` ou `update` ;
- l’existence de l’objet dans le même `organizationId` ;
- same-origin et rate limit pour les mutations ;
- auteur pour modification/suppression ;
- AuditLog / ApiLog.

Les documents restent servis par le module Documents et le stockage privé existant.

## Base de données

Aucune migration Prisma et aucun backfill.

## QA

La gate `pnpm qa:hotfix-664` protège statiquement :

- le contrat commentaire facultatif / motif obligatoire ;
- la normalisation des erreurs ;
- les routes de décision ;
- le support des types de collaboration ;
- la conversation responsive ;
- les toasts et états busy ;
- les dictionnaires FR/EN.

Elle est ajoutée à `pnpm qa:regression`.

La validation navigateur propriétaire reste obligatoire avant merge conformément à `docs/OWNER_E2E_664_FINANCE_APPROVAL_COLLABORATION.md`.

## Rollback

Revert applicatif des commits du hotfix. Aucun rollback de données n’est nécessaire. Les approbations, documents et commentaires déjà enregistrés conservent leur historique.
