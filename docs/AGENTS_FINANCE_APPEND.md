

## Règles DTSC — Finance, comptabilité et trésorerie communes

<!-- ERP_FINANCE_RULES_V1 -->

- Toute écriture comptable commune utilise la partie double et doit satisfaire `Σ débits = Σ crédits` côté serveur avec `Prisma.Decimal`.
- Toute écriture `POSTED` est immuable; aucune route, composant ou workflow ne peut modifier directement ses lignes, comptes, dates ou montants.
- Toute correction d’une écriture comptabilisée utilise une contrepassation liée à l’écriture originale, puis une nouvelle écriture si nécessaire.
- Aucune comptabilisation n’est autorisée dans une période `CLOSED` ou `LOCKED`; `SOFT_CLOSED` exige une permission renforcée et documentée.
- Tous les montants, taux, taxes, coûts, soldes et arrondis financiers utilisent `Prisma.Decimal`; un flottant JavaScript ne fait jamais autorité.
- Toute comptabilisation issue d’un événement métier possède une clé d’idempotence stable, un verrou transactionnel et une version de posting.
- Un paiement est un objet financier autonome avec approbation, confirmation, trésorerie, allocations et audit; il ne se réduit jamais à une modification de statut de facture.
- Une dépense budgétaire n’est pas une dette fournisseur. `EnterpriseExpense`, `EnterpriseSupplierInvoice` et `EnterprisePayment` conservent des responsabilités distinctes.
- Une réception de stock n’est pas une facture fournisseur. La réception valorisée utilise un clearing jusqu’à la facture ou résolution comptable.
- Une commande client n’est pas une facture. La facturation crée son propre document, sa créance et son écriture selon le workflow autorisé.
- Les allocations confirmées déterminent les soldes ouverts des créances et dettes; ne jamais maintenir une seconde source de solde concurrente.
- Tout paiement en espèces exige une `EnterpriseCashSession` ouverte du même compte financier et de la même organisation.
- Le caissier ne valide jamais sa propre clôture; tout écart de caisse exige justification, validation indépendante et écriture dédiée si nécessaire.
- Les comptes bancaires, références de paiement, salaires, données fiscales, justificatifs et états non publiés restent protégés par permissions et `view_sensitive`.
- Aucun mot de passe bancaire, token, clé API, numéro complet ou secret de fournisseur financier ne doit être stocké ou exposé côté client.
- Aucune règle libre de comptabilisation, formule JavaScript, SQL, nom de modèle Prisma ou compte arbitraire fourni par le navigateur n’est autorisé.
- Les montants de devises différentes ne sont jamais additionnés directement; les états utilisent la devise fonctionnelle ou séparent explicitement les devises.
- Le taux de change réellement utilisé par une transaction comptabilisée est conservé dans un snapshot historique et n’est jamais recalculé avec le taux courant.
- La paie interne DTSC reste séparée de la paie opérationnelle des entreprises clientes; aucun adapter ne doit les fusionner.
- Les finances Pharmacy et Health restent sectorielles jusqu’à leur convergence explicite en itération 4; aucune migration ou dual-write implicite n’est autorisé.
- Les états financiers utilisent uniquement les écritures `POSTED`, filtrées par `organizationId`, période, devise et dimensions validées.
- Toute mutation financière significative produit `ApiLog`, `AuditLog` et `EnterpriseOperationalEvent` avec métadonnées bornées et non sensibles.
- Les modules Finance restent déclarés dans le registre canonique, soumis au plan, au module actif, au membership et aux permissions côté serveur.
- Tous les workspaces Finance doivent rester responsive: rail KPI horizontal mobile, listes compactes, formulaires adaptés iPhone, mode sombre, FR/EN et aucun tableau large imposé sur mobile.
