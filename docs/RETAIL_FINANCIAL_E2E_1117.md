# Recette E2E de pré-fusion — RETAIL Finance, issue #1117 / PR #1119

**Statut : E2E final BON confirmé explicitement par le propriétaire le 12 novembre 2026 pour le périmètre de la PR #1119.** Les preuves automatisées sont disponibles dans les workflows GitHub ; le détail des 22 scénarios ci-dessous reste une matrice de contrôle et les pièces manuelles individuelles ne sont pas annexées ici.
**Branche candidate :** `feat/1117-retail-financial-kpi-traceability-v2`.
**Baseline initiale :** `main@c85b8f845a148bc3c9df64cdb5fc9d07b8e446c9`; vérifier le SHA actuel avant fusion.
**Environnement :** base de test migrée, données fictives, scripts/CI sur branche ; aucune modification ni preview de Production.

## Préflight obligatoire

- Quality Gates et toutes les suites GitHub vertes sur le **dernier** commit, dont `pnpm qa:retail-financial-kpi-v2`, `pnpm qa:retail-executive-1105`, `pnpm qa:retail-cogs-1109`, `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, `pnpm build`, migrations en base vierge et tests navigateur.
- Une entreprise RETAIL fictive avec deux boutiques A/B, boutique C archivée avec mouvements historiques, transactions sans boutique attribuée, deux devises CDF/USD ; comptes avec disponibilité renseignée et manquante; factures/avoirs/paiements/allocations/contrepassations/écritures variées; exercice fermé.
- Acteurs séparés : OWNER, ADMIN entreprise, agent caisse, facturier, Finance, lecteur sans module requis et usager d'un autre tenant. Vérifier entitlements module par module.
- Référence unique pour chaque jeu de test, export daté et snapshots des lignes sources, date locale de la boutique, monnaie et période. Ne pas publier de données clients.

## Scénarios de rapprochement des 12 indicateurs

| ID | Carte/source | Preuve et résultat attendu |
|---|---|---|
| KPI-01 | Encaissements Finance | Paiements CONFIRMED/RECONCILED INBOUND et allocations confirmées, non contrepassées; concordance avec dates de paiement et mouvements caisse, pas d'encaissement d'un brouillon |
| KPI-02 | Factures émises | Total par date d'émission net des avoirs à date; HT/TVA/TTC de pièces; aucune facture DRAFT dans l'émis |
| KPI-03 | Créances ouvertes | Somme du résiduel selon allocations confirmées/avoirs; solde **actuel**, jamais fausse valeur historique du filtre |
| KPI-04 | Créances échues | Résiduel positif et date d'échéance dépassée dans fuseau correct; absence de paiement confirmé en doublon |
| KPI-05 | Produits comptabilisés | Lignes du grand livre postées, compte P&L, débit/crédit signé, période pertinente; égalité de la somme de détail |
| KPI-06 | Marge brute comptabilisée | Produits postés moins coût des ventes canonique; exclure les autres charges d'exploitation; aucun coût catalogue supposé |
| KPI-07 | Résultat opérationnel | Lignes P&L `POSTED`, signes correctement appliqués, contrepassation explicite, aucune projection métier en double |
| KPI-08 | Trésorerie disponible | Disponibilités par compte et devise; si un compte ne fournit pas `availableBalance`, afficher **Non déterminé**, pas zéro ni `operationalBalance` |
| KPI-09 | Dépenses | Dépenses approuvées, pièces budget/compte/paiement et audit; ne pas confondre engagement, sortie et charge comptabilisée |
| KPI-10 | Commission Mobile Money | Commissions réellement confirmées, par boutique/compte et devise, sans inclure le principal dépôt/retrait |
| KPI-11 | Marge Télécom | Ventes SUCCESS, coût opérateur et marge source, en devise native; rapprocher au journal lorsque la comptabilisation existe |
| KPI-12 | Ventes POS historiques | Tickets `COMPLETED`, séparés des factures Finance; aucun double CA ni double comptage lors d'une migration |

## Transversal : fiabilité, sécurité et expérience utilisateur

| ID | Parcours | Résultat attendu |
|---|---|---|
| KPI-13 | Cliquer chaque carte et ouvrir drill-down → pièce originale | Accès autorisé, référence source exploitable, date, statut, boutique, devise; aucun lien vers une pièce étrangère |
| KPI-14 | Changer filtre boutique A/B, boutique C archivée, non attribué, période jour/semaine, devise CDF/USD | Détails et totaux concordants par scope; historique de C maintenu; non attribué séparé; devises jamais additionnées sans taux historique |
| KPI-15 | Paginer/rechercher le détail, puis exporter PDF/XLSX/CSV | Total général indépendant de la page; nombre total, limites/troncature et filtres explicités; exports conformes aux lignes accessibles et sans faux total zéro |
| KPI-16 | Retirer module Accounting, Payments, Receivables, Budgets, Treasury, Agency, Telco individuellement | Le KPI correspondant est masqué/refusé à la lecture API et à l'export; `FINANCE_PAYMENTS` **et** `FINANCE_RECEIVABLES` requis pour encaissements |
| KPI-17 | Modifier URL tenant/site/metric et réutiliser un deep link depuis une session non autorisée | 401/403/404 selon cas; aucune fuite de chiffre, pièce, état de boutique ou téléchargement |
| KPI-18 | Sauvegarder favoris KPIs, puis recharger/se déconnecter et reconnecter | Préférences persistées côté serveur et liées à l'acteur; jamais d'effet sur montants, RBAC ou ordre comptable |
| KPI-19 | Comparer écritures POSTED, REVERSED, CANCELED, période CLOSED/LOCKED | Reversals correctement identifiés, comptabilisation immuable; pas d'agrégat basé sur brouillons/écritures non comptabilisées |
| KPI-20 | 320/360/375/390/414/768/1024 px + desktop, FR/EN, clair/sombre, focus/clavier | Toutes cartes, détails, filtres, exports et retour accessibles; légendes de temporalité lisibles et sans codes techniques |
| KPI-21 | Actualiser après facture, paiement partiel, avoir, rapprochement et fermeture boutique C | Source métier → détail → indicateur → export se réconcilient; pas de cache donnant l'ancien total |
| KPI-22 | Grand volume (plusieurs pages), 0 ligne, montant NULL, taux inconnu | Performance et pagination correctes; « Non déterminé » lorsque preuve incomplète; pas de faux zéro; exports volumineux async #1110 restent hors scope annoncé |

## Contrôle automatisé supplémentaire (à vérifier sur CI du SHA final)

- `tests/e2e/retail-financial-kpi-1117.spec.mjs`, ajouté au workflow `Shop 2 behavioral gates` après les recettes Finance sur PostgreSQL/Chromium isolés.
- Il interroge les 12 sources avec le propriétaire de l'organisation et un membre non-administrateur, compare droits de module et réponses HTTP, confronte les sommes par pièce aux sous-totaux lorsque la fenêtre tient sur une page, vérifie le multi-tenant par une boutique étrangère réelle, les filtres, la pagination et l'absence de création de factures, paiements ou journaux lors des lectures.
- Ces preuves API ne remplacent pas les rapprochements comptables détaillés manuels, les scénarios multi-devises historiques, la qualité de l'interface FR/EN/mobile ou les essais volumineux des exports.

## Blocages et arbitrages nécessaires

1. Un test de QA basé sur l'ancienne signature `$queryRaw<TrendRow>` a été aligné avec la signature réelle `$queryRaw<TrendRow[]>(Prisma.sql...)` **sans retirer les assertions de droits**. Exiger un nouveau run Quality sur le dernier SHA ; pas de PASS supposé.
2. Tester sur PostgreSQL réel les rapprochements par devise et boutique, notamment contrepassations, disponibles partiellement inconnus, factures nettes d'avoirs, créances et sorties.
3. Les reports exhaustifs asynchrones et l'audit des téléchargements (#1110) ne sont pas livrés; ne pas déclarer qu'un export paginé couvre tout l'historique.
4. Avant fusion, réconcilier les modifications communes de POS #1118 et des PR historiques #1114/#1115; rejouer la CI sur le SHA final.

## Tableau de signature

Pour chaque ID : **PASS / FAIL / BLOCKED / NOT RUN** + acteur/role, SHA, pièce test, captures anonymisées, requête SQL/ledger de réconciliation, devise, incident, date et évaluateur. Un échec sécurité, somme comptable, isolation, droits ou fausse disponibilité interdit la fusion.

Le propriétaire doit émettre explicitement **« E2E final #1119 BON »** uniquement après preuve sur les 22 scénarios et arbitrage des dépendances. Aucune validation n'est actuellement présumée. Fusion de la PR seulement après nouvelle autorisation explicite; Vercel Production uniquement depuis `main`.

## Validation de livraison (12 novembre 2026)

- Propriétaire : confirmation « E2E final bon, tu peux fusionner », après recette des deux chantiers RETAIL.
- GitHub : #1119 16/16 sur `cd71c395`, #1120 intégration #1118+#1119 16/16 sur `db973703`; nouvelle CI exigée sur la branche #1119 réconciliée depuis `main@066abe732faa8ef3f047b96a1872fe3f0b12683f` en version 1.13.0.
- Aucun contrôle manuel individuel non documenté n'est inventé. Conformité fiscale pays, drivers matériels non implémentés, PWA true-offline et export volumineux #1110 restent hors périmètre certifié.
