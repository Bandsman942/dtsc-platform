# Hotfix #473 — Désignation administrateur entreprise

## Baseline

- Source : `main@f5670482b18975258bb84a61642bc42dc83d13df`
- Issue : #473
- Impact : Console DTSC / entreprises clientes / invitations administrateur
- Migration Prisma : aucune

## Problèmes corrigés

Le flux historique permettait de sélectionner un administrateur sans que l’interface fournisse le motif exigé par le backend pour `grant_admin`. Le résultat était une erreur générique `Action impossible`, parfois affichée en même temps qu’un toast de succès provenant d’une autre sous-opération du formulaire.

Le formulaire de création avait en plus un contrat différent : l’administrateur initial pouvait être désigné sans motif explicite. Les listes d’entreprises n’affichaient que les administrateurs `ACTIVE`, ce qui faisait passer une invitation `INVITED/PENDING` pour un état `Non désigné`.

## Nouveau contrat UX

### Création d’une entreprise cliente

1. L’administrateur initial est optionnel.
2. La sélection passe par la combobox de référence des utilisateurs actifs.
3. Dès qu’un utilisateur est sélectionné, le champ `Raison de la désignation` apparaît.
4. Le motif est obligatoire avant la création lorsque l’administrateur initial est renseigné.
5. La création sans administrateur reste possible et n’exige aucun motif.
6. Après création avec administrateur, la Console indique que l’invitation reste en attente d’acceptation.

### Modification d’une entreprise cliente

1. Les anciens boutons rapides `Admin: <nom>` sont supprimés.
2. Une seule combobox permet de désigner/changer l’administrateur.
3. Les administrateurs actifs et invitations en attente sont affichés séparément.
4. Le champ de motif apparaît après sélection du nouvel administrateur.
5. L’invitation ne part que si le motif est valide.
6. La mise à jour générale de l’entreprise et l’envoi d’une invitation administrateur sont deux intentions distinctes afin d’éviter les succès partiels présentés comme un succès global.

## Contrat serveur

- Création : `adminUserId` et `adminReason` sont validés ensemble. Si un administrateur est sélectionné sans motif, la requête est refusée avant toute création.
- Édition : le contrat existant `grant_admin + reason` reste obligatoire.
- Un utilisateur inactif ou introuvable reste refusé.
- Une nouvelle invitation ne peut pas écraser silencieusement un administrateur déjà actif, un propriétaire actif ou une invitation déjà en attente.
- Le membership initial reste `INVITED` et le grant reste `PENDING` jusqu’à acceptation explicite.
- Le motif fourni est persisté dans `OrganizationAdminGrant.reason` et conservé dans l’audit protégé.
- Same-origin, session DTSC interne, capability Console, rate-limit, transaction et audit restent appliqués.

## Messages utilisateur

Les nouveaux messages propres à ce flux sont fournis en FR/EN via `lib/console/client-organizations-i18n.ts`. Les réponses de validation API retournent un `reasonCode` et un champ métier exploitable par l’interface sans exposer les détails Zod/Prisma au client.

## Responsive et accessibilité

Les surfaces modifiées utilisent `min-w-0`, `max-w-full`, des grilles `minmax(0,1fr)` pour les blocs dynamiques, des actions adaptatives et des champs tactiles. Le motif est associé à un label, `aria-required` et une longueur bornée.

## QA automatisée

Le script `scripts/qa-hotfix-473-enterprise-admin-invitation.mjs` vérifie notamment :

- absence des boutons rapides Admin ;
- combobox sur création et modification ;
- motif obligatoire dans les deux parcours ;
- validation serveur de la désignation initiale ;
- persistance du motif dans le grant/audit ;
- refus des doublons actifs/pending à l’édition ;
- affichage des invitations `INVITED` ;
- messages FR/EN ;
- séparation entre mise à jour générale et invitation admin.

Ce script est intégré à `scripts/run-regression-qa-ci.mjs` afin d’entrer dans la gate de régression canonique.

## E2E propriétaire requis

### Scénario A — création

- [ ] Ouvrir la Console sur mobile.
- [ ] Créer une entreprise cliente.
- [ ] Choisir un administrateur initial via la combobox.
- [ ] Vérifier l’apparition immédiate du champ de raison.
- [ ] Vérifier que la création reste bloquée sans motif valide.
- [ ] Saisir un motif puis créer.
- [ ] Vérifier le toast de création avec invitation en attente.
- [ ] Vérifier dans la liste : aucun admin actif tant que l’invitation n’est pas acceptée et nom du candidat sous `Invitation administrateur en attente`.

### Scénario B — modification

- [ ] Ouvrir une entreprise existante.
- [ ] Vérifier l’absence de boutons rapides `Admin: <nom>`.
- [ ] Choisir un nouvel administrateur via la combobox.
- [ ] Vérifier l’apparition du champ de raison.
- [ ] Saisir le motif et envoyer l’invitation.
- [ ] Vérifier le message de succès dédié.
- [ ] Vérifier l’état `Invitation administrateur en attente` dans la liste.
- [ ] Accepter l’invitation avec le compte cible et vérifier le passage à administrateur actif.

## Rollback

Revert applicatif/documentaire de la PR #473. Aucune migration ni backfill n’est nécessaire.

## Dette de contribution

- Dette créée : aucune visée.
- Dette maintenue : aucune connue dans le périmètre.
- Dette remboursée : contrat motif désaligné, création sans motif, boutons rapides non auditables, état pending invisible, messages d’erreur génériques et succès partiels trompeurs.
- Dette reportée : aucune.
