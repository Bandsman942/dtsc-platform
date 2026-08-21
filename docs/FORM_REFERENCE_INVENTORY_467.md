# Inventaire des références de formulaires — Issue #467

Baseline : `main@181a3954726e2dfba20af9d9b5ba110386566233`
Date : 21 août 2026
Statut : migration en cours sur `refactor/467-controlled-form-references`

## Objectif

Cet inventaire matérialise le travail de l’Issue #467. Il complète `docs/ENTERPRISE_FORM_UX_CONTRACT.md` et empêche de confondre un contenu réellement libre avec une référence que le système doit contrôler.

## Classification opposable

| Classe | Exemples | Contrôle attendu |
|---|---|---|
| Référence globale stable | devise, unité | catalogue canonique partagé + select/combobox |
| Enum métier | statut, priorité, type | options du domaine + select/combobox |
| Taxonomie métier | catégorie | référentiel existant du domaine ; texte libre seulement si la taxonomie est explicitement personnalisable |
| Relation tenant-scoped | utilisateur, fournisseur, client, patient, projet, département, budget, compte | options chargées depuis le même `organizationId`, identifiant revalidé côté serveur |
| Contenu rédigé | titre, description, note, commentaire, motif | texte libre avec aide visible |
| Valeur mesurée | montant, quantité, taux, durée | contrôle numérique avec bornes métier |

## Source canonique commune

Les devises et unités sont désormais définies dans `lib/forms/reference-catalog.ts`. Les primitives ERP réutilisent ce catalogue ; elles ne maintiennent plus une copie concurrente.

`components/ui/input.tsx` reconnaît les noms `currency`, `currencyCode`, `unit` et `unitCode` et délègue leur rendu à `components/ui/reference-select.tsx`. Ainsi, les anciens formulaires qui utilisent encore la primitive `Input` pour ces champs deviennent contrôlés sans modifier le format persistant : les valeurs enregistrées restent les mêmes codes (`USD`, `CDF`, `kg`, `unit`, etc.).

Cette compatibilité n’est pas une autorisation pour créer de nouveaux `<Input name="currency">` : les nouveaux formulaires doivent utiliser explicitement une primitive de sélection ou une primitive métier qui documente ce comportement.

## Aide contextuelle

`FormField` et `Field` peuvent fournir une aide générique bilingue lorsqu’un contrôle expose un nom de référence connu. Une aide métier spécifique fournie par le formulaire reste prioritaire.

## Audit automatisé

`scripts/qa-controlled-form-reference-checks.mjs` parcourt les fichiers TSX/JSX actifs de `components/` et `app/` et vérifie notamment :

- que devise et unité passent par le catalogue partagé ;
- qu’un `<input>` HTML natif ne réintroduit pas directement une référence contrôlée ;
- qu’un `Input` générique ne reste pas utilisé comme saisie libre pour `status`, `priority`, `type`, `category` ou `paymentMethod` ;
- que la QA fait partie de `qa:regression`.

Les résultats de ce scan sont une preuve de découverte, pas une preuve de correction. Chaque occurrence signalée doit être soit migrée vers une source contrôlée, soit documentée comme exception métier réellement libre avant clôture de #467.

## Exceptions

Aucune exception n’est acceptée par défaut. Une exception future doit préciser :

1. fichier et champ ;
2. raison pour laquelle aucune source contrôlée correcte n’existe ;
3. pourquoi le texte libre est une exigence métier et non une dette ;
4. validation serveur appliquée ;
5. couverture QA empêchant d’étendre silencieusement cette exception.

## Validation de clôture

L’Issue #467 ne peut être clôturée que lorsque :

- le scan automatisé est vert ;
- les choix contrôlés restent lisibles en FR/EN ;
- les valeurs historiques restent affichables ;
- les relations tenant-scoped restent revalidées côté serveur ;
- la CI complète est verte ;
- les familles de formulaires à risque ont reçu l’OWNER_E2E demandé dans la PR.
