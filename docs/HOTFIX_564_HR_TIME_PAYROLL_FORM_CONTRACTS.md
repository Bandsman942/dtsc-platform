# Hotfix #564 — Contrats de formulaires RH, Temps et Paie

## Contexte

Le hotfix #562 a rétabli les frontières métier et les workflows de `HUMAN_RESOURCES`, `TIME_ATTENDANCE` et `PAYROLL_OPERATIONS`. Les tests mobiles en production ont ensuite révélé une dette UX résiduelle dans les formulaires : sélecteurs silencieusement vides, catégories de contrat non canoniques, absence de préremplissage et messages de validation insuffisamment guidés.

Ce hotfix corrige ces défauts sans affaiblir les règles de sécurité établies par #562.

## Diagnostic confirmé

### Collaborateur du contrat

Le sélecteur de contrat utilise volontairement `EnterpriseEmployee` actif, et non n’importe quel `OrganizationMember`. Un membre DTSC peut exister sans disposer encore d’un dossier RH. Dans ce cas, le serveur ne doit pas fabriquer silencieusement un dossier d’emploi ni permettre un contrat hors de la source de vérité RH.

La mauvaise UX provenait du fait que le formulaire affichait simplement une liste vide. Il distingue désormais explicitement :

- les dossiers collaborateurs RH actifs, sélectionnables ;
- les membres actifs qui n’ont pas encore de dossier RH, signalés comme nécessitant une création ou une liaison dans « Employés et collaborateurs ».

### Type de contrat

Le formulaire utilisait les valeurs `EMPLOYEE`, `CONTRACTOR`, `INTERN`, `TEMPORARY` alors que le catalogue i18n des contrats définit les valeurs canoniques :

- `EMPLOYMENT` ;
- `INDEFINITE` ;
- `FIXED_TERM` ;
- `CONSULTING` ;
- `INTERNSHIP`.

Les valeurs inconnues retombaient donc toutes sur le fallback i18n générique, visible comme « Autre catégorie ». Le nouveau formulaire n’émet plus que les valeurs canoniques et le schéma serveur les impose également. Les anciennes valeurs restent projetées vers leur équivalent canonique lorsqu’un ancien contrat est affiché ou corrigé.

### Validateur indépendant

La liste des validateurs est produite par le moteur d’approbation et contient uniquement les autres membres actifs possédant réellement la capacité `approve` sur le module. L’auto-validation reste strictement interdite pour RH, Temps et Paie.

Une liste vide signifie donc qu’aucun autre membre n’a la permission nécessaire. L’interface affiche désormais un message de remédiation explicite au lieu d’un sélecteur vide.

## Contrat formulaire partagé

Les primitives partagées appliquent désormais les règles suivantes :

- `Field` propage automatiquement le caractère obligatoire du contrôle enfant et affiche `*` ;
- `NativeSelect` n’ajoute plus un deuxième choix vide lorsqu’un placeholder métier existe déjà ;
- l’aide contextuelle couvre les champs RH, Temps et Paie sensibles ;
- les toasts globaux sont rendus au-dessus des éditeurs et respectent la safe area mobile ;
- les workspaces séparent explicitement `notice` de `error` afin qu’une erreur métier ne puisse pas être présentée avec un ton de succès.

## Ressources humaines

Le formulaire de contrat :

- sélectionne uniquement un dossier RH actif ;
- préremplit automatiquement poste officiel, département et site depuis le dossier sélectionné ;
- répercute automatiquement le département canonique lorsqu’un poste est changé ;
- utilise les cinq types de contrat canoniques ;
- explique comment créer/lier un dossier RH lorsqu’il n’existe aucun collaborateur sélectionnable ;
- explique comment attribuer la permission d’approbation lorsqu’il n’existe aucun validateur indépendant ;
- vérifie localement dates, rémunération, devise et approbateur avant mutation ;
- conserve la revalidation tenant-scoped et les contrôles serveur comme autorité finale.

## Temps, présences et congés

Les quatre objets restent distincts : planning, présence observée, congé et timesheet.

Les formulaires :

- utilisent uniquement les dossiers RH actifs ;
- préremplissent le fuseau du planning depuis le site RH du collaborateur ;
- préremplissent le site d’une présence depuis l’affectation RH ;
- expliquent l’absence de fuseau configuré au lieu de convertir silencieusement selon le navigateur ;
- expliquent l’absence de validateur pour congés et timesheets ;
- contrôlent localement les plages de dates/heures et la cohérence date travaillée/période avant mutation ;
- conservent la validation serveur et l’interdiction de l’auto-approbation.

## Paie opérationnelle

Les formulaires :

- expliquent l’absence de population RH active ;
- expliquent l’absence de période ouverte ;
- expliquent l’absence de validateur indépendant ;
- contrôlent les bornes de période et la date de paiement prévue ;
- exigent au moins un collaborateur pour la préparation ;
- exigent un motif distinct pour toute prime ou retenue non nulle ;
- conservent le temps approuvé comme preuve uniquement ;
- conservent la séparation `paie approuvée ≠ paiement effectué` et le décaissement explicite dans Finance.

## Durcissement serveur

- types de contrat : enum canonique ;
- types de congé : enum canonique ;
- date travaillée d’une ligne de timesheet obligatoirement comprise dans la période de sa feuille ;
- période de paie : fin >= début ;
- date de paiement prévue : pas antérieure au début de période.

## QA permanente

`scripts/qa-enterprise-hr-payroll-checks.mjs` et `scripts/qa-professional-people-i18n-332.mjs` empêchent désormais le retour des défauts suivants :

- ancien jeu de catégories de contrat ;
- absence de préremplissage RH ;
- double choix vide des sélecteurs ;
- disparition du marqueur obligatoire ;
- absence d’aide contextuelle People ;
- toast sous un éditeur ;
- confusion entre message de succès et erreur dans Temps/Paie ;
- réintroduction d’une raison générique de variable de paie ;
- disparition des garde-fous d’approbation indépendante.

## Migration / données

Aucune migration Prisma. Aucun backfill destructif. Les règles applicatives sont renforcées sur les nouvelles mutations ; les anciens contrats restent lisibles et peuvent être corrigés vers les valeurs canoniques via l’interface.

## Rollback

Revert du merge du hotfix. Aucune migration SQL n’est à inverser et aucune donnée métier ne doit être supprimée.
