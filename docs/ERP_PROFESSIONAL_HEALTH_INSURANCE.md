# Module professionnel Health — Assurances et prises en charge

**Code canonique :** `INSURANCE_COVERAGE`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module gère assureur, régime, bénéficiaire, numéro d’adhésion, dates, plafond, taux, exclusions, autorisation préalable, documents et statut.

## Parcours

```text
éligibilité → demande de prise en charge → réponse → prestation
→ facture commune → créance assurance → paiement → allocation
```

## Expérience

La vue spécialisée présente part couverte, part patient, montant restant, autorisations, échéances, refus, motif communicable et historique. Les assureurs réutilisent les tiers/CRM communs.

## Intégrité

Une prise en charge ne crée pas de créance parallèle. La créance, le paiement et l’allocation restent dans Finance. Les montants sont bornés par la facture et la couverture autorisée.

## Confidentialité

Les réponses et documents exposent uniquement les informations nécessaires. Finance et l’assureur ne reçoivent pas les notes cliniques ou résultats inutiles.

## Validation

QA automatisée : références tenant, facture/créance commune, allocations et permissions.  
E2E propriétaire : scénario `I06-H-004`.
