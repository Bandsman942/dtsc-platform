# Hotfix #758 — Convergence formulaires, fiches, CRUD contextuel et règles comptables

Baseline : `main@ab5137757a43437da2fe60ca23884ed09d938b37`.

## Objectif

Supprimer les divergences entre ce que l’utilisateur saisit, ce que le backend persiste, ce que les fiches compactes résument, ce que le plein écran détaille et ce que le menu contextuel `…` autorise réellement.

Le contrat est transverse ERP : **aucune donnée fictive, aucun faux CRUD, aucune permission déduite côté client**.

## Trésorerie > Financements

Le cartouche d’information passe en grille mobile `1 colonne` puis `texte + CTA` à partir de `sm`.

À 320–414 px :
- le texte utilise toute la largeur disponible ;
- aucun mot n’est comprimé en colonne étroite ;
- le bouton « Nouvelle entrée de fonds » occupe la largeur utile et revient sous le texte ;
- à partir de `sm`, le bouton reprend une largeur automatique.

## Comptabilité — formulaire ↔ fiche ↔ détail

### Plan comptable

Il n’existe pas de champ métier générique `type` sur `EnterpriseChartOfAccounts`. Le précédent rendu « Type → Autre catégorie » était un fallback d’interface et non une donnée.

Le contrat devient :
- Code ;
- Libellé français ;
- Libellé anglais ;
- Origine du plan : template comptable publié ou plan personnalisé ;
- Statut.

Le formulaire Plan ne crée donc pas un faux champ `type`. L’adoption d’OHADA/SYSCOHADA reste portée par le workflow canonique de template comptable.

### Compte comptable

Le vrai type est `accountType`. Il reste une combobox sur un plan personnalisé.

Pour un plan issu d’un template publié, un compte réglementaire du template reste immuable. L’utilisateur peut créer un sous-compte personnalisé en choisissant un compte parent réel ; le type et le sous-type sont hérités du parent par le backend.

### Exercice / Période

Un `label` métier nullable est ajouté à `EnterpriseFiscalYear` et `EnterpriseFiscalPeriod`.

Les nouveaux formulaires demandent :
- Code ;
- Libellé libre ;
- Dates ;
- Exercice parent pour une période.

Aucun champ `type` artificiel n’est ajouté aux exercices/périodes.

La migration est compatible avec l’historique : les anciennes lignes conservent `label = NULL` jusqu’à modification.

## CRUD contextuel

Le plein écran comptable recharge l’enregistrement canonique avant de construire son menu `…`. Les actions viennent des `capabilities` calculées par l’API.

### Plan
- Modifier les libellés ;
- modifier le code uniquement tant que le plan brouillon est vide ;
- supprimer uniquement un plan personnalisé DRAFT totalement vide ;
- un plan template ou utilisé n’est jamais supprimé arbitrairement.

### Compte
- Modifier seulement un compte personnalisé ;
- les comptes système/template restent immuables ;
- les champs structurels sont verrouillés après utilisation ;
- la suppression logique est une désactivation/archivage et reste bloquée si le compte est référencé.

### Exercice
- Modifier seulement en DRAFT ;
- supprimer seulement un DRAFT sans période ;
- ouvrir depuis `…` lorsque l’utilisateur a la permission et que le workflow le permet.

### Période
- Modifier/supprimer uniquement une période OPEN inutilisée et sans clôture ;
- les périodes ayant des écritures/imports/clôtures restent historiques.

### Journal
- Modifier si permission de gestion ;
- supprimer uniquement s’il ne contient aucune écriture.

### Règle comptable
- les règles provenant d’un template publié restent en lecture seule ;
- les règles d’un plan personnalisé peuvent être créées, modifiées et désactivées ;
- toute mutation reste revalidée tenant-scoped côté serveur.

Le même contrat de menu contextuel est appliqué aux plein-écrans ERP mutables audités. Pour Gaming, les actions globales de l’encaissement, de la clôture et du tournoi sont déplacées dans `…`. Les actions d’une sous-ligne (paiement, participant, poste affecté) restent au niveau de cette sous-ligne.

## Règles OHADA et plans personnalisés

Le template officiel `OHADA_SYSCOHADA@0.1.0` reste immuable et contient déjà plus de 50 correspondances sémantiques canoniques, notamment :
- clients/fournisseurs ;
- ventes/services ;
- TVA/taxes ;
- stocks/coût des ventes ;
- caisse/banque/mobile money ;
- immobilisations ;
- paie ;
- emprunts ;
- capital ;
- écarts et comptes de passage.

L’onglet **Règles** expose maintenant les mappings installés avec :
- libellé métier de la règle ;
- plan comptable ;
- compte cible ;
- origine template/manuelle ;
- statut ;
- dates d’effet dans le détail.

Les champs fictifs du détail précédent (`postingEvent`, `description` absents du modèle) sont supprimés.

### Règles manuelles

Pour un plan personnalisé :
1. l’utilisateur choisit le plan ;
2. choisit une règle sémantique du registre canonique ;
3. choisit un compte actif du même plan ;
4. le backend valide le type/sous-type attendu ;
5. une seule règle active de cette nature est autorisée dans ce plan ;
6. la règle peut être bornée par dates et désactivée sans effacer l’historique.

`EnterpriseAccountMapping` reçoit un `chartId` explicite. La migration backfill ce champ depuis le compte cible existant puis remplace l’ancienne unicité entreprise+clé+date par entreprise+plan+clé+date. Cela permet de préparer un plan personnalisé sans contaminer le plan actif.

Le résolveur de posting et les readiness utilisent uniquement les mappings du plan actif.

## Bloc « Accès et responsabilités »

Le bloc décoratif commun « Accès et responsabilités » est supprimé du shell ERP. Les permissions restent appliquées par les resolvers backend et les `capabilities` retournées par les APIs ; leur suppression visuelle ne réduit aucune sécurité.

## QA

`scripts/qa-hotfix-758-erp-ui-accounting-convergence.mjs` protège :
- responsive Financements ;
- absence du faux `Type` générique ;
- labels fiscaux persistés ;
- scope des règles par plan ;
- immuabilité des templates ;
- formulaire de règle manuelle ;
- menu `…` pour les plein-écrans mutables audités ;
- absence du bloc Accès et responsabilités.

La QA #758 est ajoutée à `pnpm qa:regression`.

## Dette

- Dette créée : **aucune visée**.
- Dette remboursée :
  - fallback « Autre catégorie » utilisé pour un champ inexistant ;
  - divergence formulaire/fiches Exercice et Période ;
  - détail Règles affichant des champs non persistés ;
  - absence de règles manuelles pour plan personnalisé ;
  - mappings non scindés par plan comptable ;
  - actions globales hors menu contextuel dans certains plein-écrans Gaming ;
  - bloc décoratif Accès et responsabilités.
- Dette reportée : aucune dans le périmètre #758.

## Rollback

Le rollback applicatif se fait par revert de la PR.

La migration conserve les données existantes :
- ajout de `label` nullable ;
- ajout de `chartId`, backfill depuis `EnterpriseLedgerAccount.chartId`, puis contrainte NOT NULL ;
- remplacement d’un index d’unicité par son équivalent scoped par plan.

Aucune écriture comptable, règle historique, compte ou plan n’est supprimé par la migration.