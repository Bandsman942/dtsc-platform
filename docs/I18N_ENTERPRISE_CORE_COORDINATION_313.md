# #313 — Convergence i18n Enterprise Core : Réunions, Demandes et Validations

## Contexte

Cette itération constitue le lot **2B** de la vague #267. Le lot 2A (#292 / PR #294) a établi `enterprise-core` comme domaine i18n canonique pour les primitives ERP v2 et les Tâches. Réunions, Demandes et Validations utilisaient encore des copies FR/EN locales, des formats de date sélectionnés dans les composants et plusieurs codes métier rendus directement.

## Périmètre

Le lot couvre :

- `enterprise-meetings-workspace.tsx` ;
- `meeting-form.tsx` ;
- `meeting-coordination-panel.tsx` ;
- `enterprise-requests-workspace.tsx` ;
- `request-form.tsx` ;
- `request-coordination-panel.tsx` ;
- `enterprise-approvals-workspace.tsx` ;
- `approval-coordination-panel.tsx` ;
- les catalogues `locales/enterprise-core.fr.json` et `locales/enterprise-core.en.json` ;
- la QA dédiée `qa-enterprise-core-coordination-i18n-313.mjs`.

## Contrat retenu

`enterpriseCoreT(...)` et les catalogues `enterprise-core` restent l’unique source de copie utilisateur pour ce périmètre. Les statuts et priorités réutilisent les projections de `erp-v2-ui.tsx`; les dates visibles passent par `formatEnterpriseDate(...)`.

Les valeurs persistées et les codes d’action restent inchangés : `START`, `COMPLETE`, `CANCEL`, `SUBMIT`, `TAKE`, `FULFILL`, `REQUEST_INFORMATION`, `RESPOND`, `RESOLVE`, `CLOSE`, `REOPEN`, `APPROVE`, `REJECT`, etc. Seule leur projection utilisateur est localisée.

Les contenus saisis par les utilisateurs — titres, descriptions, ordres du jour, minutes, commentaires, motifs et décisions — ne sont jamais traduits automatiquement.

## Réunions

- copies, filtres, actions, dialogues, empty states et métriques raccordés au catalogue canonique ;
- modes `ONLINE`, `PHYSICAL`, `HYBRID` projetés avec des libellés localisés ;
- libellés dynamiques « ouvrir … » interpolés par le moteur canonique ;
- actions de confirmation rendues en vocabulaire utilisateur plutôt qu’en codes techniques ;
- dates de conflits et versions de compte-rendu via le helper locale-aware ;
- statuts des points d’agenda et tâches liées projetés par les labels canoniques.

## Demandes

- filtres, formulaires, actions, dialogues et métriques raccordés au catalogue `enterprise-core` ;
- choix de priorité unifiés sur `priorityChoices(locale)` ;
- événements du cycle de coordination projetés en FR/EN sans modifier les événements persistés ;
- statuts source/destination de l’historique localisés ;
- les résumés historiques et commentaires restent inchangés afin de préserver la donnée d’audit et le contenu utilisateur.

## Validations

- files, filtres, actions et dialogues raccordés au catalogue canonique ;
- types de cible usuels projetés avec des libellés utilisateur ;
- décisions `APPROVE` / `REJECT` localisées dans l’historique ;
- dates des versions et décisions via le helper locale-aware ;
- aucune modification de l’idempotence, des révisions ou des transitions serveur.

## Sécurité et données

Aucune migration Prisma n’est requise. Le lot ne modifie ni `organizationId`, ni RBAC, ni ownership, ni entitlements, ni les routes API. Les deep-links `meeting`, `request` et `approval` sont conservés.

## QA

La QA #313 vérifie notamment :

- parité exacte des clés FR/EN ;
- absence de nouveaux ternaires de copie `locale === "en" ? ... : ...` dans les huit composants ;
- absence de locales visibles `en-GB`, `fr-FR`, `en-US` codées dans ces composants ;
- utilisation des helpers de date/statut/priorité canoniques ;
- absence de codes bruts pour événements de demande, décisions d’approbation, statuts d’agenda et tâches liées ;
- conservation des deep-links ;
- absence des scripts/workflows temporaires utilisés uniquement pour matérialiser le patch.

## Rollback

Revert applicatif de la PR. Aucun rollback de schéma ou de données n’est nécessaire.
