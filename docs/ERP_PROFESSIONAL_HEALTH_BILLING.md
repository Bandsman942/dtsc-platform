# Module professionnel Health — Facturation médicale

**Code canonique :** `MEDICAL_BILLING`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Source financière unique

Toute facture médicale financière possède une facture commune unique. Le module Health constitue une extension spécialisée : patient, consultation ou service source, couverture, part patient et part assurance.

```text
TOTAL = PART PATIENT + PART ASSURANCE + AUTRE PRISE EN CHARGE
```

## Expérience

Le workspace propose liste, recherche, filtres, détail, formulaire de prestations, quantités, prix, taxes, couverture, documents et actions de validation. Les montants sont recalculés côté serveur.

## Paiements

Les paiements patient et assureur utilisent le moteur commun. Une facture n’est pas marquée payée sans paiement confirmé et allocation valide. Les relances, soldes et échéances s’appuient sur les créances communes.

## Confidentialité

Finance voit identifiant, tiers financier, montant, statut, échéance, paiement et référence de service générique. Diagnostic, notes médicales, résultats et détails cliniques inutiles restent dans Health.

## Intégrité

Les clés d’idempotence et liens structurels empêchent double facture, double créance, double paiement et double écriture.

## Validation

QA automatisée : facture commune, ventilation, paiements et confidentialité.
E2E propriétaire : scénario `I06-H-004`.
