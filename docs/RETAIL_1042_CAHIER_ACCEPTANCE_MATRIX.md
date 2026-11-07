# RETAIL-1042 — matrice exhaustive de réception du cahier des charges

Source primaire : `CAHIER_DES_CHARGES_BOUTIQUES.pdf`, novembre 2026, 22 pages. Cette matrice est une transcription de suivi, **pas** un remplacement du document client. Elle doit être revue contre la source avant l'`OWNER_E2E`.

Protocole concret d'exécution et fiche de signature : [RETAIL_1042_OWNER_E2E_SCRIPT.md](RETAIL_1042_OWNER_E2E_SCRIPT.md). **Aucun des scénarios ni des douze critères n'est encore attesté BON** par le propriétaire.

Tranche 45 candidate : aucun liquidateur ne doit confirmer un remboursement sans revérification récente du mot de passe et, si activé, d'un code MFA. Test navigateur `428 STEP_UP_REQUIRED` avant vérification, puis liquidation réelle ; reste à valider en CI, en environnement client et sur le matériel réel.

Tranche 43 candidate : véritable scénario navigateur de retour/avoir/remboursement à cinq acteurs et réintégration comptabilisée du stock. Les cas de paiements multi-comptes, le CASH, l'habilitation minimale réelle des cinq fonctions et la recette propriétaire restent ouverts.

Tranche 41 validée par CI (24/24 E2E, 17/17 workflows) : contrôle navigateur d'une facture à trois acteurs, double paiement Finance, allocations idempotentes et unique imputation stock/coût après règlement intégral. Cela ne valide **pas** l'E2E de retour/avoir/remboursement, la clôture réelle multi-caissiers, les imprimantes, les exports, la restauration ou la signature propriétaire.

Périmètre : ERP Core Retail **paramétrable et réutilisable** pour N boutiques, avec un scénario de référence à deux boutiques alimentaires à Kinshasa. Ne jamais créer une solution codée pour un client, un nombre de boutiques, un gérant, une devise, une caisse ou une marque déterminés.

**Statuts utilisés :** `PARTIEL` signifie qu'une fondation existe mais qu'un point ou une preuve manque ; `À_CERTIFIER` signifie que l'implémentation doit encore passer un E2E réel ; `OUVERT` signifie qu'au moins une capacité nécessaire manque. Aucun de ces statuts ne vaut acceptation.

## 1. Traçabilité des 17 chapitres

| Chapitre du cahier | Contrat de réception à prouver | État conservateur au 07/11/2026 |
| --- | --- | --- |
| I — Présentation et objectifs | Centralisation, indépendance, traçabilité, simplicité, sécurité | PARTIEL : fondation multi-site présente, E2E absent |
| II — Périmètre et fonctionnement | Stock, ventes, caisse, dépenses et rapports isolés pour chaque boutique ; supervision propriétaire | PARTIEL : isolation incomplète dans certaines routes communes |
| III — Profils et droits | Administrateur, gérant, facturier et caissier ; restrictions UI **et serveur** ; désactivation ; pas d'accès inter-boutiques | PARTIEL : gestion d'affectations disponible ; matrice contradictoire à arbitrer par paramètres explicites |
| IV — 4.1 Authentification | Login, logout, récupération, sessions, comptes désactivés, autorisations | À_CERTIFIER avec les quatre profils |
| IV — 4.2 Articles et catégories | Code, code-barres facultatif, désignation, catégorie, unité, prix d'achat/vente, seuil, statut, historique | PARTIEL : contrôler UI, catalogues, permissions sur prix et désactivation |
| IV — 4.3 Stocks | Stock disponible, rupture, minimum, mouvements par boutique, pas d'édition sans justification | PARTIEL : réservations/contrôles ajoutés, E2E concurrent encore absent |
| IV — 4.4 Entrées de marchandises | Fournisseur, réception, quantités, prix/coût, observation, responsable, historique, lot et boutique | PARTIEL : contrôler réception par lot et interdiction aux rôles non autorisés |
| IV — 4.5 Sorties de marchandises | Sortie motivée (perte, péremption, dommage, consommation, retour fournisseur), audit et stock | PARTIEL : contrôler tous les motifs, historique et permissions |
| IV — 4.6 Transferts | Préparation, demande, validation indépendante, transit, réception, écarts, lots, historique, pas de double stock | PARTIEL : transit et réception codés, tests humains manquants |
| IV — 4.7 Ventes | Numéro, boutique, facturier, client facultatif, prix/remises, quantité, horodatage, statut et stock disponible | PARTIEL : contrôle des remises facultatives et séparation des rôles à certifier |
| IV — 4.8 Facturation | Facture unique, statuts, annulation non destructive, A4/thermique, mentions légales et règlement partiel | PARTIEL : facture Finance, impression et orchestrateur de retour/avoir/remboursement codés ; tests PostgreSQL multi-acteurs et E2E final toujours absents |
| IV — 4.9 Caisses | Espèces/Mobile Money/virement, recettes, clôture journalière, écarts, autorisation distincte et historique | OUVERT : certification par boutique, plusieurs caissiers, correctifs et validation de clôture |
| IV — 4.10 Dépenses | Catégorie, boutique, justificatif, mode de paiement, droits d'entrée et validation configurables, rapport | PARTIEL : siteId ajouté, isolement transversal et rapprochement à terminer |
| IV — 4.11 Clients | Enregistrement facultatif, coordonnées facultatives et historique d'achats | À_CERTIFIER : vente anonyme et consentement, pas de compte global imposé |
| IV — 4.12 Fournisseurs | Répertoire et historique des approvisionnements | À_CERTIFIER : référence canonique de tiers, filtrage et UI |
| IV — 4.13 Péremption | Lots distincts, dates, alertes avant/à/après expiration, politique FEFO, blocage optionnel | PARTIEL : paramétrage et alertes codés, réception/vente réelles à vérifier |
| IV — 4.14 Rapports/statistiques | Ventes, stocks, top/flop, entrées/sorties, CA, COGS, dépenses, marges, bénéfices, filtres, PDF/XLSX | PARTIEL : écritures de résultat `POSTED`/`REVERSED` groupées par boutique/devise avec marge brute et résultat d'exploitation **non certifiés** ; historique sans `siteId`, exhaustivité et exports PDF/XLSX restent ouverts |
| V — Tableaux de bord | Propriétaire consolidé ; gérant/facturier/caissier limité à son périmètre, KPI non fictifs | PARTIEL : revue des 4 expériences et des totaux nécessaire |
| VI — Règles RG01–RG20 | Toutes les règles numérotées ci-dessous doivent passer dans le produit | PARTIEL : voir matrice RG |
| VII — Architecture technique | Web responsive, base unique, extensions canoniques et multi-tenant ; pas de double ledger | À_CERTIFIER : schéma/migrations/contraintes CI + base réelle |
| VIII — Sécurité et protection | Auth, RBAC, HTTPS, injections, journaux, sauvegardes, **restauration testée** | OUVERT : restauration et test inter-rôles non réalisés |
| IX — UI/UX | Menu selon rôle, interfaces professionnelles, ergonomie Android/tablette/desktop | PARTIEL : Design 2.0, vérification visuelle mobile/accessibilité requise |
| X — Non fonctionnel | Performance, disponibilité, navigateurs, N boutiques, fiabilité, confidentialité et sauvegarde | OUVERT : mesures et exercices de reprise à documenter |
| XI — Matériel | 3 PC, Android facultatif, réseau, imprimantes, fonctionnement de bout en bout | À_CERTIFIER : impression A4/80 mm sur matériel disponible |
| XII — Phases/délai | Analyse, UML, schéma, UI, modules, tests, déploiement, formation ; délai prévisionnel non garanti | PARTIEL : suivi de livraison, formation et accord commercial séparés |
| XIII — Tests et validation | Auth, stock, facture, caisse, finance, comparaison A/B | OUVERT : E2E techniques et E2E propriétaire |
| XIV — Livrables | Application, base/migrations, interfaces, accès initiaux, guides, sauvegarde, déploiement, maintenance | OUVERT : conformité technique ; remise du code SaaS soumise au contrat commercial |
| XV — Évolutions futures | N boutiques ; mobile natif, offline, crédit, commandes, scanners, intégrations possibles en extensions | PARTIEL : capacités futures restent optionnelles, **pas** critères de release immédiate |
| XVI — Réception | Les douze critères ci-dessous doivent être démontrés | OUVERT : OWNER_E2E non exécuté |
| XVII — Conclusion | Gestion unifiée, sécurisée, évolutive, traçable et financièrement fiable | À_CERTIFIER après tous les contrats précédents |

## 2. Règles de gestion RG01–RG20 : preuves exigées

| Règle | Preuve requise |
| --- | --- |
| RG01 | Compte personnel, sessions et blocage compte désactivé |
| RG02 | Affectation boutique, exception propriétaire explicite |
| RG03 | A ne peut lire/écrire B via UI, URL directe, API, export, KPI |
| RG04 | Propriétaire voit A, B et consolidation exacte |
| RG05 | Code article unique selon le référentiel canonique |
| RG06 | Réception validée = entrée stock unique |
| RG07 | Sortie validée = diminution stock unique |
| RG08 | Paiement intégral = sortie réelle et unique des marchandises |
| RG09 | Impayé = aucune sortie définitive ; promesse réservée sans double vente |
| RG10 | Annulée = exclue du CA et libération de promesse |
| RG11 | Payée = historique immuable ; correction par avoir/retour traçable |
| RG12 | Refuser toute quantité supérieure au disponible, y compris deux transactions concurrentes |
| RG13 | Transfert : sortie A, transit, réception B sans double stock |
| RG14 | Chaque encaissement de ce parcours est relié à la facture Finance canonique |
| RG15 | Caisse, compte financier, session et devise propres à la boutique |
| RG16 | Clôture conservée avec validations et écarts, non rééditable librement |
| RG17 | Auteur, date, objet, transition, raison et audit de chaque opération sensible |
| RG18 | Prix changés seulement avec permission administrative explicite |
| RG19 | Annulations historiques, pas de suppression silencieuse de ledger |
| RG20 | CA, encaissements, dépenses, COGS, marge et bénéfices distincts ; devises jamais additionnées sans FX daté |

## 3. Décisions de la page 22 et politique de paramétrage

| Décision du cahier | Paramètre ou règle prudente | Validation |
| --- | --- | --- |
| D01 — Paiement en plusieurs fois | Option par entreprise ; solde Finance canonique, encaissements partiels sans sortie anticipée | E2E partiel → complet |
| D02 — Modification après transmission | Interdite ; retour en brouillon seulement par transition autorisée et auditée | E2E état et révision |
| D03 — Gérant enregistre les dépenses ? | **Non accordé par défaut** ; permissions `RECORD_EXPENSE` / `APPROVE_EXPENSE` explicites et séparées | Décision métier propriétaire à confirmer |
| D04 — Validateur des transferts | Administrateur/propriétaire par défaut ; délégation contrôlée, configurable, indépendant du demandeur | E2E A → B |
| D05 — Modification des prix | Droit administrateur uniquement, côté serveur | E2E contre-épreuve gérant/facturier/caissier |
| D06 — Vente à crédit | Désactivée par défaut ; extension future éventuelle, non activée silencieusement | Hors première réception sauf décision contraire |
| D07 — Vente hors ligne | Désactivée par défaut ; étude future avec synchronisation/conflicts | Hors première réception sauf décision contraire |
| D08 — Plusieurs caissiers | Oui, chacun avec identifiant, session et caisse réconciliables | E2E deux caissiers de A + B |

**Contradiction documentaire III :** la description du gérant lui attribue supervision et « tous droits du facturier et caissier », mais le tableau 3.5 lui refuse préparation/encaissement/clôture/transfert. Les droits ne doivent être ni déduits du nom du rôle ni élargis implicitement. La politique par défaut est restrictive ; les capacités sont configurables par boutique, contrôlées côté serveur et soumises à la séparation des approbations Finance. Ce conflit exige une décision explicite avant activation chez le client.

Le **refus par défaut** s'applique à toute capacité sensible non attribuée explicitement et à toute affectation révoquée.

## 4. Deux niveaux de E2E, sans substitution

### E2E technique (à construire et exécuter avant remise)

1. PostgreSQL réel isolé, migrations base vide et reprise après conflit ; deux boutiques, plusieurs opérateurs, sessions authentifiées.
2. Contre-épreuves inter-boutiques sur lectures, écritures, détails, recherches, compteurs, notifications, exports et accès direct ; révocation immédiate.
3. Facturier A → approbateur indépendant → caissier A → paiements partiel et total → stock unique ; rejeux/doubles requêtes et concurrence stock.
4. Retours partiels/complets, refus qualité, remise en stock motivée, avoir Finance, remboursement client, mouvements comptables inverses idempotents et conservation historique.
5. Entrées, sorties motivées, lots/FEFO, péremption, transfert A→B avec transit/réception et exceptions.
6. Deux caissiers de A et un de B ; espèces/Mobile Money/banque, ouverture/clôture, écart/motif, validation indépendante, caisse historiquement cohérente.
7. Rapports des deux boutiques et consolidés, vraies écritures POSTED pour COGS/profit, dates et devises séparées, exports PDF/XLSX ; pas de double comptage POS/factures.
8. Android/tablette/desktop, 320/390/768/1024, FR/EN, clair/sombre, clavier/lecteur d'écran, A4 et thermique réels, interruption réseau, sauvegarde puis **restauration vérifiée**.

### OWNER_E2E final (à remettre au Dr Jonathan NTUMBA après CI et E2E techniques)

Les **12 critères du chapitre XVI** sont : (1) A/B accessibles sur une plateforme ; (2) stocks indépendants ; (3) fonctions uniquement autorisées ; (4) entrées/sorties correctes ; (5) transferts corrects ; (6) factures créées/imprimées ; (7) circuit facturier–caissier ; (8) encaissements enregistrés ; (9) clôtures journalières ; (10) rapports cohérents ; (11) données protégées ; (12) restauration effective de sauvegarde. Chaque critère exige une observation, une preuve et un statut BON/KO signé par le propriétaire.

## 5. Conditions bloquantes et gouvernance

- `siteStaffIsolationEnabled` et `invoiceCheckoutEnabled` restent OFF jusqu'à couverture **de toutes** les routes et des parcours ; pas de valeur de configuration codée pour ce client.
- E2E automatisé validé ≠ OWNER_E2E validé. Les deux sont nécessaires. Les commits `19818f1c` et `07207f65` ont validé **22/22 tests navigateur** sur PostgreSQL isolé (facture brouillon, séparation A/B, révocation, refus d'accès aux paiements/retours inter-boutiques et vues d'impression), mais **pas** le règlement Finance multi-acteurs, les caisses, les rapports, l'impression physique ni la restauration. Un test de concurrence sur l'unique article et de libération de promesse après annulation est proposé en tranche 38, sans prétendre qu'il est déjà exécuté.
- Aucun merge de la PR #1043 avant `OWNER_E2E` global BON du Dr Jonathan ; Production uniquement depuis `main` avec CI et release vérifiées.
- Ne pas annoncer une date ni un nombre définitif de tranches avant clôture de chaque lacune et de la matrice de réception.
