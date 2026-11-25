# DTSC Frontend Design System — Design 2.0

## Objectif

Le design system DTSC fournit un socle commun à Public, Account, App, Console et Support. Il ne remplace pas les composants métiers : il stabilise leur langage visuel, leur contraste et leur comportement responsive.

## Tokens sémantiques

Les tokens sont définis dans `app/design-system.css`. Les composants doivent utiliser les rôles `brand`, `background`, `surface`, `text`, `border`, `focus`, `success`, `warning`, `danger` et `info`, plutôt que de répéter des valeurs hexadécimales.

Les accents produits restent légers : Public bleu, Account cyan, App bleu, Console indigo, Support vert. La marque mère conserve DTSC Navy, DTSC Blue et DTSC Cyan.

## Hiérarchie des modules RH

Les conteneurs et sous-sections utilisent d'abord les surfaces et traits DTSC neutres avec titres et icônes bleu de marque. Les variations cyan, violet, orange, rose et vert ne servent pas à classifier les panneaux. Elles sont limitées aux badges d'état et aux encadrés exceptionnels (alerte, confirmation, erreur, archivage), en restant compatibles avec le contraste sombre et clair. Une information ne dépend jamais de la couleur seule ; l'état est nommé.

## Typographie

L’échelle canonique comprend Display, H1, H2, H3, Body large, Body, Body small, Label et Caption. Les titres n’utilisent plus systématiquement le poids maximal ; la hiérarchie dépend aussi de la taille, de l’espacement et du contraste.

## Espacement, rayons et ombres

Les rayons sont limités aux rôles control, card, panel, modal, hero et pill. Les ombres `sm`, `md`, `lg`, `focus` et `floating` restent sobres et ne doivent pas remplacer une hiérarchie de contenu claire.

## Motion

Les durées `fast`, `normal` et `slow` utilisent les courbes `standard` ou `emphasized`. `prefers-reduced-motion` désactive les animations et transitions non essentielles. Aucun contenu ne dépend d’une animation pour devenir visible.

## Accessibilité

Tout contrôle interactif possède un nom accessible, un focus visible et une cible mobile suffisante. Le système doit rester utilisable à 320 px, au zoom 200 % et sans souris.

## Contrat normatif Design 2.0 (version 2.0)

**Lecture obligatoire avant toute contribution**, humaine ou automatisée, y compris avant un correctif. Ce document est le point d'entrée canonique du Design 2.0 pour Public, Account, App, Console et Support. Il complète [AGENTS.md](../AGENTS.md), [CONTRIBUTING](CONTRIBUTING.md), [contrat responsive](RESPONSIVE_UI_CONTRACT.md), [formulaires](FORM_UX_CONTRACT.md), [densité UX](UX_DENSITY_CONTRACT.md) et les contrats métiers. Les règles de sécurité, d'intégrité et de domaine plus strictes prévalent. Ne pas créer de primitives, dictionnaires ou sources de vérité parallèles.

### D2-01 — Structure et densité
- Réutiliser les primitives de `components/workspace/*` et tokens existants : ModuleWorkspace, ModuleHeader, ModuleToolbar, ModuleMetrics, ModuleContent, ModuleSection, BusinessList, BusinessListItem, BusinessDetail, ContextActions, StatusBadge, EmptyState.
- Header métier compact avec titre, contexte, action principale autorisée ; ensuite KPI utiles, barre de recherche et filtres, contenu, pagination et actions contextuelles. Éviter cartes imbriquées, zones vides et répétitions. Hiérarchie de titres, alignement des chiffres, unités et devises explicites.
- Filtres recherchables, dates précises et intervalles via calendrier, statuts par rail accessible, filtres actifs visibles et réinitialisables ; recherche sur noms/références métier. Tri stable, pagination serveur, conservation du contexte au retour. Préférences par utilisateur et contexte lorsque pertinentes.
- Couleurs sémantiques pour états, alertes, succès, erreurs et anomalies ; jamais la couleur seule. Icônes cohérentes et menus « … » discrets, fonctionnels, permissionnés, positionnés sans découpe mobile.
- KPI contextualisés : définition, périmètre, période, devise, source, aide à l'interprétation ; navigation vers les données justificatives autorisées lorsque disponible. Pas de métriques fictives ni placeholders.

### D2-02 — Parcours, formulaires, feedback et accessibilité
- Mobile : liste → détail plein écran → formulaire plein écran → retour ; desktop : panneau ou page adaptée à la complexité. Safe areas, scroll local des longues listes/tableaux, aucune largeur globale parasite, contrôles accessibles au clavier, focus visible et restauration du focus.
- Tester 320, 360, 375, 390, 414, 768, 1024 et 1440 px, zoom 200 %, FR/EN, clair/sombre, clavier et tactile. Animations légères et respect de prefers-reduced-motion.
- Formulaires groupés selon le métier, champs obligatoires identifiés, aides contextuelles, combobox de référence canonique, validation immédiate et serveur. Préserver les saisies en cas d'erreur, prévenir double soumission, confirmation des actions destructives. Aucune action décorative.
- Skeleton ou chargement explicite, états vide/aucun résultat/erreur distincts, réessai contrôlé. Toast contextualisé succès/erreur, ne pas confondre mutation réussie et relecture échouée ; fermer le formulaire après succès confirmé lorsque adapté. Pas d'erreur brute, enum, clé technique ou ID interne comme libellé métier.

### D2-03 — Contrat quantités et précision
- L'unité de mesure effective du catalogue (achat, vente, stockage ou reporting après conversion) est la source canonique du nombre de décimales autorisées et du symbole. Respecter sa précision dans Stock, Valorisation, Clôture magasin, POS, achats, ventes, inventaires, secteurs et exports. Ne jamais imposer trois décimales indépendamment du référentiel.
- Séparer précision de stockage, précision de calcul et précision d'affichage. Quantités et montants de comptabilisation utilisent une arithmétique décimale exacte adaptée ; ne pas introduire de calcul financier en flottants binaires. Formater selon locale et précision applicable. Ne pas arrondir les quantités historiques incompatibles silencieusement : présenter anomalie et valeur exacte dans le contexte autorisé.
- Validation client et serveur de l'échelle autorisée ; fractions non autorisées refusées explicitement ; conversions cohérentes sans perte, unité cible identifiée, validation des facteurs et des références tenant-scoped. Préserver la traçabilité historique des unités et facteurs. Pas de mutation rétroactive par changement de configuration.
- Montants : précision monétaire configurée et code devise (CDF n'est pas USD) ; coûts unitaires et taux de change conservent leur précision de calcul propre ; pourcentages selon indicateur ; comptages entiers. Aucune règle globale de décimales pour tous les nombres. Valeur manquante distincte de zéro.

### D2-04 — Contrat agrégations et tableaux analytiques
- Sur toute liste chiffrée où pertinent, afficher un sous-total filtré couvrant **toutes les pages** selon exactement les mêmes filtres, recherche, période, statut, permissions, boutique et contexte que la liste. Total général du périmètre autorisé (définition visible), et total page explicitement distingué lorsqu'utile. Indiquer nombre de résultats et état sans résultats.
- Agréger côté serveur via les sources canoniques, indépendamment de la pagination. Liste, KPI, sous-totaux et exports partagent le même contrat de filtres et de calcul ; changements rapides de filtres ne doivent pas afficher des résultats obsolètes. Pas de chargement intégral des données dans le navigateur ni de requêtes N+1.
- Déclarer par colonne les agrégations autorisées : somme des flux/quantités compatibles, moyenne et minimum/maximum pertinents, moyenne pondérée des coûts, comptage ou distinct, ratios recalculés (ex. marge = marge totale / ventes totales) ; ne pas additionner taux, prix unitaires, snapshots successifs de soldes ou stocks. Solde et stock à date, ouverture/entrées/sorties/clôture distingués.
- Grouper les quantités par unité compatible (et produit lorsque la conversion n'a de sens qu'au niveau article), les montants par devise ; consolidation uniquement via taux historiques applicables et traçables dans la devise de référence. Aucun double comptage de projections sectorielles ou écritures/flux déjà inclus.
- Pied de tableau lisible et responsive, cartes KPI actualisées par filtre avec sémantique explicite, menu de colonne proposant uniquement fonctions pertinentes : tri, filtre, agrégations, regroupement, visibilité si applicable. Les contrôles sont fonctionnels et accessibles ; si une agrégation est interdite ou indisponible, ne pas présenter un total trompeur.
- Mesurer les requêtes et la performance avec jeux volumineux, index adaptés, bornes et contrôle des courses entre réponses.

### D2-05 — Contrat libellés métiers et intégrité
- Afficher noms de produits/services, références commerciales, tiers, sites, entrepôts, boutiques, collaborateurs autorisés, numéros/intitulés de comptes, factures, paiements et mouvements plutôt que des IDs techniques. Préciser l'opération et sa référence métier ; quantité/unité et source si pertinentes.
- Générer les libellés automatiquement à partir des sources autorisées via le service métier partagé. Capturer la désignation au moment de la comptabilisation dans le contrat de posting/snapshot existant ou extension additive. Conserver les références techniques dans la piste d'audit protégée, pas en libellé principal.
- Les écritures POSTED restent immuables : anciens libellés enrichis par projection de lecture à partir de références historiques fiables, clairement distinguer une désignation actuelle d'un snapshot historique ; référence introuvable signalée sans inventer de nom. Ne pas modifier comptes, dates, montants, statut, devise, taux ni écritures validées pour embellir l'affichage.
- Vérifier séparément les imputations de stock selon méthode et référentiel comptable applicables ; corriger une erreur avérée par le processus métier autorisé de contrepassation puis nouvelle écriture, jamais par édition directe. Toute nouvelle comptabilisation équilibrée, idempotente et versionnée.
- Navigation source et recherche par libellé respectent mêmes droits que données sous-jacentes, sans fuite inter-tenant, inter-boutique ni clinique. Finance n'accède pas aux détails cliniques inutiles.

### D2-06 — Contrat documents, rapports et exports
- Rapports et PDF/XLSX/CSV reproduisent le périmètre filtré et les mêmes calculs, libellés, unités, devises et précisions que l'interface ; distinguer total filtré, total général et page. Indiquer période, filtres, date de génération, identité entreprise et devise.
- XLSX : cellules numériques réelles, formats numériques adaptés et formules fiables lorsque pertinentes. CSV : schéma stable, encodage et séparateur documentés, neutralisation des injections de formule pour champs texte ; préserver précision. PDF : en-têtes, pagination, titres et totaux lisibles, marque de l'entreprise et confidentialité.
- Templates d'import téléchargeables et upload avec validation, erreurs par ligne, prévention doublons et feedback si applicable. Exports volumineux bornés ou traités selon contrat existant, autorisés côté serveur ; éviter de charger toutes les lignes côté client.

### D2-07 — Contrôle de contribution
Toute évolution concernée doit documenter les primitives/sources réutilisées, l'impact sur D2-01 à D2-06, les exclusions motivées, les tests et preuves. Tests unitaires, intégration API/DB, UI, exports, RBAC/entitlements, isolation, performance, non-régression et OWNER_E2E selon le scope ; jamais déclarer une preuve sans exécution. Toute évolution de ce standard se fait par PR revue et changelog, sans duplication de contrat. Pour une anomalie financière, intégrité avant présentation.
