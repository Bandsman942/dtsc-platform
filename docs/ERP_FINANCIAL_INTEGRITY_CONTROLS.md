# Contrôles d’intégrité financière

## Invariants

- somme des débits = somme des crédits par écriture ;
- une facture émise possède une créance ou dette commune unique ;
- un paiement confirmé possède un compte financier ;
- aucune allocation ne dépasse le paiement ni le solde ouvert ;
- créance et dette ne deviennent pas négatives ;
- aucune allocation, écriture ou correspondance inter-tenant ;
- une source ne produit pas plusieurs écritures injustifiées ;
- une période fermée ou verrouillée refuse les mutations interdites ;
- une caisse clôturée conserve théorique, compté, écart et validation ;
- un transfert est équilibré ;
- une ligne bancaire ne peut pas être rapprochée plusieurs fois ;
- Pharmacy et Health réutilisent la Finance commune sans double facture sectorielle.

## Commande

L’audit existant `pnpm audit:financial-integrity` reste l’autorité. Ses filtres documentés doivent être utilisés pour borner l’organisation, la période et les dates. Les sorties JSON ne doivent pas exposer de données sensibles en clair.

## Corrections

Aucune réparation ne supprime l’historique. Les corrections utilisent annulation avant comptabilisation, avoir, remboursement, contrepassation ou nouvelle écriture corrective.

## Rollback

Un rollback applicatif peut masquer une action ou désactiver une mutation, mais conserve factures, créances, dettes, paiements, allocations, écritures, clôtures et rapprochements.
