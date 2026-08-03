# Plan E2E manuel — Consolidation ERP finale

**Statut global : NON_EXÉCUTÉ**
**Tests E2E manuels préparés — validation du propriétaire en attente.**

Les comptes, organisations et données doivent être préparés dans Production par le propriétaire. Les résultats réels, captures et tickets restent vides jusqu’à exécution.

| ID | Chaîne | Modules | Comptes/rôles | Préconditions | Étapes principales | Résultat attendu | Résultat réel | Statut | Observations/captures/ticket |
|---|---|---|---|---|---|---|---|---|---|
| E2E-SALE-01 | Vente complète | CRM, devis, contrats, ventes, stock, créances, paiements, comptabilité | commercial, validateur, Finance | client/catalogue/site/comptes actifs | Prospect → client → devis → commande → livraison → facture → paiement → allocation → écriture | mêmes tiers et sources, aucun doublon, deep links exacts | — | NON_EXÉCUTÉ | — |
| E2E-BUY-01 | Achat complet | fournisseurs, achats, réceptions, stock, dettes, paiements, comptabilité | demandeur, approbateur, magasinier, Finance | fournisseur/produit/entrepôt actifs | besoin → demande → commande → réception → stock → facture → paiement → écriture | contrôle à trois voies et projections uniques | — | NON_EXÉCUTÉ | — |
| E2E-HR-01 | RH et paie | RH, temps, congés, paie, Finance | employé, manager, RH, approbateur, Finance | contrat actif et période ouverte | temps → approbation → paie → bulletin → paiement → écriture | aucune auto-approbation, confidentialité et accès bulletin | — | NON_EXÉCUTÉ | — |
| E2E-PROJ-01 | Projet | clients, contrats, projets, temps, livrables, facturation | chef projet, contributeur, validateur, Finance | contrat/client actifs | projet → temps → livrable → correction éventuelle → acceptation → facture | aucun double revenu, commentaires conservés | — | NON_EXÉCUTÉ | — |
| E2E-ASSET-01 | Actif | achats, actifs, maintenance, immobilisations | achats, responsable actif, comptable | période et comptes d’actif configurés | achat → actif → affectation → maintenance → capitalisation → amortissement | actif opérationnel distinct du profil comptable | — | NON_EXÉCUTÉ | — |
| E2E-HEALTH-01 | Health | patient, rendez-vous, consultation, laboratoire, prescription, facturation, assurance, paiement | accueil, praticien, laboratoire, assurance, Finance | consentements et services mappés | patient → rendez-vous → consultation → labo → prescription → prestation → facture → paiement | facture commune unique, Finance sans détail clinique | — | NON_EXÉCUTÉ | — |
| E2E-PHARM-01 | Pharmacy | catalogue, achats, lots, stock, vente, caisse, Finance | pharmacien, acheteur, magasinier, caissier, Finance | produit mappé et lot vendable | commande → réception → lot → FEFO → vente → mouvement → facture → caisse → écriture | stock/facture/paiement/écriture uniques | — | NON_EXÉCUTÉ | — |
| E2E-REL-01 | Relations avec les entreprises | contexte global, invitations, consentements, accès | invité, owner entreprise, admin DTSC | utilisateur hors tenant | visibilité desktop/mobile → invitation → consentement → accès → révocation | invitation visible avant adhésion, accès dérivé retiré | — | NON_EXÉCUTÉ | — |
| E2E-NAV-01 | Navigation et français | tous modules ERP | rôles représentatifs | modules/plans activés | ordre/icônes → sous-routes → deep links → retour → mobile → guides | aucun UUID, aucun texte technique, état actif correct | — | NON_EXÉCUTÉ | — |
| E2E-PROJERR-01 | Reprise projection | Finance overview | gestionnaire Finance | projection de test en échec contrôlé | ouvrir source → corriger prérequis → relancer | même projection terminée, aucun objet dupliqué | — | NON_EXÉCUTÉ | — |

## Données à consigner

Pour chaque scénario : entreprise, adresse des comptes, rôles, heure, résultat réel, captures, identifiant de l’objet, logs pertinents et ticket correctif. Un échec produit une branche corrective, une PR, des Quality Gates, un merge `main`, un déploiement Production et un nouveau test ciblé.
