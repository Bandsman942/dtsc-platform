# Tests E2E manuels — Professionnalisation ERP, itération 04

## Statut général

**Tests E2E manuels préparés — validation du propriétaire en attente**

- Propriétaire des tests : propriétaire de DTSC Platform
- Environnement cible : Production après fusion dans `main`
- Authentification : comptes réels de test, rôles séparés
- Statut initial de chaque scénario : `NON_EXÉCUTÉ`
- Interdiction : aucun résultat ne doit être changé en `RÉUSSI` sans exécution et confirmation explicite du propriétaire.

## Comptes et rôles à préparer

| Alias | Rôle attendu | Usage |
|---|---|---|
| FIN_ADMIN | Administrateur Finance | Configuration et supervision |
| AR_PREPARER | Préparateur créances | Factures clients |
| AP_PREPARER | Préparateur dettes | Factures fournisseurs |
| FIN_APPROVER | Approbateur indépendant | Factures, paiements, transferts |
| CASHIER | Caissier | Sessions et opérations de caisse |
| CASH_VALIDATOR | Validateur de caisse | Clôture indépendante |
| BANK_OPERATOR | Opérateur bancaire | Import des relevés |
| RECON_APPROVER | Validateur rapprochement | Validation indépendante |
| READ_ONLY | Consultation Finance | Vérification des restrictions |

Tous les comptes appartiennent à la même entreprise de test, sauf les scénarios d’isolation tenant qui utilisent une deuxième entreprise.

## Grille de résultat obligatoire

Pour chaque scénario, compléter :

- Résultat réel :
- Statut : `NON_EXÉCUTÉ` / `RÉUSSI` / `ÉCHOUÉ` / `BLOQUÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

---

## FIN-E2E-04-001 — Configuration financière

- Module : Vue d’ensemble Finance
- Objectif : préparer Finance sans modifier dangereusement l’historique.
- Entreprise : entreprise de test principale
- Compte : FIN_ADMIN
- Préconditions : plan comptable et permissions disponibles.
- Étapes :
  1. Ouvrir la Vue d’ensemble Finance.
  2. Définir la devise fonctionnelle.
  3. Définir ou vérifier l’exercice financier.
  4. Ouvrir une période.
  5. Créer un compte financier.
  6. Vérifier la checklist et les actions recommandées.
- Résultat attendu : checklist métier en français, liens actionnables, aucune clé technique, blocage explicite si une modification de devise est interdite après comptabilisation.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-002 — Créance client complète

- Module : Créances et factures clients
- Objectif : vérifier facture, approbation, émission, créance unique, paiements partiels et paiement total.
- Compte : AR_PREPARER puis FIN_APPROVER
- Préconditions : client, catalogue, compte financier, période ouverte.
- Étapes :
  1. Créer une facture client avec plusieurs lignes.
  2. Joindre un justificatif privé.
  3. Soumettre la facture.
  4. Tenter une auto-approbation avec AR_PREPARER.
  5. Approuver avec FIN_APPROVER.
  6. Émettre et comptabiliser.
  7. Vérifier la créance unique.
  8. Enregistrer un paiement partiel et l’affecter.
  9. Enregistrer le solde et l’affecter.
  10. Vérifier le statut payé, les allocations, l’historique et l’écriture.
- Résultat attendu : auto-approbation refusée, une seule créance, montants bornés, solde exact, aucun doublon au double clic.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-003 — Avoir client

- Module : Créances et factures clients
- Objectif : réduire une créance par un avoir contrôlé.
- Compte : AR_PREPARER puis FIN_APPROVER
- Préconditions : facture émise avec solde ouvert.
- Étapes : créer l’avoir, le soumettre, le faire valider, vérifier la réduction de la créance et l’écriture liée.
- Résultat attendu : facture d’origine conservée, avoir distinct, aucun montant négatif incohérent.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-004 — Dette et contrôle commande-réception-facture

- Module : Dettes et factures fournisseurs
- Objectif : vérifier la chaîne achats vers dette.
- Compte : AP_PREPARER puis FIN_APPROVER
- Préconditions : fournisseur, commande, réception, période ouverte.
- Étapes :
  1. Créer une facture fournisseur depuis la commande et la réception.
  2. Vérifier quantités commandées, reçues et facturées.
  3. Créer volontairement un écart de prix.
  4. Corriger ou justifier la dérogation.
  5. Faire approuver par FIN_APPROVER.
  6. Vérifier la dette unique.
  7. Payer partiellement puis totalement.
- Résultat attendu : écarts visibles, dérogation motivée et auditée, référence fournisseur dupliquée refusée, dette exacte.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-005 — Paiement non affecté

- Module : Paiements et allocations
- Objectif : confirmer puis affecter ultérieurement un paiement.
- Compte : AR_PREPARER puis FIN_APPROVER
- Préconditions : créance ouverte.
- Étapes : créer, soumettre, approuver et confirmer le paiement sans allocation ; le retrouver dans `Non affectés` ; l’affecter ; vérifier le solde restant.
- Résultat attendu : paiement visible immédiatement, allocation limitée au disponible et au solde de la facture.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-006 — Transfert de trésorerie

- Module : Trésorerie
- Objectif : transférer entre deux comptes avec approbation indépendante.
- Compte : FIN_ADMIN puis FIN_APPROVER
- Préconditions : deux comptes financiers compatibles.
- Étapes : initier, soumettre, approuver, exécuter, vérifier les deux soldes et l’écriture ; répéter la requête pour vérifier l’idempotence.
- Résultat attendu : même compte interdit, auto-approbation interdite, soldes équilibrés, aucun double transfert.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-007 — Caisse et clôture indépendante

- Module : Caisse
- Objectif : vérifier ouverture, mouvements, comptage, écart et validation.
- Compte : CASHIER puis CASH_VALIDATOR
- Préconditions : caisse active.
- Étapes : ouvrir ; tenter une deuxième session incompatible ; enregistrer encaissements et décaissement ; compter ; créer un écart ; justifier ; soumettre ; tenter l’auto-validation ; valider avec CASH_VALIDATOR.
- Résultat attendu : deuxième session refusée, écart conservé, auto-validation refusée, historique complet.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-008 — Import bancaire et doublon

- Module : Banque
- Objectif : vérifier l’import sécurisé d’un relevé CSV.
- Compte : BANK_OPERATOR
- Préconditions : compte bancaire actif ; fichier CSV de test.
- Étapes : importer, vérifier la prévisualisation, confirmer, ouvrir les lignes, réimporter le même fichier, tester un type ou une taille invalide.
- Résultat attendu : doublon bloqué sans supprimer la preuve, fichier invalide refusé, aucune formule dangereuse affichée ou exportée, aucun numéro complet dans les logs.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-009 — Rapprochement

- Module : Rapprochement
- Objectif : vérifier correspondance manuelle, suggestion explicable et non-duplication.
- Compte : BANK_OPERATOR puis RECON_APPROVER
- Préconditions : relevé importé, paiements confirmés.
- Étapes : ouvrir une session ; sélectionner une ligne ; examiner les critères de suggestion ; accepter une suggestion non ambiguë ; rapprocher manuellement une autre ligne ; tenter un double rapprochement ; soumettre et valider.
- Résultat attendu : critères visibles, ambiguïté non auto-validée, double rapprochement refusé, session clôturée immuable.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-010 — Période fermée

- Module : Finance opérationnelle
- Objectif : vérifier les blocages temporels.
- Compte : FIN_ADMIN
- Préconditions : période de test fermée ou verrouillée.
- Étapes : tenter une facture, un paiement, une allocation et une comptabilisation dans la période.
- Résultat attendu : mutation refusée, message explicite en français, aucune donnée partielle créée.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-011 — Navigation Relations avec les entreprises

- Module : Relations avec les entreprises
- Objectif : vérifier la dette transversale de navigation.
- Compte : compte global sans entreprise active puis compte avec entreprise.
- Étapes : vérifier desktop, mobile, menu compte, badge, état sélectionné, ouverture depuis notification et fonctionnement sans entreprise active.
- Résultat attendu : module toujours visible et lien profond vers l’objet précis.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-012 — Mobile et français

- Modules : les huit modules Finance
- Objectif : vérifier 320, 360, 390, 412 px, tablette et desktop.
- Compte : FIN_ADMIN, CASHIER et READ_ONLY.
- Étapes : parcourir KPI, filtres, listes, détails, formulaires, caisse, import et rapprochement ; utiliser le clavier numérique ; tester retour arrière et liens profonds.
- Résultat attendu : aucun texte anglais ni enum brut en français, aucun UUID visible, rails KPI horizontaux, aucun débordement global, dialogues scrollables, boutons tactiles et montants lisibles.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## FIN-E2E-04-013 — Isolation tenant et permissions

- Modules : les huit modules Finance
- Objectif : vérifier IDOR et élévation de privilège.
- Comptes : READ_ONLY dans entreprise A, FIN_ADMIN dans entreprise B.
- Étapes : modifier les identifiants d’URL et `organizationId`, appeler directement les routes mutantes, tenter d’utiliser un rôle global DTSC ou manager comme bypass.
- Résultat attendu : 403 ou 404 sans fuite de métadonnées, aucune mutation, aucune donnée d’une autre entreprise.
- Résultat réel :
- Statut : `NON_EXÉCUTÉ`
- Date :
- Testeur :
- Observations :
- Capture :
- Ticket correctif :

## Clôture manuelle

La promotion éventuelle vers `COMMERCIAL_READY` exige :

1. tous les scénarios critiques `RÉUSSI` ;
2. aucun défaut critique ouvert ;
3. confirmation explicite du propriétaire ;
4. mise à jour séparée de la matrice de maturité ;
5. nouvelle PR si une correction est nécessaire.

**Tests E2E manuels préparés — validation du propriétaire en attente**
