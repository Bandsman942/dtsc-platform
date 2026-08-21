# Inventaire des références de formulaires — Issue #467

Baseline : `main@181a3954726e2dfba20af9d9b5ba110386566233`
Date : 21 août 2026
Statut : migration en cours sur `refactor/467-controlled-form-references`

## Objectif

Cet inventaire matérialise le travail de l’Issue #467. Il complète `docs/ENTERPRISE_FORM_UX_CONTRACT.md` et empêche de confondre un contenu réellement libre avec une référence que le système doit contrôler.

## Classification opposable

| Classe | Exemples | Contrôle attendu |
|---|---|---|
| Référence globale stable | devise, unité, mode de paiement | catalogue canonique partagé + select/combobox |
| Enum métier | statut, priorité, type | options du domaine + select/combobox |
| Taxonomie métier | catégorie | référentiel existant du domaine ; texte libre seulement si la taxonomie est explicitement personnalisable |
| Relation tenant-scoped | utilisateur, fournisseur, client, patient, projet, département, budget, compte | options chargées depuis le même `organizationId`, identifiant revalidé côté serveur |
| Contenu rédigé | titre, description, note, commentaire, motif | texte libre avec aide visible |
| Valeur mesurée | montant, quantité, rang numérique, taux, durée | contrôle numérique avec bornes métier |

## Source canonique commune

Les devises, unités et modes de paiement manuels pris en charge sont désormais définis dans `lib/forms/reference-catalog.ts`. Les primitives ERP réutilisent ce catalogue ; elles ne maintiennent plus une copie concurrente.

`components/ui/input.tsx` reconnaît les noms `currency`, `currencyCode`, `unit`, `unitCode` et `paymentMethod` et délègue leur rendu à `components/ui/reference-select.tsx`. Ainsi, les anciens formulaires qui utilisent encore la primitive `Input` pour ces champs deviennent contrôlés sans modifier le format persistant des devises et unités : les valeurs enregistrées restent les mêmes codes (`USD`, `CDF`, `kg`, `unit`, etc.).

Pour les nouveaux paiements manuels, `paymentMethod` est désormais borné côté serveur aux codes `BANK_TRANSFER`, `CASH`, `MOBILE_MONEY`, `CARD` et `CHECK`. Les anciennes valeurs déjà persistées restent lisibles : l’affichage utilise le libellé canonique lorsqu’il connaît le code et conserve sinon la valeur historique.

Cette compatibilité n’est pas une autorisation pour créer de nouveaux `<Input name="currency">`, `<Input name="unit">` ou `<Input name="paymentMethod">` en comptant uniquement sur un effet de bord. Les nouveaux formulaires doivent utiliser explicitement une primitive de sélection ou une primitive métier qui documente le comportement attendu.

## Aide contextuelle

`FormField` et `Field` peuvent fournir une aide générique bilingue lorsqu’un contrôle expose un nom de référence connu. Une aide métier spécifique fournie par le formulaire reste prioritaire.

Le formulaire de paiement manuel a également reçu des aides explicites sur le bénéficiaire, l’offre, le montant, la référence externe, le validateur et le motif afin de rapprocher son niveau de guidage du contrat visuel appliqué au profil.

## Cas SLA opérationnels

Le formulaire SLA exposait `priority`, `startStatus` et `stopStatuses` comme textes libres. L’audit du runtime a montré que ces trois attributs étaient persistés mais **non appliqués par `bindOperationalSlaInstance` ni `evaluateSlaInstances`**. Les laisser dans l’interface aurait donné l’impression qu’un filtre métier était actif alors qu’il ne modifiait aucun comportement.

Ils ont donc été retirés du formulaire de création dans cette migration. Les anciennes politiques restent lisibles. La réintroduction future de filtres priorité/statut devra d’abord relier ces références à un référentiel de statuts réellement compatible avec chaque `objectType`, puis les appliquer dans le moteur SLA et les couvrir par tests.

## Audit automatisé

`scripts/qa-controlled-form-reference-checks.mjs` parcourt les fichiers TSX/JSX actifs de `components/` et `app/` et vérifie notamment :

- que devise, unité et mode de paiement passent par le catalogue partagé ;
- qu’un `<input>` HTML natif ne réintroduit pas directement une référence contrôlée ;
- qu’un `Input` générique ne reste pas utilisé comme saisie libre pour un nom de champ ressemblant à un statut, une priorité, un type, une catégorie ou un mode ;
- qu’une priorité numérique (`type="number"`) reste classée comme rang/poids mesuré, et non comme enum métier ;
- que les taxonomies personnalisables restantes sont explicitement bornées par fichier et documentées ci-dessous ;
- que la QA fait partie de `qa:regression`.

Les résultats de ce scan sont une preuve de découverte, pas une preuve de correction. Chaque occurrence signalée doit être soit migrée vers une source contrôlée, soit documentée comme exception métier réellement libre avant clôture de #467.

## Exceptions explicites : taxonomies personnalisables

Aucune exception n’est acceptée par défaut. Les exceptions ci-dessous existent parce que le modèle serveur actuel stocke volontairement une chaîne bornée et qu’aucune table de référence, enum ou source canonique n’existe dans le domaine concerné. Elles permettent à chaque entreprise de construire sa propre classification sans inventer un référentiel global DTSC arbitraire.

| Fichier | Champ | Justification et validation serveur |
|---|---|---|
| `components/enterprise/core-v2/enterprise-documents-workspace.tsx` | `category` | Catégorie documentaire personnalisable ; `lib/enterprise/procurement/validators.ts` la valide comme texte optionnel borné, sans enum ni table de catégories. |
| `components/enterprise/core-v2/enterprise-finance-workspace.tsx` | `category` | Catégorie de dépense / ligne budgétaire personnalisable ; `lib/enterprise/finance/validators.ts` utilise un texte optionnel borné, sans référentiel canonique. |
| `components/enterprise/core-v2/enterprise-reports-workspace.tsx` | `category` | Catégorie de rapport personnalisable ; le validateur Finance accepte un texte optionnel borné et aucune taxonomie de rapports canonique n’existe. |
| `components/enterprise/core-v2/enterprise-suppliers-workspace.tsx` | `category` | Classification fournisseur propre à l’entreprise ; `supplierBase.category` est un texte optionnel borné, sans source canonique. |
| `components/enterprise/professional/enterprise-catalog-workspace.tsx` | `category` | Catégorie de famille d’unité de mesure configurable ; le schéma `unitOfMeasureCreateSchema` accepte une chaîne bornée et le modèle ne possède pas de registre séparé de familles d’unités. |
| `components/enterprise/professional/enterprise-projects-deliverables-workspace.tsx` | `category` | Catégorie de risque projet personnalisable ; `projectRiskCreateSchema.category` est un texte optionnel borné, alors que probabilité/impact/sévérité sont déjà des enums contrôlées. |

Ces exceptions ne peuvent pas être étendues à un nouveau fichier par simple copier-coller. Toute nouvelle occurrence échoue dans la QA tant que ce fichier et ce champ ne sont pas ajoutés à l’inventaire avec preuve de l’absence d’un référentiel canonique.

## Validation de clôture

L’Issue #467 ne peut être clôturée que lorsque :

- le scan automatisé est vert ;
- les choix contrôlés restent lisibles en FR/EN ;
- les valeurs historiques restent affichables ;
- les relations tenant-scoped restent revalidées côté serveur ;
- la CI complète est verte ;
- les familles de formulaires à risque ont reçu l’OWNER_E2E demandé dans la PR.
