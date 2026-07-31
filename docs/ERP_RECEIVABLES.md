# Facturation clients et créances

## Chaîne

Commande, livraison, contrat, projet ou saisie autorisée → facture brouillon → approbation indépendante → émission et comptabilisation → créance → paiements/avoirs alloués → solde ouvert.

Les totaux sont recalculés côté serveur : quantité × prix − remise + taxe. Le numéro serveur est unique et non réutilisé. Une facture émise n’est plus modifiable.

## Solde

La créance est unique par facture et son solde provient uniquement des allocations confirmées :

`facture − avoirs − paiements − write-offs autorisés`.

Les paiements partiels produisent `PARTIALLY_PAID`; un solde nul produit `PAID`. Les avances non affectées restent dans un compte d’avance client jusqu’à allocation.

## Avoir

L’avoir référence la facture et son motif. Il possède ses propres lignes, exige une approbation indépendante, produit une écriture inverse et réduit la créance sans supprimer la facture originale.

## Sécurité

Toutes les références sont validées dans la même organisation. L’émission, l’approbation, la comptabilisation, l’allocation et l’export sont des permissions distinctes. Les notifications utilisent un lien profond vers `FINANCE_RECEIVABLES?invoiceId=...` sans montant sensible dans le Push.
