# Catalogue des événements inter-modules

Les événements durables utilisent `EnterpriseDomainEvent`. Le producteur écrit l’objet, l’événement, sa clé d’idempotence et l’audit dans la même transaction. Le worker traite les consommateurs avec reprise et visibilité des erreurs.

| Événement réel | Sens canonique | Consommateur |
|---|---|---|
| `SALES_INVOICE_ISSUED` | facture client émise | créance et continuité comptable |
| `SUPPLIER_INVOICE_POSTED` | facture fournisseur approuvée/comptabilisée | dette et continuité comptable |
| `PAYMENT_CONFIRMED` | paiement confirmé | compte de trésorerie et tiers |
| `PAYMENT_ALLOCATED` | paiement affecté | créance ou dette ciblée |
| `PAYROLL_RUN_APPROVED` | paie approuvée | employés, bulletins et Finance |
| `PROJECT_DELIVERABLE_ACCEPTED` | livrable approuvé | projet, contrat et facturation admissible |
| `ASSET_ACCOUNTING_PROFILE_CREATED` | actif capitalisé | actif opérationnel et immobilisation |
| `HEALTH_MEDICAL_INVOICE_CREATED` | prestation Health facturée | facture commune sans détail clinique |
| `PHARMACY_SALE_INVOICE_CREATED` | vente Pharmacy facturée | facture commune |
| `STOCK_*` autorisé | mouvement physique confirmé | continuité stock/valorisation |

La clé d’idempotence inclut organisation, type d’entité, identifiant, transition, révision et empreinte stable des métadonnées. Cela distingue deux mouvements légitimes du même article tout en absorbant un retry identique.
