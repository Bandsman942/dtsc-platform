# Modèle fiscal opérationnel ERP

## Objectif

Le domaine fiscal fournit une configuration opérationnelle générique. Il ne prétend pas produire une déclaration légalement conforme dans toutes les juridictions.

## Modèles

- `EnterpriseTaxCode` : code, libellés, catégorie, juridiction et comptes de taxe.
- `EnterpriseTaxRate` : taux daté, statut et auteur.
- `EnterpriseTaxRule` : application contrôlée par source et critères validés.
- `EnterpriseTaxLine` : taxe calculée et persistée par document.
- `EnterpriseTaxPeriod` et `EnterpriseTaxSummary` : synthèses opérationnelles et snapshots.

Catégories : `SALES_TAX`, `VAT`, `WITHHOLDING`, `EXEMPT`, `ZERO_RATED`, `OTHER`.

## Calcul

La base taxable, le taux et le montant utilisent `Prisma.Decimal`. Le serveur sélectionne le taux actif à la date du document. Une facture conserve ses lignes fiscales et son taux historique ; une modification ultérieure du référentiel ne recalcule pas une écriture déjà comptabilisée.

## Comptabilisation

- Vente : crédit taxe à payer.
- Achat récupérable : débit taxe récupérable.
- Retenue : mapping dédié selon la direction et la politique entreprise.

Les comptes proviennent des mappings serveur ou du code fiscal validé. Le navigateur ne choisit jamais librement un compte de contrepartie.

## Sécurité et limites

Les codes sont isolés par `organizationId`, datés et désactivables. Un code utilisé n’est pas supprimé. Les exports sont présentés comme synthèses configurables tant qu’une juridiction précise n’a pas été implémentée et validée. Les données fiscales et identifiants sensibles exigent `view_sensitive`.

## Itération 4

Les taxes propres aux ventes Pharmacy, factures médicales Health et retenues d’assurance ne sont pas migrées automatiquement. Elles seront reliées par mappings explicites après validation sectorielle.
