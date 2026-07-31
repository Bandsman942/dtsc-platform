# Plan de décommissionnement legacy ERP

## Principe

L’itération 1 ne supprime aucune donnée, table, colonne, migration ou ligne de module. Elle rend les incohérences observables et empêche les codes non implémentés de devenir accessibles.

## Catégories legacy

### 1. Aliases déterministes

Aliases reconnus :

- `SALES_CASHIER` → `SALES_DISPENSATION`
- `PURCHASE_REQUESTS` → `SUPPLIERS_ORDERS`

Règles :

- les anciennes URLs sont résolues vers le code canonique ;
- les données et lignes historiques ne sont pas renommées de façon destructive ;
- si une ligne canonique et une ligne alias coexistent, l’application d’un template désactive la ligne alias ;
- la navigation ne montre qu’une seule entrée canonique.

### 2. Modules administratifs historiques

`ADMIN_DASHBOARD`, `COLLABORATORS_POSITIONS`, `DEPARTMENTS`, `PERMISSIONS`, `SETTINGS` et `AUDIT_LOGS` deviennent des redirections vers `/enterprise-admin?section=...`.

Ils ne seront supprimés de la configuration tenant qu’après :

1. vérification des deep links ;
2. vérification des notifications et activités historiques ;
3. migration additive éventuelle des préférences de navigation ;
4. période de stabilisation en production.

### 3. Templates futurs non implémentés

Les migrations historiques des secteurs Assurance, Éducation, Commerce, Services professionnels et ONG/ASBL restent immuables. Le wrapper d’application de template désactive les modules qui sont :

- inconnus du registre ;
- `PLANNED`, `HIDDEN` ou `RETIRED` ;
- incompatibles avec le secteur actif ;
- des sections administratives ;
- des aliases dupliqués.

Les blocs d’activité ciblant ces modules sont également désactivés sans suppression.

### 4. Sources métier génériques

`EnterpriseCoreRecord`, `EnterpriseSectorRecord` et `EnterpriseWorkflow` legacy restent en place. Ils ne sont pas supprimés ou migrés dans cette itération.

- Les workspaces dédiés continuent d’utiliser leurs sources métier spécialisées.
- Les modules beta peuvent lire une source legacy explicitement allow-listée.
- Aucun nouveau domaine dédié ne doit revenir vers un CRUD générique.

## Étapes futures

### Itération 2

- vérifier les dernières chaînes opérationnelles Core ;
- réduire les dépendances actives à `EnterpriseCoreRecord` ;
- conserver la compatibilité des liens et notifications.

### Itération 3

- établir la source commune Finance/Comptabilité/Trésorerie ;
- décider les adapters nécessaires pour Health et Pharmacy ;
- ne supprimer aucune source sectorielle avant réconciliation.

### Itération 4

- converger progressivement les processus Pharmacy et Health ;
- documenter chaque mapping métier et chaque exception sectorielle ;
- maintenir les permissions de confidentialité.

### Itération 5

- mesurer les lectures/écritures restantes sur les modèles legacy ;
- migrer par lots idempotents ;
- archiver les codes devenus inutiles ;
- supprimer uniquement après preuves de non-usage, sauvegarde et rollback validé.

## Critères avant retrait définitif

Un code, une ligne ou un modèle legacy ne peut être retiré que si :

- aucune route, notification, activité, workflow ou rapport actif ne le référence ;
- toutes les données ont une cible canonique vérifiée ;
- les migrations depuis une base vide et depuis une copie de données existantes passent ;
- les QA et smoke tests couvrent les anciens liens ;
- le rollback est documenté ;
- la suppression est livrée dans une migration dédiée, jamais en modifiant une ancienne migration.
