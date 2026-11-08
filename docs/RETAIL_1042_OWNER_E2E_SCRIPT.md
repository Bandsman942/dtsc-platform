# RETAIL #1042 — scénario de recette intégrale propriétaire (NON EXÉCUTÉ)

**Version :** 7 novembre 2026 — protocole d'exécution, **pas** un procès-verbal de conformité. À remplir avec Dr Jonathan NTUMBA lors du `OWNER_E2E`. Les tests de code, PostgreSQL et CI ne valent pas validation fonctionnelle du propriétaire.

## 0. Conditions avant toute exécution

- [ ] PR #1043 : SHA testé identifié, workflows et migrations vérifiés sur ce même SHA, aucun changement non testé. Aucun déploiement de branche/Preview Vercel ; `main` seulement après validation.
- [ ] Un **tenant de recette isolé** `COMMERCE_RETAIL`, avec données synthétiques et Finance `READY`. **Ne jamais** activer les nouvelles options sur une organisation de production avant la décision de mise en service. Les valeurs `siteStaffIsolationEnabled` et `invoiceCheckoutEnabled` restent **OFF en production**.
- [ ] Deux boutiques réellement séparées : A et B ; deux dépôts, deux comptes financiers attribués chacun à son site, une devise de base définie. Ajouter une devise secondaire uniquement avec taux de change daté ; ne jamais additionner des devises non converties.
- [ ] Articles identifiables : un produit stocké avec couche de coût `WEIGHTED_AVERAGE` et journal `INVENTORY` actif, un article avec lot et péremption, un service sans stock ; prix/remises/taxes déterminés par le moteur de tarification. Préparer 10 unités de chaque article stocké dans A et B séparément.
- [ ] Comptes de test **distincts** : propriétaire, gérant A, facturier A, caissier A1, caissier A2, caissier B, inspecteur des stocks A, approbateur Finance, préparateur Finance, liquidateur Finance. Les cinq personnes du retour (demande, inspection, approbation, préparation, liquidation) doivent être distinctes pour le circuit actuellement codé ; prévoir leurs droits explicites. Ne pas utiliser le même utilisateur partout pour obtenir des tests artificiellement verts.
- [ ] Autorisations : membres actifs, affectations boutiques et droits module ; chaque approbateur Finance a les permissions `FINANCE_RECEIVABLES` et `FINANCE_PAYMENTS` nécessaires. Préparateur d'un remboursement **CASH** : session de caisse `OPEN` **à son nom** sur le compte de A, selon le moteur canonique des paiements ; si cette organisation ne peut fournir ce rôle, **KO bloquant d'onboarding**, pas de contournement automatique.
- [ ] Liquidateur : vérification renforcée par mot de passe et code TOTP/récupération si MFA actif, avant toute liquidation de remboursement. Rejouer d'abord la requête sans cette vérification : réponse `428 STEP_UP_REQUIRED`, aucune écriture ni mouvement ; vérifier la journalisation du refus.
- [ ] Sauvegarde du tenant de recette, capacité de restauration sur un tenant isolé, imprimantes A4 et 80 mm, Android, tablette et poste de bureau, capture des logs et relevés avant/après. Aucun test de restauration sur Neon production.

## 1. Exécutions essentielles, preuves attendues

| ID | Acteur, action et condition | Preuve/état attendu | Résultat |
| --- | --- | --- | --- |
| E01 | Propriétaire : ouvrir A et B, filtrer les indicateurs et l'inventaire | Les deux sites sont visibles, filtres A/B et consolidation sans mélange des monnaies | NON EXÉCUTÉ |
| E02 | Facturier A : ouvrir le catalogue, préparer facture de 2 unités et un service, soumettre au validateur Finance | Facture unique `DRAFT → PENDING_APPROVAL → ISSUED`, aucune sortie avant règlement | NON EXÉCUTÉ |
| E03 | Caissier A1 : enregistrer puis faire confirmer/affecter un paiement partiel sur le compte A | Solde Finance exact, aucune sortie de stock `SALE_FULFILLMENT` | NON EXÉCUTÉ |
| E04 | Caissier A1 : affecter le solde final ; vérifier stock et comptabilité | Une seule sortie par ligne et emplacement ; `stockPostedAt` unique ; `ISSUE/POSTED` avec coût issu d'une couche réelle, journal équilibré | NON EXÉCUTÉ |
| E05 | Rejouer la même clé et déclencher deux règlements concurrents du solde ; reprendre sur réseau faible | Pas de double écriture, de deuxième sortie ou de dépassement de créance | NON EXÉCUTÉ |
| E06 | Caissier B : essayer par URL directe facture A, encaissement A, lot A et compte A | Réponse d'accès refusé/404, aucune fuite dans les listes, compteurs ou rapports ; propriétaire conserve A+B | NON EXÉCUTÉ |
| E07 | Révoquer l'affectation de A ; l'ancien facturier et caissier tentent des relectures et mutations | Refus immédiat même sur anciennes URL et clés d'idempotence | NON EXÉCUTÉ |
| E08 | Avec 1 unité disponible, tenter deux factures réservant la même unité puis transfert/POS | Une seule promesse valide, stock non négatif ; annulation d'une facture `DRAFT` libère le disponible | NON EXÉCUTÉ |
| E09 | Lot expiré ou coût d'inventaire absent à l'instant du paiement final | Allocation finale annulée, pas de sortie ni d'événement de coût incomplet ; message contextualisé | NON EXÉCUTÉ |
| E10 | A : demander retour partiel de 1 unité `RESTOCK`, autre acteur inspecte et valide, préparateur Finance crée un avoir et un paiement par compte d'origine, approbateur approuve **chaque paiement** et l'avoir, liquidateur termine | `SUBMITTED → INSPECTED → APPROVED → FINANCE_PENDING → COMPLETED` ; avoir `POSTED`, remboursements `CONFIRMED`, allocations/écritures inversées par compte, `RETURN_IN` au coût d'origine **une seule fois**, audit complet | NON EXÉCUTÉ |
| E11 | Deuxième retour partiel sur la même facture devenue `CREDIT_NOTE` ; puis tenter quantité supplémentaire | Reliquat HT/taxe au centime exact, deuxième remboursement tracé ; dépassement et auto-validation refusés | NON EXÉCUTÉ |
| E12 | Demander retour `QUARANTINE` et `DISPOSE` | Aucun stock vendable réintégré, sort physique et justification traçables ; rapprochement inventaire à valider | NON EXÉCUTÉ |
| E13 | Facture A encaissée sur deux comptes A distincts, puis retour couvrant les deux encaissements ; tenter aussi un compte B, une méthode divergente sur un même compte et une liquidation avant approbation de tous les paiements | Deux paiements sortants du bon compte A, montants exacts et un avoir unique ; aucune liquidation partielle, refus inter-boutiques et sans toutes les approbations | NON EXÉCUTÉ |
| E14 | Ouvrir/clôturer les caisses A1, A2 et B ; espèces, Mobile Money, rapprochement et écart motivé | Une session par acteur, totaux et statuts du bon site, validateur indépendant et historique non altérable | NON EXÉCUTÉ |
| E15 | Transfert A vers B en transit puis réception, avec lot/FEFO et pertes | Source débitée une fois, destination créditée une fois, pas de double stock ni perte de lot | NON EXÉCUTÉ |
| E16 | Contrôler le rapport pour A, B et ensemble, puis exporter PDF/XLSX | CA, remboursements, COGS **issus des écritures postées**, dépenses, marges et bénéfices justifiables, filtre de site/devise et aucune ligne d'une autre boutique | NON EXÉCUTÉ |
| E17 | Imprimer `ISSUED`, `PAID`, annulée, avoir depuis Android/PC sur A4 et imprimante 80 mm | Lisibilité, boutique source, monnaies, lignes/taxes/solde, statut et confidentialité B | NON EXÉCUTÉ |
| E18 | Tester FR/EN, thème clair/sombre, 320/390/768/1024/1440, clavier mobile, perte/reprise réseau | Navigation sans débordement ni double action, messages précis et traduction cohérente | NON EXÉCUTÉ |
| E19 | Restaurer une sauvegarde datée sur une **base distincte de production**, puis rapprocher factures/caisse/stock/audit | RPO/RTO observés, inventaires et journaux identiques au point de restauration, comptes et permissions cohérents | NON EXÉCUTÉ |

## 2. Règles de décision et limites connues

- Si E04 ne trouve pas une couche de coût ou une période comptable valide, **arrêter le circuit** et corriger la configuration. Il est interdit de fabriquer une valorisation de retour sur une ancienne sortie non valorisée (`RETAIL_ORIGINAL_ISSUE_VALUATION_REQUIRED`).
- **Candidat tranche 48, non certifié :** le code prépare un paiement par compte financier d'origine, avec avoir unique et liquidation atomique ; les anciens retours à un seul paiement restent compatibles. Le scénario multi-comptes doit impérativement réussir le vrai E2E PostgreSQL puis E13 propriétaire avant de considérer la limitation levée. Un même compte utilisé avec des méthodes d'encaissement incompatibles reste refusé explicitement, sans réaffectation implicite.
- Le circuit actuel sépare cinq acteurs pour le retour. Vérifier que l'organisation cliente peut réellement les affecter ; une désignation par le seul nom du rôle de gérant ne vaut pas permission.
- La vue `retail/site-overview` est encore `OWNER_ONLY_OPERATIONAL` et annonce `financeMarginCertified: false`. E16 **ne peut pas être marqué BON** au seul motif que les totaux opérationnels s'affichent ; rapprocher les écritures de COGS, crédits et dépenses et exiger les exports demandés.
- En cas de blocage, conserver le SHA, le tenant de recette, le rôle, le site, l'action, le message et l'horodatage ; ouvrir le correctif sur la même PR, refaire la CI et **recommencer les contre-épreuves touchées**.

## 3. Signature OWNER_E2E — à compléter par le propriétaire

| Critère du chapitre XVI | État BON/KO | Preuve (capture, référence, journal, document) | Observation du propriétaire |
| --- | --- | --- | --- |
| 01 — A+B sur une plateforme | À VALIDER | — | — |
| 02 — Stocks indépendants | À VALIDER | — | — |
| 03 — Autorisations par rôle | À VALIDER | — | — |
| 04 — Entrées et sorties correctes | À VALIDER | — | — |
| 05 — Transferts corrects | À VALIDER | — | — |
| 06 — Factures créées et imprimées | À VALIDER | — | — |
| 07 — Circuit facturier/caissier | À VALIDER | — | — |
| 08 — Encaissements enregistrés | À VALIDER | — | — |
| 09 — Clôtures journalières | À VALIDER | — | — |
| 10 — Rapports cohérents | À VALIDER | — | — |
| 11 — Données protégées | À VALIDER | — | — |
| 12 — Restauration de sauvegarde | À VALIDER | — | — |

**OWNER_E2E global :** NON EXÉCUTÉ. **Date :** —. **Version/SHA :** —. **Signataire :** Dr Jonathan NTUMBA. **Décision de fusion :** NON AUTORISÉE tant que les douze critères, les blocages techniques et les validations de ce document ne sont pas clôturés.
