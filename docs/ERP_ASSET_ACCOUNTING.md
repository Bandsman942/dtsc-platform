# Comptabilité des immobilisations

## Source opérationnelle et source comptable

`EnterpriseAsset` reste la source opérationnelle. `EnterpriseAssetAccountingProfile` porte le coût, la devise, la valeur résiduelle, la durée, les comptes et la méthode comptable.

## Capitalisation

Sources autorisées : achat, facture fournisseur, dépense, solde d’ouverture ou apport documenté. La capitalisation valide les trois comptes tenant-aware et produit une écriture idempotente `ASSET_CAPITALIZED`.

## Amortissement

La méthode minimale est `STRAIGHT_LINE`, fréquence mensuelle. Le service génère un échéancier avec valeur nette d’ouverture, charge et valeur nette de clôture. Chaque période possède une clé d’idempotence. Une échéance déjà `POSTED` n’est jamais dupliquée.

Écriture : débit charge d’amortissement, crédit amortissement cumulé. Les montants utilisent `Prisma.Decimal` et la dernière échéance absorbe l’écart d’arrondi sans descendre sous la valeur résiduelle.

## Cession

Une cession conserve l’actif et calcule : valeur brute, amortissement cumulé, valeur nette, produit et gain/perte. Elle reste en brouillon avant validation et comptabilisation. La devise du produit doit être compatible avec le profil ou passer par un flux multidevise contrôlé.

## Sécurité

Les comptes et profils sont isolés par organisation. Une modification après comptabilisation utilise une procédure contrôlée, pas un CRUD libre. Les détails sensibles de prix d’acquisition exigent la permission Finance Assets.

## Itération 4

Aucun actif médical ou équipement Pharmacy n’est réévalué ou migré automatiquement. Les liens futurs utiliseront les actifs communs seulement après mapping déterministe.
