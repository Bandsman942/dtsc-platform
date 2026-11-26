# Cahier des charges — DTSC Data Intelligence & Consistency 2.0 (#1228)
Statut : cadrage de hotfix, implémentation et validation non certifiées. Référence normative : [Design 2.0](DTSC_FRONTEND_DESIGN_SYSTEM.md). Baseline main : 6aa0e7b4ead0f6dac1212fc6a78caa38a5effc32. Issue : #1228. Livraison : High, milestone Stabilisation des modules ERP ; branche fix/1228-data-intelligence-consistency. Aucun déploiement de branche.
## Objectif et symptômes
Stock, Valorisation et rapport journalier de stock de Clôture magasin afficheraient trois décimales même pour des unités entières ; les tableaux n'offrent pas uniformément de sous-totaux filtrés ; ST-MWW9CKWQ-A56124 du 25 novembre 2026 (capture utilisateur) affiche « Sortie de stock — article [ID interne] », débit 601 et crédit 311 pour 125,20. Le nom réel, devise, quantité et méthode de valorisation de cette écriture ne sont pas déduits de la capture. Causes racines à confirmer dans le dépôt. Ne pas traiter une anomalie d'imputation comme un simple problème de texte.
## Lot 1 — Audit et architecture
Inventorier routes, services, schémas, sources de vérité, composants, rapports, exports, tests, filtres, pagination, accès, entitlements et i18n de chaque surface ; identifier .toFixed(3), formats forcés, échelles Decimal/SQL, références article au lieu de noms, agrégations page-only et erreurs de double comptage. Pour chaque anomalie : fichier/ligne, cause vérifiée, risque, correction, QA. Vérifier conflits avec travaux en cours, PR #1227 et baseline main. Lire les contrats spécialisés, notamment ERP_INVENTORY_ACCOUNTING et posting. Vérifier les imputations SYSCOHADA (dont 601/311 et variation de stocks) sur sources comptables autorisées et méthode effective ; documenter conclusion par événement (réception, vente, retour, ajustement, transfert, perte). Aucune règle de compte imposée sans preuve.
## Lot 2 — Quantités et précision
Réutiliser l'unité catalogue canonique (nom, symbole, précision, conversions), unités achat/vente/stock. Centraliser validation/formatage et conversion exacte ; éviter source parallèle et hardcodes. Saisie entière ou fraction autorisée, contrôles front et back, messages FR/EN explicites. Cas 0, 1, 2, 3 décimales et autres configurations permises, zéro, valeurs limites, retours signés, lots, transferts, unités différentes, conversions exactes/incompatibles. Préserver précision Decimal des coûts unitaires, taux, montants et calculs. Gérer unités historiques/archivées, quantités incompatibles et configurations changées par signalement et trace, jamais arrondi ou réécriture silencieux. Déployer d'abord Stock, Valorisation, Clôture magasin puis surfaces catalogue et autres ERP.
## Lot 3 — Agrégations serveur
Service ou contrats communs à réutiliser : filtres normalisés, portée RBAC/tenant/boutique, pagination/tri indépendants du sous-total, liste et KPI cohérents. Somme, moyenne pertinente, moyenne pondérée, min/max, comptage/distinct, regroupement, ratios calculés sur agrégats ; ne pas sommer taux/prix ou snapshots de stocks/soldes. Total filtré toutes pages, total général du périmètre autorisé, total page lorsque utile. Quantités par unité/produit compatibles, monnaies séparées ou conversion historique traçable. Stocks et soldes à date, flux sur période, ouverture/clôture. Éviter doublons sectoriels, références invalides, valeurs nulles assimilées à zéro et fuites d'agrégats. Index/EXPLAIN si nécessaire, bornage, tests volumineux et simultanéité.
## Lot 4 — Design 2.0
Réutiliser workspace/list/table, filtres calendrier date exacte/plage, rail statuts, recherche métier, tri stable, pagination et réinitialisation. KPI réactifs à périmètre clairement défini, pieds de tableau sous-total filtré, page et général distincts, nombre de résultats, regroupements unité/devise. Menus colonne (tri, filtre, somme/moyenne/min/max/compte, regroupement, masquer si pertinent), préférences utilisateur, accès clavier et retour au contexte. États chargement/vide/erreur, toasts, aide, unités/symboles/codes devise. Mobile 320–1440 px, clair/sombre FR/EN, focus, scroll local, pas de données tronquées ou actions placeholders.
## Lot 5 — Libellés et intégrité comptable
Génération commune des libellés de posting : opération, noms produits/services, références commerciales, tiers, factures, paiements, boutique/entrepôt, compte, collaborateur lorsque autorisé. Snapshot au posting ; identifiants techniques protégés dans métadonnées audit. Pour écritures POSTED existantes, enrichissement de lecture fiable, ne pas réécrire le journal, ne pas inventer de nom si référence manquante ; distinguer nom actuel du snapshot. Cohérence journal, grand livre, détail, recherche, exports, navigation vers source autorisée. Contrôler toutes sources (achats, ventes, paiements, stock, ajustements, transferts, dépenses, paie et autres). Vérifier imputation selon lot 1 ; correction de nouvelles règles versionnée, correction de POSTED uniquement par contrepassation liée et nouveau posting via workflow autorisé, sans écriture automatique rétroactive. Équilibre, idempotence, période et audit intacts.
## Lot 6 — Rapports et exports
Même filtre, précision, libellé, agrégat et devise dans UI/PDF/XLSX/CSV. Métadonnées : entreprise, période, filtres, date génération, unités, référence devise ; branding et pagination PDF ; cellules numériques et formules pertinentes XLSX ; CSV stable et protégé contre injection, précision conservée. Imports/templates seulement là où pertinents et existants ; contrôles serveur, exports volumineux et autorisations. Tester concordance sur jeux filtrés multi-pages.
## Matrice minimale des domaines
| Domaine | Agrégats principaux |
|---|---|
| Stock / inventaires | entrée/sortie, ouverture et clôture, quantité par unité |
| Valorisation | valeur à date, coûts de sorties, ajustements, coût pondéré |
| Clôture magasin | stock à date, flux journaliers, cash/float et écarts |
| POS / ventes | quantités compatibles, ventes, remises, taxes, marge recalculée |
| Achats | quantités, coûts, taxes et frais |
| Factures clients/fournisseurs | facturé, payé, dû |
| Créances/dettes | ouverts, échus, recouvrés/réglés sans double compte |
| Trésorerie/caisse | entrées/sorties, soldes à date, écarts |
| Comptabilité | débits/crédits, solde à date, sources POSTED |
| Budgets/dépenses | prévisions, engagements, réalisations, états |
| Mobile Money / Telco | dépôts/retraits, commissions, float et recharges |
| RH/paie | salaires, primes, retenues, net ; droits RH |
| Projets / temps | budget, dépenses, durées compatibles |
| Actifs | acquisition, amortissement, VNC |
| Santé / pharmacie | facturation, stock, dispensation ; confidentialité clinique |
| Rapports consolidés / autres tableaux chiffrés | métriques typées, pas de double comptage |
Inventaire exhaustif des surfaces réelles à compléter pendant lot 1. Chaque surface marquée corrigée, déjà conforme (preuve) ou non applicable (motif). Pas de module fantôme ni nouveau droit implicite.
## Lot 7 — QA et recette OWNER_E2E

Les étapes de validation sur l’application et le jeu de préparation sont dans la [recette propriétaire #1228](OWNER_E2E_1228_DATA_INTELLIGENCE_CONSISTENCY.md).

| ID | Scénario / attendu | Preuve initiale |
|---|---|---|
| Q01 | Créer unités 0/1/2/3 décimales ; les trois écrans prioritaires et exports suivent le catalogue | NOT_EXECUTED |
| Q02 | Saisie incompatible refusée front/API ; conversion exacte et historique incompatible signalé | NOT_EXECUTED |
| Q03 | Quantités, montants, coût moyen et taux conservent leurs précisions distinctes ; CDF/USD corrects | NOT_EXECUTED |
| A01 | Filtrer date exacte/plage, statut, recherche, boutique ; sous-total et KPI changent | NOT_EXECUTED |
| A02 | 51+ lignes sur plusieurs pages ; total filtré invariant au changement de page, total page distinct | NOT_EXECUTED |
| A03 | Unités incompatibles, multi-devise, taux historiques, coûts pondérés, ratios, distinct et min/max | NOT_EXECUTED |
| A04 | Plusieurs journées : stock/solde à date, pas de somme de snapshots ; retours/annulations et doublons | NOT_EXECUTED |
| A05 | Aucun résultat, zéro/null, requêtes concurrentes et grand volume, absence de N+1 | NOT_EXECUTED |
| L01 | Nouvelle sortie de stock et autres postings affichent désignation réelle et référence | NOT_EXECUTED |
| L02 | Renommer/archiver produit après posting ; snapshot stable, historique enrichi fiable ou signalé | NOT_EXECUTED |
| L03 | Vérifier comptes selon référentiel, débits=crédits, idempotence, périodes et absence de mutation POSTED | NOT_EXECUTED |
| L04 | Liens sources et audit, pas de divulgation RH/clinique/tiers sans permission | NOT_EXECUTED |
| X01 | PDF/XLSX/CSV concordent avec filtres, sous-totaux, libellés, unités, devises ; XLSX numérique | NOT_EXECUTED |
| S01 | Deux tenants, deux boutiques, plusieurs rôles ; accès direct API/exports et agrégats refusés hors périmètre | NOT_EXECUTED |
| U01 | FR/EN, clair/sombre, mobile/tablette/desktop, zoom/clavier, menus et toasts | NOT_EXECUTED |
| R01 | Régression POS, ERP commun, Health/Pharmacy et autres secteurs ; pas de double posting | NOT_EXECUTED |
| R02 | Gates : diff, Prisma, migrations si concernées, type-check, QA ciblée, régression, lint, build | NOT_EXECUTED |
| R03 | Revue finale et recette propriétaire du SHA exact ; pas de déploiement de branche | NOT_EXECUTED |
## Livraison et rollback
Réutiliser services et contrats existants, pas de dépendance ni migration sans nécessité. Migrations additives seulement ; pas de backfill POSTED. Toute intervention sur données historiques distincte, bornée, dry-run et autorisée selon AGENTS. Revert applicatif par PR, compatibilité schéma conservée. Pas de changement de secrets prévu. Tenir changelog, documentation technique/domaine, matrice preuves et runbook E2E. Issue et PR non clôturées tant que scope incomplet ; CI réelle + OWNER_E2E soumis à validation explicite avant merge main et unique production. Aucune preview ni vercel --prod manuel.

### Navigation clavier des indicateurs

Le rail partagé `ModuleMetrics` prend en charge les flèches gauche/droite, Début et Fin lorsqu’il a le focus et déborde. Les commandes des contrôles enfants conservent leur comportement. La recette Shop 2 vérifie l’accès au dernier indicateur, le retour au premier et l’absence de débordement de page. Le composant isolé a passé ces vérifications dans Chromium aux huit largeurs de référence, avec un contrôle enfant conservant la navigation du curseur. Les contrôles statiques responsive et expérience standard ont également réussi. La recette intégrée sur le nouveau commit reste à exécuter.

### Quantités dans les achats et réceptions

La création et l’édition d’achats, les réceptions et les allocations par lot suivent la précision de l’unité catalogue. Les API acceptent les quantités décimales en texte ainsi que les nombres existants et gardent la limite d’un million par saisie. Le détail calcule le reliquat exact à partir des réceptions du document et indique les lignes dont l’unité de commande diffère du catalogue, manque ou ne décrit plus la quantité. Le moteur partagé de réception revalide ces règles avant de créer un mouvement ou d’accepter une prestation. Une réception déjà intégrée conserve son circuit idempotent. L’aperçu A4 reprend les quantités exactes et les réceptions cumulées.

La QA ciblée exécute le moteur de réception avec les sept précisions, des lots à la micro-unité, une prestation, une unité historique absente ou modifiée et un replay après changement. Un cas navigateur est ajouté pour la création d’un achat, le refus d’une réception si l’unité du catalogue a changé, deux réceptions fractionnées, le reliquat exact et l’aperçu A4. Les conversions avec facteur historique restent ouvertes.

Les deux scénarios navigateur ciblés, achat/réception et rail Stock, ont réussi sur le build local avec PostgreSQL et Redis isolés. Le second a produit 32 captures pour les huit largeurs, deux langues et deux thèmes.

### Transferts avec conversion versionnée

Le transfert accepte une quantité saisie dans une unité alternative configurée pour l’article. La liste des unités suit le périmètre de l’entrepôt source et affiche les versions courantes compatibles avec le catalogue. La création vérifie la version choisie et calcule la quantité de stock au serveur. La ligne conserve la quantité saisie, le facteur, la version, l’unité de stock et la quantité exacte calculée. Le détail, la décision du validateur, la réception et les exports affichent cette preuve.

L’expédition et la réception utilisent la quantité de stock enregistrée. Une version ultérieure du facteur ne change pas le transfert. Si l’unité cible, son code ou sa précision a changé, l’opération échoue avant tout mouvement. Les documents enregistrés avant cette migration restent lisibles et utilisent la quantité de stock stockée. La migration ajoute une colonne JSON nullable, sans reprise de données. Un retour à la version applicative précédente conserve cette preuve.

PostgreSQL vérifie le stockage de la conversion, le changement de facteur, le refus d’une version périmée ou d’une unité cible modifiée et l’isolation entre entreprises. La recette locale Chromium a vérifié la création depuis le formulaire, l’expédition par un autre acteur, le refus de réception après changement de l’unité cible, la réception avec le facteur figé après révision du catalogue et le refus d’une seconde réception.

### Historique de trésorerie

Les sous-totaux distinguent les flux entrants et sortants par devise et statut du mouvement. L’historique, le comptage, le calcul filtré toutes pages et le général autorisé partagent le même instantané PostgreSQL. Chaque côté d’un transfert reste attribué à son compte. La page affichée possède ses propres sous-totaux. Les filtres de statut et de devise utilisent les références et traductions existantes. Les exports reprennent les deux synthèses serveur, avec le sens et le libellé du mouvement. Les grands montants et fractions sont formatés à partir de leur chaîne décimale dans les synthèses.

La fixture PostgreSQL exécute l’API Trésorerie avec 56 mouvements dans les résultats filtrés, un mouvement contrepassé et un mouvement d’une autre organisation. Elle vérifie le montant exact toutes pages, le sous-total de la dernière page, les devises, les statuts et la suppression des données de test par rollback. La suite locale #1228 vérifie en plus les références de transfert et la conservation d’un total de 21 chiffres dans les synthèses d’export.

### Saisie des opérations de stock

Les formulaires de transfert, de comptage et d’ajustement utilisent la précision de l’article sélectionné. Le comptage conserve la valeur zéro. Les API de stock revalident la quantité selon l’unité effective et retournent des messages FR/EN. Les détails conservent les fractions historiques affichées. Le test navigateur couvre l’activation du champ à la sélection de l’article, le refus des sept décimales et l’acceptation de la micro-unité et du zéro selon le formulaire. Le calcul de conversion vérifie aussi le produit décimal avant de juger la précision cible, même avec un facteur très précis.

### Registre de paie

Le registre calcule le brut, les primes, les retenues et le net par devise et statut dans le même instantané que la liste. Les compteurs approuvés et en attente suivent le filtre courant. Les totaux toutes pages, généraux autorisés et de page suivent les droits du gestionnaire, du préparateur ou du validateur désigné. Le profil en lecture personnelle ne reçoit aucun agrégat du registre. Les exports reprennent les totaux filtrés et généraux, avec les libellés de statut FR/EN.

La fixture PostgreSQL contrôle 56 exécutions filtrées, les quatre montants exacts, la seconde page, un préparateur hors périmètre, un statut annulé en USD et le profil en lecture personnelle.

### Registre Caisse et recherche dans le grand livre

Caisse. Le registre compte les sessions ouvertes et à valider sur le résultat filtré complet. Les compteurs et les montants distinguent le général autorisé, le résultat filtré et la page affichée. La sélection des boutiques, les agrégats et les lignes sont lus dans la même transaction. Le filtre de date s’applique à l’ouverture de session et les flux représentent les mouvements rattachés à ces sessions. Les manquants et excédents constatés des clôtures validées sont séparés par devise. Ces écarts de comptage et les soldes d’ouverture et de clôture conservent leur sens historique. La projection indique une preuve de mouvement incohérente si la devise ou le sens empêche de calculer le montant théorique exact.

Le registre et l’export partagent les filtres par référence, compte, statut et dates. Le CSV, Excel et PDF reprennent la devise, les flux, les soldes de la session et les écarts. La fixture PostgreSQL teste 56 sessions filtrées, trois pages, deux devises, un magasin hors périmètre et une autre organisation.

Le parcours Chromium local a vérifié l’authentification, la clôture en français avec validateur désigné, la file de validations en anglais et la stabilité du total de 102 sessions filtrées sur cinq pages. Les trois exports téléchargés depuis la deuxième page reprennent les valeurs exactes du registre. Le test contrôle les 102 lignes CSV, les cellules texte et numériques du classeur et les montants détaillés et de synthèse du PDF. Le rendu PDF partagé ajuste le corps des nombres qui tiennent dans la colonne et répartit les autres cellules sur plusieurs lignes, avec répétition de l’en-tête lors d’un saut de page.

Grand livre. La recherche canonique retrouve les désignations et codes actuels pour les formes historiques exactes générées par le moteur de stock. Le journal conserve son libellé d’origine. Le rendu indique l’origine de la désignation et signale la référence manquante. Les rédactions libres et les snapshots restent recherchables par leur texte enregistré. La sélection avant pagination alimente aussi le nombre de lignes et les totaux de débit/crédit en devise fonctionnelle. La fixture PostgreSQL vérifie cette concordance sur deux pages, les dimensions, les écritures contrepassées, les brouillons, une référence d’un autre tenant et les caractères littéraux de recherche.

Le grand livre, la balance et le détail des lignes comptables affichent les fractions conservées par le serveur dans la devise fonctionnelle. La présentation reprend le même format décimal exact que les agrégats.

### Préparation SYSCOHADA après validation propriétaire

La validation du SYSCOHADA permet de poursuivre l’implémentation. L’édition signée est vérifiée et fingerprintée. Dans Comptabilité → Configurer → Mise en service, la comparaison en lecture seule couvre le candidat marchandises. Elle présente le compte proposé, les codes déjà utilisés et le nombre d’écritures comptabilisées ou contrepassées dans l’entreprise. La migration et le posting sous la nouvelle politique exigent le dataset complet, les contrôles réglementaires et les rapprochements par type de mouvement. [Audit et source officielle](AUDIT_1228_SYSCOHADA_INVENTORY.md).

### Historique Télécom

L’historique lit les opérations, leurs totaux et le périmètre boutique dans le même instantané. Le compte d’encaissement rattache l’opération à la boutique, et le numéro de téléphone retourné reste masqué. Le registre et les exports distinguent ventes, coûts opérateur et marges par devise d’origine et statut. Les montants d’opérations échouées ou contrepassées sont identifiés par leur statut. Le calcul de la page et la projection des pièces conservent les décimales d’origine. La fixture PostgreSQL exerce 57 opérations filtrées sur trois pages, avec plusieurs devises, un statut contrepassé et des opérations hors boutique et hors entreprise.

Dans Chromium, le parcours d’intégration Mobile Money, change et Télécom confirme le posting unique et le rollback en période fermée. Le scénario complémentaire filtre 35 recharges, change de page, vérifie la stabilité du montant exact et télécharge les 35 lignes avec téléphones masqués.

### Sources vérifiées pour les agrégations restantes

| Surface | Source actuelle | Vérification encore nécessaire |
|---|---|---|
| Caisse | `cash-sessions` aligne les compteurs, flux et écarts constatés sur le registre autorisé | Définir le calcul des soldes d’ouverture et de clôture à date pour la consolidation |
| Budgets | `budgets` utilise `getBudgetPosition` pour les versions de budget de la page, à partir des lignes et engagements | Séparer versions et scénarios avant toute somme, puis utiliser les mêmes prévisions, engagements et réalisations pour le registre et l’export |
| Dépenses | `expenses` lit et agrège le registre dédié par devise et statut, sous le même filtre de visibilité. Le registre et les exports reprennent ces agrégats | Certifier les parcours navigateur FR/EN et les relations avec les positions budgétaires versionnées |
| Télécom | Le registre applique le périmètre boutique du compte d’encaissement et calcule les montants par devise et statut | Rapprocher le solde de float à date avec les transactions canoniques |
| Mobile Money | Le registre direct vérifie le droit de l’organisation et masque les numéros | Aligner les flux et commissions sur le périmètre du compte de caisse et rapprocher le float à date. Préserver le circuit distinct de change |
| Paie | `payroll-runs` aligne compteurs et agrégats de brut, primes, retenues et net sur le registre autorisé | Certifier le rendu et les exports du parcours navigateur FR/EN |
| Projets | `projects` calcule les compteurs et le budget indicatif par devise et statut pour le résultat filtré, le général autorisé et la page. Le progrès de chaque projet utilise ses livrables acceptés | Certifier les parcours navigateur FR/EN. Les engagements et dépenses sourcés en Finance et les temps validés restent à rapprocher |
| Actifs | `assets` fournit le registre opérationnel et `assets/[assetId]/accounting-profile` la fiche comptable | Raccorder acquisition, amortissement et valeur nette aux comptes autorisés, avec période et devise explicites |
| Santé et Pharmacie | `healthcare/medical-billing` lit les factures sectorielles. `pharmacy/reports` utilise `getPharmacyReportsDataset` pour les rapports filtrés | Vérifier les correspondances avec les pièces financières communes et conserver les protections des données cliniques et personnelles |

Le portefeuille Projets lit ses lignes, compteurs, risques, budgets indicatifs et avancement dans un même instantané. Une échéance devient en retard à partir du jour suivant, dans le fuseau de l’organisation. Les budgets indicatifs sans devise vérifiable restent visibles sur la fiche et sont exclus des sommes. La colonne d’export conserve la valeur décimale et laisse les valeurs absentes vides. Le registre et l’export reprennent les budgets filtrés et généraux du serveur. La fixture PostgreSQL couvre 56 projets filtrés, deux devises, trois périmètres, une échéance du jour, les risques ouverts, une archive et deux tenants.

## Journal d'implémentation — tranche initiale
Inspection statique de main (aucun test exécuté) :
- `prisma/enterprise-master-data.prisma` : EnterpriseUnitOfMeasure.decimalScale est le référentiel existant, validation 0–6 dans master-data/schemas.ts.
- API inventory-valuation (ligne 172 baseline) : quantité toFixed(3) ; pas de select unité ni d'agrégats filtrés ; garde d'isolation Retail préservée.
- API retail/daily-close/stock-report (121–124 baseline) : 7 quantités forcées à 3 ; catalogue sélectionne uniquement code/nom ; Excel réutilise les strings ; groupBy borné aux articles de page en JSON.
- Workspace inventory-operations (107,405,437 baseline) : format numérique commun sans decimalScale malgré unité chargée dans API inventory. Vérifier aussi export de liste et détails des mouvements.
- Correction initiale : helper exact de présentation des Decimal, lecture unité existante dans les deux API, métadonnées de précision et valeurs non arrondies lorsque incompatibles. Adapter les consommateurs et afficher les alertes dans les interfaces et exports reste obligatoire. QA #1221 étendue sans neutraliser les assertions précédentes (attendus modifiés selon nouvelle configuration). Aucune migration ni mutation.
- Restant : UI Stock et Valorisation et rapport, formats XLSX, agrégats complets, libellés posting, audit SYSCOHADA, tous autres lots et certifications. Aucun E2E final à ce stade. Ne pas fusionner cette tranche isolée.

### Tranche suivante — 25 novembre 2026
- Valorisation : agrégat filtré par devise avant pagination, même WHERE, transaction RepeatableRead pour lignes/comptage/agrégat ; KPI par devise. Aucune somme de quantités hétérogènes.
- Stock : affichage catalogue sur liste et détail de solde, signalement de précision incompatible ; autres opérations à raccorder.
- Clôture : unité et alerte visibles ; export XLSX numérique si compatible avec la limite Excel de 15 chiffres, sinon conservation exacte en texte. CSV/print désignation et unité.
- Gouvernance PR : premier run Quality gates #45651800939 échoué sur liaison issue et labels ; métadonnées corrigées. Les tests métier de ce run étaient skipped. Aucun E2E final.

- Nouveau constat : le builder canonique `buildInventoryAccountingPosting` utilisait `${kind} ${event.inventoryItemId}` sur les deux lignes, et le dictionnaire traduisait l'ID littéralement. Désignation catalogue tenant-scoped désormais sélectionnée via le mouvement et enregistrée dans les nouveaux libellés ; aucune modification des mappings, montants, ni journaux existants. Test fournisseur étendu. Anciennes écritures encore à enrichir en lecture.
- SemVer : correctif candidat 1.24.5 (base 1.24.4), suite à échec de validate-semver sur run 45661092070. Métadonnées PR et Conventional Commits validés par ce run, QA et E2E skipped.
- Le schéma physique `EnterpriseStockMovement.quantity` et `balanceAfter` est Decimal(18,3), alors que le référentiel autorise 0–6 : audit des modèles, contraintes et conversions avant évolution additive nécessaire ; ne pas prétendre avoir corrigé la précision de stockage.

- Historique : enrichissement de lecture du grand livre et de la traçabilité d'écriture pour cinq formes exactes de libellés stock générés par le moteur. Recherche groupée des articles du tenant à partir des lignes déjà autorisées ; champ displayDescription distinct du libellé original, mention « désignation actuelle » ou article introuvable. Raccordement du tableau détail, grand livre et colonne export du workspace comptable canonique. Recherche sur désignation historique, autres sources et exports non canoniques restent à auditer.
- Imputation vérifiée dans le code : le template OHADA_SYSCOHADA@0.1.0 mappe COST_OF_SALES vers 601 et INVENTORY vers 311. Le builder utilise les clés sémantiques. Aucune modification comptable engagée sans audit du référentiel applicable et procédure versionnée.

- Clôture magasin : agrégat serveur SQL par unité canonique, sur toutes pages, site et date filtrés, réutilisant les critères métier du rapport ; mouvements et réservations agrégés séparément avant jointure. Pied de tableau et sorties CSV/XLSX/print raccordés. Mock #1221 étendu ; la preuve PostgreSQL et la concordance des filtres restent à certifier. Pas de somme entre unités différentes.

- Finance opérationnelle : premières agrégations filtrées Créances/Dettes/Paiements, mêmes where que listes et compteurs, groupements par devise (et direction/statut pour paiements), lecture RepeatableRead, métriques globales conservées. Composant de sous-totaux réutilisable et export des KPI du serveur ; filtre ancienneté ajouté à l'export. Annulation de requêtes obsolètes du hook. Les autres vues (factures/avoirs, achats/ventes, etc.) restent à raccorder et les assertions métier à certifier.

- CI 45662049045 : gouvernance et migration réussies ; type-check échoué sur inférence Prisma groupBy dans transaction tableau (Créances/Paiements), gate #670 échouée sur fallback USD réintroduit dans libellé valorisation. Correction : transaction interactive avec Promise.all (pattern existant Dettes), devise réelle uniquement. Aucun test neutralisé. Nouvelle CI nécessaire.

- Stock physique : sous-total serveur groupé par unité catalogue, même périmètre dépôt/site/recherche et seuil faible, avant pagination. Valeurs exactes additives pour les lignes (compatibilité numérique maintenue), affichage sans conversion Number sur les chaînes décimales. Sous-total vendable/réservé non déduit artificiellement du stock physique : il nécessite la consolidation FEFO et retenues sur toutes pages, reste ouvert. Protection des réponses obsolètes dans useProfessionalCollection. QA à certifier.

- Preuves navigateur/PostgreSQL ajoutées aux scénarios existants Shop2 : snapshot de désignation dans deux écritures de sortie FEFO, sous-total physique identique sur page vide au-delà de la pagination, exactitude de la quantité et exclusion du stock 90 d'une boutique interdite (seules 3 unités autorisées). Tests non exécutés sur ce SHA lors de l'écriture.

- CI SHA 43e0bd78 : Quality type-check et Migration réussis ; Shop 2 global readiness, behavioral gates, Accounting onboarding et ERP approval assignment réussis. Régression bloquée par import du formateur de quantité dans le VM selector #1212. Le test charge désormais le helper réel, sans supprimer d'assertion.
- Factures clients/fournisseurs et avoirs : sous-totaux par statut et devise, total pièce, taxes, et pour factures réglé/crédité/restant dû. Même WHERE avant pagination dans transaction RepeatableRead ; composant et exports réutilisent ces agrégats. Avoirs clients : alignement du périmètre RETAIL sur la facture source, y compris accès direct recordId. Export : montant canonique grandTotal/originalAmount au lieu de champs approximatifs. QA sur ce SHA à exécuter.

- Grand livre : agrégation des débits/crédits par devise fonctionnelle du journal (jamais devise transactionnelle), même filtre Prisma que les lignes, avant pagination, transaction RepeatableRead sur l'API. Tri stable avec id final. UI et export affichent ces sous-totaux ; référence/date/devise du journal dans export au lieu d'ID de ligne. Pas de somme de soldes historiques. À certifier ; balance et journal des écritures restent à auditer.

- Journal des écritures : sous-totaux débit/crédit par statut et devise fonctionnelle avec même filtre que liste et pagination ; requêtes en RepeatableRead, id de tri stable ; les écritures brouillon et comptabilisées restent séparées. Les lectures directes de détail ne fabriquent pas un sous-total. Aucun changement de posting.

- CI SHA a53cbc9d, run 45666438138 : gouvernance, migrations, type-check réussis ; Shop 2 global/behavioral et Accounting onboarding réussis. Régression #1094 : assertion statique attendait ancien chemin de libellé sans displayDescription. Contrat actualisé pour exiger la priorité de l'enrichissement et réutilisation des colonnes dans détail ; trois nouveaux cas comportementaux FR/EN (snapshot, désignation actuelle, indisponible). Assertions historiques conservées.

- Exports analytiques : le PDF partagé limitait les KPI aux quatre premiers et le CSV omettait tous les KPI. Option explicite includeCompleteSummary activée uniquement pour registres avec sous-totaux ; PDF pagine tous les indicateurs et filtres, CSV ajoute la synthèse et conserve la protection formule. Templates plats inchangés. Sous-totaux physiques stock repris ; garde de cohérence entre pages (compte, IDs dupliqués, signature agrégats) refuse une exportation manifestement incohérente. Cette garde n'est pas un snapshot serveur intégral. Test export étendu à 28 indicateurs et contrôle du dernier dans CSV/PDF.

- Moteur stock : calcul exact Decimal de quantité et solde pour tous mouvements communs (au lieu de Number et epsilon), garde anti-arrondi au niveau de la capacité physique actuelle à trois décimales, message FR/EN dans erreurs communes. Métadonnée historique numérique conservée pour compatibilité, balanceAfterExact additive. QA #1042 : refus 0.0001, solde 5−0.123=4.877 exact. Cette protection transitoire n'est pas la migration six décimales ni la validation complète par unité ; ces chantiers restent ouverts.
## Reprise Work — contrôles et migration physique candidate

État repris : `30c65166fbe446dbcae50333449a69d89e5290f0`, PR #1229 toujours DRAFT, même branche. Base réelle main vérifiée : `6aa0e7b4ead0f6dac1212fc6a78caa38a5effc32`.

### Contrôle de la CI du SHA repris

Le [run Quality Gates 45669007897](https://github.com/Bandsman942/dtsc-platform/actions/runs/45669007897) est terminé : Delivery governance, Quality et Migration réussies. Quality comprend notamment type-check, régression, lint et build. Les deux jobs navigateur de ce workflow sont `skipped` : ne pas les compter comme une preuve navigateur ou OWNER_E2E. Cette preuve concerne uniquement le SHA repris, pas les modifications Work suivantes.

Le contrôle de tous les workflows du SHA repris donne 16 réussites et un échec : [Shop 2 behavioral 45669008204](https://github.com/Bandsman942/dtsc-platform/actions/runs/45669008204). Dans `shop2-z-global.spec.mjs`, le test de premier lot attendait deux lignes CSV alors que l’export analytique en fournit neuf (en-tête, donnée, séparateur, entreprise, date, comptage, sous-total et deux filtres). Les huit autres tests du groupe sont passés ; les étapes suivantes du job ont été ignorées après cet échec. L’assertion est actualisée pour conserver les contrôles sur la donnée et vérifier explicitement synthèse, précision d’unité et filtres FR/EN ; le CSV vide reste vérifié. Nouvelle preuve navigateur du correctif requise, aucune assertion désactivée.

### Modifications Work à certifier sur le prochain SHA

- Migration nouvelle de 110 colonnes dans 65 modèles, `(18,3)→(21,6)`, `(14,3)→(17,6)` et consommateurs de quantités `(20,6)→(21,6)` ; capacité entière préservée et contrainte de transfert coordonnée, sans modification de migration historique ni UPDATE métier.
- Validation des mouvements et réservations par unité catalogue effective ; validation des seuils catalogue et quantités d’achat ; garde physique six décimales. Les conversions exactes disposent d’un helper testé, mais pas encore d’un parcours complet avec références et facteurs historiques : ne pas certifier Q02 globalement.
- Soldes, écarts d’inventaire et comparaisons de livraison en Decimal exact ; micro-unités préservées dans la répartition des couches. Réceptions, transferts, retour fournisseur et récupération évitent l’aller-retour interne par Number. Suppression des troncatures trois décimales en achats et production ; les quantités calculées incompatibles sont refusées.
- FEFO, snapshots de réservation, sélection de lots de retour et preuve de transfert admettent six décimales ; sept restent refusées. Les assertions historiques sont conservées et les nouvelles limites positives/négatives sont testées.
- [Audit SYSCOHADA](AUDIT_1228_SYSCOHADA_INVENTORY.md) : source téléchargée et fingerprintée, CUMP distinct de FEFO, anomalie de mapping achat/variation identifiée. Baseline publiée inchangée ; politique versionnée coordonnée et preuve de configuration de la pièce utilisateur encore requises.
- [Runbook de migration et retour arrière](MIGRATION_1228_PHYSICAL_QUANTITIES.md). Aucun lancement en Production.

### Preuves ciblées de la reprise

| Contrôle | Statut | Portée et limite |
|---|---|---|
| Unités 0–6, bornes physiques, conversions exactes/incompatibles, conservation historique, snapshots FEFO, messages FR/EN | LOCAL_EXECUTED | `qa:data-intelligence-1228` ; ne certifie pas les formulaires ni toutes les sources de quantité |
| Promesses stock #1042 | LOCAL_EXECUTED | `qa-hotfix-1042-retail-invoice-stock-holds.mjs`, y compris solde exact à six décimales |
| Libellés #1094 | LOCAL_EXECUTED | `qa-hotfix-1094-accounting-mcp.mjs` ; certification live distante explicitement non exécutée |
| Lots, retours, coûts et transferts #1212 | LOCAL_EXECUTED | `qa:inventory-lot-traceability-1212`, mocks isolés ; ne remplace pas PostgreSQL/HTTP |
| CSV/XLSX/PDF 125 lignes et 28 indicateurs | LOCAL_EXECUTED | `qa-finance-design2-exports.mjs` avec Poppler réel ; round-trip XLSX de micro-unités numériques et quantité limite exacte en texte ajouté, aucune assertion supprimée |
| Régression générale | LOCAL_EXECUTED | Suite package exécutée intégralement sur état intermédiaire ; expansion séquentielle des mêmes commandes à cause de la limite de longueur Windows. CI du prochain SHA requise |
| Prisma generate | LOCAL_EXECUTED | Client 6.19.3 généré depuis le schéma multi-fichier |
| Migration et fixture PostgreSQL du nouveau schéma | NOT_EXECUTED | Contrôle ajouté aux Quality Gates : capacités, round-trip de micro-unités, FK tenant, idempotence et rollback de fixture sur base locale isolée |
| Types et lint locaux | LOCAL_EXECUTED | Types réussis avec mémoire augmentée, lint réussi avec résolution du plugin transitif et avertissements existants. État intermédiaire, CI finale requise |
| Build du nouveau SHA | NOT_EXECUTED | Première tentative bloquée par réseau des polices et accès aux fichiers générés ; relance locale avec accès nécessaire en cours. Aucune réussite présumée |
| Mise à niveau d’une base peuplée, volume/verrous/EXPLAIN | NOT_EXECUTED | À certifier sur copie représentative, selon runbook |
| Navigateur et OWNER_E2E du nouveau SHA | NOT_EXECUTED | Aucune validation manuelle propriétaire inventée |

### Lots toujours ouverts

### Échec PostgreSQL révélé par le premier SHA Work

Le [run Quality Gates 45678238781](https://github.com/Bandsman942/dtsc-platform/actions/runs/45678238781) du SHA `e0d98f946ba4323463967f7d93aa44608e9745cd` applique les migrations avec succès et réussit `qa:data-intelligence-1228`. La fixture PostgreSQL échoue sur le rejet attendu `P2003` : une référence stock→catalogue d’un autre tenant était acceptée par la base. Le schéma Prisma décrivait cette FK composite, mais aucune migration ne l’avait matérialisée. Correctif candidat : **nouvelle** migration `20261125200000_inventory_catalog_tenant_reference`, ajout et validation sans mutation des données. L’assertion négative reste intacte. Nouvelle CI requise ; cet échec n’est pas déclaré résolu avant son résultat.

La migration candidate ne clôture pas tout #1228. Restent notamment validation client selon unité effective et conversions intégrées, historique des changements d’unité, flux sectoriels et formulaires à certifier, consolidation réservée/vendable toutes pages, inventaire exhaustif et agrégats des autres modules ERP, totaux général/page contextualisés, menus analytiques et préférences, libellés de toutes les sources et recherche historique, concordance des exports de chaque module, politique comptable versionnée coordonnée, performances et matrice navigateur/RBAC complète. Le cahier des charges initial et Q01–R03 restent opposables. Aucun E2E final ne peut être annoncé sur cette seule tranche.

### Résultats vérifiés du SHA 825315ef

- [Quality 45678870775](https://github.com/Bandsman942/dtsc-platform/actions/runs/45678870775) : gouvernance et Migration réussies ; fixture PostgreSQL #1228, type-check, régression et itérations 01–07 réussis. Échec restant #1042 : ancien rejet physique de 0.0001 dans les retours. Tests corrigés pour rejeter sept décimales, accepter six et conserver le refus monétaire sous l'unité minimale. La suite de préflight est également actualisée et vérifie une micro-unité exacte. Les deux suites locales réussissent après correction. Le run global n'est pas vert.
- [Shop2 behavioral 45678870852](https://github.com/Bandsman942/dtsc-platform/actions/runs/45678870852) : build, HTTP, POS/relations, expérience Retail et isolation multiboutique réussis ; cycle Finance échoue sur l'ancien rejet fournisseur de 1.0001. Le scénario corrigé rejette 1.0000001 et vérifie que 1.000001 atteint bien le contrôle de pièce fournisseur manquante. Réexécution navigateur nécessaire. Les étapes suivantes sont skipped, sans certification.
- [Accounting onboarding 45678870786](https://github.com/Bandsman942/dtsc-platform/actions/runs/45678870786) : tous les contrôles réussis, dont convergence Finance intermodules, remboursement pharmacie, C5, clôture et protection de l'historique. Cette preuve ne certifie pas la conformité de la politique SYSCOHADA ni l'écriture source ST-MWW9CKWQ-A56124.

### Agrégations commerciales — candidat suivant

Devis, commandes et achats : les requêtes de liste, compte et agrégats partagent le même WHERE avant pagination dans une transaction RepeatableRead ; les sommes Decimal sont groupées par devise et statut (annulés séparés). Les achats conservent exactement leur politique de visibilité restreinte, y compris pour le général sans filtres ; les compteurs deviennent filtrés et les compteurs généraux restent distincts. Tri final stable par ID.

Les interfaces réutilisent les cartes et tokens canoniques : sous-totaux filtrés, comparaison explicite général/page, FR/EN, sans afficher les anciens chiffres comme actuels pendant chargement/échec. Le hook achats ignore les réponses dépassées et annule les requêtes remplacées. Les exports toutes pages contiennent le général autorisé et le filtré ; ils n'y ajoutent pas un sous-total de page arbitraire. La signature de cohérence contrôle également le général entre pages. Cette garde ne remplace pas un snapshot export serveur.

QA comportementale `qa-data-intelligence-commercial-1228.mjs`, incluse dans `qa:data-intelligence-1228` : trois handlers GET réels avec délégué en mémoire, montants 21 chiffres, nul/zéro, devises/statuts, pages 1/2/hors bornes, même filtre liste/compte/agrégat, exclusion tenant et visibilité achats restreinte ; réponses différées et démontage du hook ; contrôles d'export CSV/XLSX/PDF exécutés avec pagination et mutation d'agrégat. Ces mocks ne constituent pas une preuve PostgreSQL, performance ou navigateur. Ces preuves restent requises sur le SHA exact publié.

### CI verte vérifiée sur 41e4a400 (avant agrégats commerciaux)

Les 19 workflows du SHA `41e4a400303ad3eb0b7b630f561652aae8717606` sont terminés avec succès, contrôlés individuellement : [Quality](https://github.com/Bandsman942/dtsc-platform/actions/runs/45681362992), [Shop2 behavioral](https://github.com/Bandsman942/dtsc-platform/actions/runs/45681363329), [Accounting onboarding](https://github.com/Bandsman942/dtsc-platform/actions/runs/45681362558), [liste des contrôles](https://github.com/Bandsman942/dtsc-platform/commit/41e4a400303ad3eb0b7b630f561652aae8717606/checks). Les jobs navigateur secondaires de Quality sont skipped ; les preuves navigateur viennent des workflows dédiés. Aucun OWNER_E2E final, périmètre encore incomplet.

Lot commercial : QA #1228, contrats #1198/#1200, lint des composants modifiés et régression complète exécutés localement avec succès. Vérification globale de types locale encore en cours à cette rédaction. Nouvelle fixture PostgreSQL étendue à trois registres (104 documents par registre, montants maximums, isolation, pagination et rollback) et scénario navigateur de trois API puis des interfaces ventes/achats en FR/EN clair/sombre, 320/1440 et CSV : ajoutés, non exécutés localement faute de base et d'application isolées. Nouvelle CI requise avant toute revendication de réussite sur ce lot.

### Validation des quantités de vente — candidat suivant

Écart vérifié : création de devis et commandes directes ne contrôlait que le nombre de produits actifs ; la saisie de devis imposait deux décimales. `resolveSalesQuantitiesTx` remplace ce comptage par une lecture groupée tenant-scoped, vérifie la précision effective 0–6 et conserve l’ID canonique de l’unité dans chaque nouvelle ligne. La conversion d’un devis accepté refuse également une quantité désormais incompatible ou une unité changée ; elle ne réécrit pas le devis d’origine. Un replay de document déjà créé retourne l’historique existant sans revalidation destructive. Une unité différente exige une conversion vérifiée, aucun facteur déduit du nom. Ce garde ne remplace pas le registre de conversions historiques restant à implémenter. Une description libre sans produit/unité conserve seulement l’enveloppe technique six décimales, sans unité inventée.

API catalogue : précision ajoutée à l’unité projetée. Formulaire de devis : pas/minimum selon l’unité, validation préalable et message FR/EN ; unité effective transmise et revalidée serveur. Helper de pas/validation réutilisable dans les autres formulaires ; achats, production et autres formulaires restent à aligner. Aucune modification du calcul monétaire de prix/taxes dans cette tranche.

`qa-data-intelligence-sales-quantities-1228.mjs` exécute les services réels de création/conversion : sept précisions, acceptation/refus, aucune écriture en cas de refus, résolution groupée, unité archivée/étrangère, ligne libre et replay immuable ; inclus dans la QA #1228. Contrat statique #1198 suit la validation déplacée dans le helper et exige toujours son WHERE tenant/produits actifs ; aucune assertion de nested create ou d’isolation retirée. QA ciblée, #1198, lint ciblé et régression complète locaux réussis. Types globaux en cours à la rédaction. Nouveau scénario Shop2 : sept unités/produits, POST réel valide puis invalide, round-trip Prisma et absence de document supplémentaire ; CI requise.

Lot commercial précédent (`28335eb8`) : Migration, fixture PostgreSQL étendue, type-check, régression et lint CI réussis jusqu’au build ; [Quality 45684071690](https://github.com/Bandsman942/dtsc-platform/actions/runs/45684071690) encore en cours à cette rédaction. Vérification globale de types locale sur sources commerciales identiques terminée avec succès. Le scénario navigateur commercial n’a pas encore de résultat confirmé.

Les anciens devis catalogue sans unité enregistrée ne prouvent pas l’unité de leur quantité acceptée : conversion bloquée explicitement pour revue, sans remplir l’unité historique à partir du catalogue courant. Ce cas est testé (aucune écriture). Les nouveaux devis enregistrent l’unité dès leur création.

### Régression FEFO à la capacité maximale — candidat suivant

Reproduction réelle du planificateur avant correction : stock `999999999999999.999999`, réserve `0.000001`, demande égale au stock ; allocation erronée de la totalité et shortfall zéro. La soustraction utilisait la précision globale Decimal de 20 chiffres significatifs, inférieure aux 21 chiffres du stockage physique.

Correction : contexte local `exactInventoryQuantity` à 48 chiffres, sans modifier la configuration globale des montants. Les opérandes Prisma chargés sont convertis dans ce contexte avant calcul, y compris FEFO, consommation des allocations, retours physiques, snapshots et réserves, garde des sorties et projection stock. Aucun arrondi ajouté. Tests : allocation correcte `999999999999999.999998`, shortfall `0.000001`, dernière réserve/hold non consommée, consommation/annulation/retour multilot à pleine capacité, contexte monétaire global conservé. Fixture PostgreSQL complétée avec NUMERIC réel vers FEFO ; nouvelle CI requise.

Les harness VM #1042/#1187/#1212 chargent le helper réel via le loader existant, sans substituer l’arithmétique et sans retirer leurs assertions. QA #1228, suite complète #1212 et suites #1042/#1187 ciblées réussies localement. Régression globale et types relancés après ces modifications ; résultat en cours à cette rédaction.

### CI commerciale complète confirmée

Les 19 workflows de `28335eb864fee9fb7fda4f721cf3b8dba76fc3f2` sont terminés avec succès : [Quality](https://github.com/Bandsman942/dtsc-platform/actions/runs/45684071690), [Retail navigateur, y compris le nouveau scénario commercial](https://github.com/Bandsman942/dtsc-platform/actions/runs/45684071625), [Accounting](https://github.com/Bandsman942/dtsc-platform/actions/runs/45684072130), [contrôles du commit](https://github.com/Bandsman942/dtsc-platform/commit/28335eb864fee9fb7fda4f721cf3b8dba76fc3f2/checks). Ces preuves ne couvrent pas les changements ultérieurs de validation des ventes et FEFO. Les captures #1228 seront conservées par un upload dédié immédiatement après le scénario navigateur, avant nettoyage par les suites suivantes.

### Agrégats stock réservé/vendable — candidat suivant

Lignes et totaux réutilisent `inventoryQuantityMetrics` et le planificateur FEFO canonique, sans politique SQL parallèle ni nouvelle source de stock. Agrégats par unité, trois mesures et trois périmètres : résultat filtré toutes pages, général autorisé sans filtres, page. Quantités Decimal exactes, unités historiques préservées et incompatibilités signalées ; aucun total de taux/prix/snapshot quotidien. Réserves héritées, commandes actives/non expirées et retenues de factures non consommées sont prises en compte ; entrepôts/emplacements inactifs, quarantaine, blocage et péremption restent exclus du vendable. Les compteurs mouvements/dépôts suivent désormais les mêmes filtres ; leurs compteurs généraux restent explicites.

Une transaction RepeatableRead coordonne lignes, compte et synthèses, avec instant d’expiration unique. Lectures groupées de 200 articles : mémoire bornée par lot, pas de requête par article et aucune troncature des totaux ; une erreur interrompt le résultat. Le général réutilise le filtré quand aucun filtre n’est appliqué. Le coût sur gros tenant reste à mesurer sur copie représentative : ne pas assimiler le lot de test à une preuve de performance Production.

UI FR/EN et synthèse CSV/Excel/PDF reprennent physique/réservé/vendable et général ; la page n’est pas mélangée à un export toutes pages. Les cellules de synthèse XLSX sont numériques dans la capacité Excel, texte exact au-delà. Les signatures contrôlent aussi réserve/vendable, unité et précision. En résultat vide, export sans données mais avec compteur zéro, général et filtres explicites ; tests navigateur actualisés pour vérifier précisément ce contrat.

QA locale #1228 : matrice FEFO/péremption/quarantaine/dépôt/emplacement, unités, réserves/holds et capacité maximale ; 501 articles sur trois lots avec neuf lectures groupées, exclusion tenant/boutique et seuil physique. Les contrôles d’export réels vérifient absence de doublon physique, synthèses numériques et refus sur changement de réserve. #1042, suite #1212 et régression globale réussis ; types/lint en cours à la rédaction. Fixture PostgreSQL ajoutée : 501 articles, deux unités, réservations et retenues réelles, dépôt interdit, handlers GET réels pages 1/2/hors bornes et budget dix secondes pour ces trois lectures. Horloge d’organisation et décisions d’accès de fixture substituées, données et requêtes PostgreSQL réelles ; cette fixture ne prouve pas l’authentification/RBAC navigateur. CI requise, non exécutée localement.

### Preuves visuelles f5140437 et identité du contenu testé

Les 19 workflows de `f5140437cf8024cecf828546d4b4aa3f7fce81d2` ont réussi : [Quality](https://github.com/Bandsman942/dtsc-platform/actions/runs/45687281735), [Retail complet](https://github.com/Bandsman942/dtsc-platform/actions/runs/45687281731), [Accounting](https://github.com/Bandsman942/dtsc-platform/actions/runs/45687281775). Les huit captures commerciales sont conservées dans [l’artefact 15057626609](https://github.com/Bandsman942/dtsc-platform/actions/runs/45687281731/artifacts/15057626609), archive SHA256 `2110c8a8dfd2c001b8d3c7383916240cf2377f8d9eeb9413f94ca15ed5f3b36e`, expiration annoncée au 9 décembre 2026. Inspection visuelle partielle : montants/devise/statuts distincts et scopes visibles ; défaut constaté du titre Achats trop étroit à 320 px et du titre français de toast sur écran anglais. Ces défauts restent ouverts, aucune certification visuelle globale.

GitHub a exécuté le merge technique `413512d04522d2a0a2357cdcf5bae32340bff422`. Les [objets du commit source](https://api.github.com/repos/Bandsman942/dtsc-platform/git/commits/f5140437cf8024cecf828546d4b4aa3f7fce81d2) et [du merge testé](https://api.github.com/repos/Bandsman942/dtsc-platform/git/commits/413512d04522d2a0a2357cdcf5bae32340bff422) ont été vérifiés : même arbre `648e7beba586cad76bc98be0b189f0736ea3de7c`. Cette égalité prouve l’identité du contenu de ce SHA, sans extrapoler les contrôles à une autre version. Le nom des prochains artefacts utilise le SHA de tête PR ; l’arbre testé devra toujours être vérifié avant E2E final.

### Échec de fixture sur 514b54d8 — diagnostic conservant les budgets

[Quality 45690397732](https://github.com/Bandsman942/dtsc-platform/actions/runs/45690397732) : Migration et gouvernance réussies ; fixture #1228 échoue avec P2028, transaction de 30 secondes expirée au premier handler stock. Aucun succès PostgreSQL/performance n’est déclaré pour cette tranche. Le chargement/transpilage TypeScript du harness est déplacé avant la transaction de fixture ; la transaction et l’assertion de dix secondes sur les trois lectures réelles restent inchangées. Mesures distinctes ajoutées pour chargement du handler, préparation et lectures ; cause/efficacité à confirmer sur la nouvelle CI. Aucun test retiré ni timeout augmenté.

Le [run 45691502939](https://github.com/Bandsman942/dtsc-platform/actions/runs/45691502939) sur `58da1063` confirme : chargement du handler 214 ms, préparation de fixture 276 ms, première lecture réelle environ 18,7 s. Ce n’est donc pas expliqué par le harness ; lenteur applicative à corriger. Profil des requêtes lentes ajouté sans paramètres/données sensibles, et refus immédiat si une seule lecture dépasse déjà le budget total de dix secondes. L’assertion globale des trois lectures et le timeout de transaction restent conservés.

### Corrections issues de l’inspection visuelle — candidat suivant

Défaut reproduit sur les captures conservées : à 320 px, le flex de l’en-tête Achats laissait au titre une largeur de quelques caractères entre compteur et action. Le bloc titre/description prend maintenant une ligne entière sur mobile dans le composant partagé ; assertion de largeur utile ajoutée au scénario FR/EN.

Le toast global est monté hors du contexte locale AppShell : son titre restait français pour un export anglais. Le provider canonique de locale synchronise la langue du document (avec restauration lors du démontage), et le toast capture cette langue au moment de l’événement, y compris son bouton de fermeture. Les helpers de notification n’imposent plus un titre français par défaut ; les titres personnalisés sont conservés. Le shell possède aussi un attribut `lang` dès son rendu, et utilise les variantes EN du slogan/footer dans le même référentiel de marque. Pas de nouveau dictionnaire concurrent de notifications.

Les rails d’indicateurs sont atteignables au clavier avec focus visible ; les valeurs longues peuvent se répartir sur plusieurs lignes sans arrondi. Scénario navigateur ajouté : stock réel à `999999999999999.999999`, réserve `0.000001`, vendable `999999999999999.999998` ; textes exacts, clavier jusqu’au dernier indicateur et absence de débordement dans les 32 combinaisons FR/EN × clair/sombre × 320/360/375/390/414/768/1024/1440. Captures au sommet de page pour ne pas confondre position d’un élément fixe et page complète. Assertions explicites titre de toast, fermeture, footer et attribut de langue. Ces nouvelles preuves ne sont pas encore exécutées en CI.

Lint ciblé et régression complète locaux réussis avant rédaction ; contrôle de types en cours. La réussite des captures f5140437 n’est pas réutilisée comme certification de ces corrections.

### Profil et correction des lectures lentes

Le [profil du run 45692406975](https://github.com/Bandsman942/dtsc-platform/actions/runs/45692406975) isole le comptage de dépôts à 12 955 ms ; sélection de page, comptage ORM et premier lot environ 1 600 ms chacun. Total première lecture 18 336 ms, budget refusé. Le comptage de dépôts/mouvements matérialise maintenant une fois sa sélection autorisée avant la jointure ; pagination et comptage reprennent la sélection SQL déjà tenant/boutique/filtre-scoped, puis ne chargent que les clés de la page. Aucun élargissement de droits ni modification FEFO ; seuils 10 s / 30 s conservés, résultat CI à vérifier. Le comportement de matérialisation est documenté dans [PostgreSQL 16, section 7.8.3](https://www.postgresql.org/docs/16/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION). Aucun ANALYZE forcé, désactivation du planificateur/JIT ou changement de timeout pour faire passer le test.
