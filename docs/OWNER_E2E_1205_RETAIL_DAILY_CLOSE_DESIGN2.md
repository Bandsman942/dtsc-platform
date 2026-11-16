# OWNER E2E — Hotfix #1205 Clôture magasin Design 2.0

Statut initial : **NON EXÉCUTÉ**. Exécuter avec comptes de test autorisés et deux organisations distinctes : `COMMERCE_RETAIL + SHOP` et `COMMERCE_RETAIL + null` (RETAIL général). Ne pas modifier les données de production pour cet essai.

| ID | Scénario | Résultat attendu | Statut |
|---|---|---|---|
| E01 | Ouvrir Clôture magasin en desktop puis mobile 390 px et ouvrir successivement toutes les sections | Cartes compactes, navigation pleine page, retour, pas de scroll horizontal, contraste clair/sombre | NON EXÉCUTÉ |
| E02 | Ouvrir « Soumettre la clôture journalière », sélectionner une caisse CDF | Liste préchargée de billets/pièces avec quantité pour chaque coupure; aucun champ texte de type `50000x2` | NON EXÉCUTÉ |
| E03 | Saisir 2 × 20 000 CDF et 3 × 5 000 CDF | Total compté = 55 000 CDF; écart = 55 000 moins solde théorique, justification requise si non nul | NON EXÉCUTÉ |
| E04 | Ajouter une coupure personnalisée différente des prédéfinies et sa quantité | Total et écart recalculés, valeurs soumises une seule fois, pas de doublon de coupure | NON EXÉCUTÉ |
| E05 | Coupure personnalisée partielle, quantité décimale/négative, ou écart sans justification | Soumission refusée avec erreur contextualisée, aucune clôture enregistrée | NON EXÉCUTÉ |
| E06 | Soumettre une caisse sans validateur Finance indépendant | Refus explicite; puis sélection validateur éligible → clôture soumise pour validation | NON EXÉCUTÉ |
| E07 | Valider/refuser par utilisateur autorisé distinct, puis tenter auto-validation ou action hors droits | Flux Finance conforme, aucune validation hors autorisation; audit et historique exacts | NON EXÉCUTÉ |
| E08 | Tester USD et un compte non espèces, avec plusieurs devises | Coupures USD propres; montant manuel pour non-CASH; aucun mélange de devise | NON EXÉCUTÉ |
| E09 | Avec deux boutiques, choisir « toutes » puis tenter une soumission multiboutique | Lecture consolidée autorisée; écriture multi-boutique refusée; sélection de boutique précise nécessaire | NON EXÉCUTÉ |
| E10 | Statuts, filtre date précise/plage, recherche par numéro/note, pagination | Résultats paginés et filtrés côté serveur; date de fin inclusive; site et droits respectés | NON EXÉCUTÉ |
| E11 | Export CSV depuis l'historique filtré, contenant des écritures et écarts | Colonnes datées, statut, devise, compte et montants corrects; export limité à la page visible | NON EXÉCUTÉ |
| E12 | Organisation RETAIL générale : ouvrir Clôture magasin | Ni « Reprise de l'historique du Shop » ni « Reprises enregistrées » visibles | NON EXÉCUTÉ |
| E13 | Organisation RETAIL générale : appeler GET/POST historique, preview, apply | HTTP 403 sur toutes les variantes, sans exposition de données ni mutation | NON EXÉCUTÉ |
| E14 | Organisation SHOP : parcourir et prévisualiser une reprise historique | Deux sections historiques visibles; prévisualisation et validation indépendante inchangées | NON EXÉCUTÉ |
| E15 | Vérifier chargement, erreurs de serveur, rechargement des données et bascule FR/EN | Toasts métier typés, aucun libellé technique brut, aucune saisie effacée sur échec | NON EXÉCUTÉ |

## Validation
Les jobs GitHub Actions de la PR doivent être terminés avec succès, y compris Quality, contrôle Prisma/Migration, régressions RETAIL et le scénario E2E manuel propriétaire. Ne pas fusionner si un contrôle requis manque ou échoue.

**Réponse attendue :** `E2E final #<numéro PR> BON` uniquement après exécution réelle.
