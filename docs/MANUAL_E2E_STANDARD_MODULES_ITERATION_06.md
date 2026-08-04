# Tests E2E manuels — Modules standards — Itération 06

**Statut : `NON_EXÉCUTÉ`**  
**Propriétaire de validation :** propriétaire DTSC Platform  
**Environnement requis :** Production issue du SHA fusionné dans `main`

> Tests E2E manuels préparés — validation du propriétaire en attente

## Préconditions

- deux organisations isolées ;
- un administrateur, un validateur et un membre simple ;
- modules Budgets, Rapports et Administration actifs selon le plan ;
- données ERP réelles de test ;
- français et anglais disponibles ;
- navigateur mobile à partir de 320 px.

## Scénarios

### 1. Création d’un budget
Créer un exercice, un budget et plusieurs lignes avec responsables et dimensions. Actualiser et vérifier la persistance, l’organisation, la devise et le total calculé.

### 2. Scénarios et versions
Créer BASE et OPTIMISTIC, comparer, soumettre, demander une correction, créer une révision et approuver. Vérifier la filiation et l’ancienne version inchangée.

### 3. Réalisé ERP
Créer ou utiliser une opération ERP autorisée, rafraîchir le réalisé, ouvrir la source et vérifier l’absence de double comptage.

### 4. Engagement
Créer un engagement autorisé, contrôler engagé et disponible, convertir en réalisé puis vérifier la réduction de l’engagement.

### 5. Alertes
Configurer un seuil, provoquer le dépassement, vérifier la notification et le lien profond, corriger la situation puis vérifier la clôture ou désactivation conforme.

### 6. Import
Lorsque l’import est exposé : télécharger le modèle, importer avec une erreur, corriger, simuler, confirmer et rejouer pour vérifier l’idempotence. Si l’infrastructure n’est pas exposée, constater son absence honnête.

### 7. Catalogue de rapports
Parcourir les familles, rechercher un rapport, ouvrir sa définition, sa source, son unité et sa fraîcheur.

### 8. Filtres et drill-down
Filtrer période, département et projet, ouvrir le détail source puis revenir en vérifiant la conservation des filtres.

### 9. Export
Exporter après filtrage. Comparer valeurs, formule, période, devise, locale, source et date de génération avec l’écran.

### 10. Assistance IA
Demander une explication d’écart ou une synthèse. Vérifier sources, période, hypothèses, limites et absence de mutation automatique.

### 11. Collaborateurs
Inviter, accepter, affecter poste, département et rôle, puis vérifier les accès et l’audit.

### 12. Retrait d’un collaborateur
Affecter une responsabilité, tenter un retrait, vérifier l’avertissement, réaffecter, retirer et confirmer la perte d’accès sans suppression du compte global.

### 13. Départements
Créer une hiérarchie, déplacer un département, tenter un cycle, vérifier le refus, archiver puis contrôler membres et historique.

### 14. Rôles et permissions
Créer un rôle, l’affecter, tester une API et l’interface, retirer une permission et vérifier l’effet réel.

### 15. Dernier administrateur
Tenter de rétrograder, suspendre ou retirer le dernier administrateur. Vérifier `LAST_ADMIN_PROTECTED`, puis ajouter un second administrateur et recommencer.

### 16. Modules et abonnement
Tenter d’activer un module hors plan, vérifier le refus, activer un module autorisé, vérifier navigation, dépendances et guide.

### 17. Branding et paramètres
Modifier logo/couleurs lorsque supportés, locale, fuseau, devise, formats et exercice. Actualiser et vérifier l’application réelle.

### 18. Audit
Effectuer plusieurs mutations, filtrer par acteur/action/risque/reason code, ouvrir le détail et demander un export. Vérifier confidentialité et approbation éventuelle.

### 19. i18n
Tester français et anglais sur budgets, rapports, administration, erreurs, statuts, dates, devises, pluriels et exports.

### 20. Guides natifs
Ouvrir chaque guide depuis son module, vérifier sections, langue, composant natif et fonctionnement mobile.

### 21. Kanban de maturité
Ouvrir Administration DTSC, filtrer l’itération 6, vérifier cartes uniques, preuves, guides, QA, Production et historique.

### 22. Blocage commercial
Tenter de promouvoir sans E2E propriétaire. Vérifier le refus traduit, l’absence de transition et l’audit.

### 23. Mobile
Tester 320, 360, 375, 390, 414 et 768 px : KPIs, rails de filtres, tableaux, graphiques, formulaires, collaborateurs, départements, matrice, sécurité, audit, guides et Kanban.

### 24. Isolation inter-tenant
Créer budgets, rapports, rôles et politiques dans deux organisations. Tester URLs et APIs directes d’une organisation vers l’autre. Vérifier 403/404 sans fuite de métadonnées.

## Validation finale

Le propriétaire doit consigner date, navigateur, organisation, résultat de chaque scénario, captures ou références de preuve et anomalies. Aucun module ne peut être promu vers `COMMERCIAL_READY` avant une validation explicite et persistée.

**Tests E2E manuels préparés — validation du propriétaire en attente**
