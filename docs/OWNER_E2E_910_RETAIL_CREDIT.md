# OWNER_E2E #910 — CREDIT relationnel (recette propriétaire)

Statut : **NOT_EXECUTED** — aucune confirmation propriétaire reçue. PR en brouillon, aucun déploiement.

## Prérequis
- Environnement de test isolé avec RELATIONSHIP_BENEFITS, RETAIL_POS, FINANCE_ACCOUNTING et DOCUMENTS accessibles selon les abonnements et permissions.
- Deux collaborateurs distincts : A peut gérer les avantages et consulter Finance ; B possède le droit FINANCE_ACCOUNTING:approve, Retail manage et avantages manage.
- Client Retail réel avec rôle CUSTOMER, relation ACTIVE consentie/approuvée, référence personne→tiers active, même organisation, devise active.
- Un document EnterpriseDocument ACTIVE, visibilité ORGANIZATION, contenant au moins une version.
- Une règle CREDIT en valeur AMOUNT fixe (exemple 10 USD), assignment MANUAL avec attribution explicite au lien concerné, action NONE, cible RETAIL_POS, sans conditions de panier ni cumul.

## Parcours positif
1. Avec A, ouvrir Administration entreprise → Relations & avantages → Demandes → Crédit magasin manuel. Sélectionner la règle, le client lié, la pièce justificative et renseigner un motif de plus de 10 caractères. Soumettre.
2. Vérifier l'état En attente et l'absence d'augmentation du solde Retail ; journal Finance sans écriture de crédit.
3. Avec A, tenter d'approuver sa demande : refus explicite, aucun EARN ni journal.
4. Avec B, approuver avec justification : succès et statut Crédité. Le compte STORE_CREDIT du client dans la même devise augmente de 10 USD ; un seul EARN et un seul journal POSTED équilibré (débit OPERATING_EXPENSE, crédit CUSTOMER_ADVANCES).
5. Sur POS, encaisser une vente suivante par avoir magasin (partiel ou complet dans la limite du solde). Vérifier le ticket, le journal, la dette client et le solde disponible exact.
6. Rejouer la même décision ou faire double clic : conflit/idempotence, aucune seconde attribution.
7. Toujours avec B, saisir un motif puis exécuter Reprendre le crédit. Vérifier une entrée REVERSAL de −10 USD, le journal comptable inverse et le statut Repris ; si l'avoir avait été entièrement dépensé, le solde signé peut devenir négatif mais ne doit plus être encaissable.
8. Rejouer la reprise : aucun second mouvement ni journal.

## Refus et frontières
- Relation révoquée, consentement absent, audience retirée, assignment supprimé, quota atteint : aucune émission.
- Document inexistant, archivé, sans fichier ou non visible par l'organisation : refus.
- Tiers sans rôle CUSTOMER, personne/tiers mal appariés, autre organisation : refus.
- Devise différente, valeur modifiée après demande, règle inactive/expirée : refus.
- FINANCE_ACCOUNTING approbation refusée, période verrouillée, journal/mapping absent : rollback transactionnel complet sans EARN orphelin.
- Rejeu avec même clé mais bénéficiaire/motif/document différent : conflit.
- Tester FR et EN, mode clair/sombre, 320/360/390/414/768/1024 px, focus clavier, aucun dépassement horizontal et aucun UUID ni nom de table comme texte principal.

## Preuves à joindre
- Identifiant de la PR et SHA final, statut 100 % CI.
- Copies des écrans FR/EN et des états de demande, comptabilisation et reprise.
- Comptage exact des entrées EARN et REVERSAL ainsi que des journaux équilibrés.
- Confirmation explicite `E2E #910 BON` avant toute fusion.

## Gouvernance
Ne pas tester sur des données réelles de clients en production. Pas de merge ou déploiement sans CI, recette distincte et vérification du SHA Vercel READY.
