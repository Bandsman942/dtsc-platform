# Architecture canonique des domaines ERP

## Objectif

DTSC Platform sépare désormais trois concepts qui étaient historiquement mélangés :

1. **Domaines ERP métier** : opérations, achats, finance, documents, analytics et domaines sectoriels.
2. **Services transversaux** : collaboration, communication, IA, support, compte et abonnement.
3. **Administration entreprise** : membres, postes, départements, permissions, configuration, abonnement et audit.

Cette séparation ne déplace pas encore les sources métier et n’anticipe pas les itérations 2 à 5.

## Autorités

### Registre TypeScript

`lib/enterprise/module-registry-data.json` et `lib/enterprise/module-registry.ts` sont l’autorité sur :

- l’existence fonctionnelle d’un module ;
- son statut d’implémentation ;
- son domaine et son groupe de navigation ;
- sa route et son workspace allow-listé ;
- ses secteurs compatibles ;
- ses dépendances ;
- ses permissions attendues ;
- son plan minimum et l’exigence d’un abonnement actif ;
- ses aliases et codes legacy.

Le registre n’importe jamais un composant depuis une valeur arbitraire de base de données.

### Configuration tenant

`EnterpriseModule` reste responsable de :

- l’activation ou la désactivation dans une organisation ;
- l’ordre ou les préférences réellement nécessaires au tenant ;
- la provenance historique du template ;
- le niveau de plan configuré historique ;
- la conservation des lignes existantes.

Une ligne active en base ne suffit plus à rendre un module ouvrable.

## Domaines

| Domaine canonique | Rôle actuel | Modules actifs actuels |
|---|---|---|
| `OPERATIONS` | Exécution et coordination | Tâches, demandes, validations, réunions, workflows |
| `PROCUREMENT_INVENTORY` | Fournisseurs, achats et inventaire | Fournisseurs & achats; stock Pharmacy sectoriel |
| `FINANCE` | Budgets, dépenses et contrôles existants | Finances & budgets; caisse Pharmacy; facturation Health distincte |
| `DOCUMENTS` | Documents communs et sectoriels confidentiels | Documents, documents médicaux, documents Pharmacy |
| `ANALYTICS` | Rapports issus des vraies sources | Rapports communs et rapports Pharmacy; Health beta |
| `INTELLIGENCE` | IA contextualisée entreprise | IA Assistant Entreprise |
| `SECTOR_HEALTH` | Opérations cliniques et administratives Health | Patients, rendez-vous, consultations, laboratoire, etc. |
| `SECTOR_PHARMACY` | Opérations pharmacie | Produits, lots, stock, ventes, caisse, etc. |
| `ADMINISTRATION` | Gouvernance du tenant | Sections de `/enterprise-admin`, jamais navigation ERP autonome |
| `COMMERCIAL` | Domaine futur | Non affiché tant qu’aucun module actif ne l’alimente |
| `HUMAN_RESOURCES` | Domaine futur client | Non affiché dans cette itération |
| `PROJECTS_ASSETS` | Domaine futur | Non affiché dans cette itération |

## Groupes de navigation

La navigation n’est générée qu’après résolution d’accès :

- Opérations
- Achats & ressources
- Finances
- Intelligence
- Secteur Health, uniquement pour `HEALTH_CARE`
- Secteur Pharmacy, uniquement pour `PHARMACY`

L’administration possède une entrée unique. Les groupes sans module actif autorisé n’apparaissent pas.

## Rendu des workspaces

### Core dédié

Les workspaces Core v2 restent explicites : tâches, demandes, validations, réunions, documents, fournisseurs/achats, finance, rapports, workflows et IA.

### Health et Pharmacy

`components/enterprise/enterprise-sector-module-workspace.tsx` fournit une allow-list statique. La route générique résout le code canonique puis monte uniquement le composant déclaré dans le code.

Les modules Health beta peuvent lire les records sectoriels historiques autorisés. Aucun CRUD générique n’est réintroduit pour les domaines déjà dédiés.

## Frontière des prochaines itérations

Cette fondation ne crée pas :

- grand livre ou plan comptable ;
- comptes clients/fournisseurs communs ;
- nouvelle facture commune ;
- migration des ventes Pharmacy vers Finance ;
- migration de la facturation Health ;
- nouveau CRM, RH client, Projects ou Assets ;
- suppression des modèles ou migrations historiques.

L’itération 2 pourra s’appuyer sur le registre sans créer de second catalogue. L’itération 3 traitera la convergence financière. L’itération 4 traitera la convergence Health/Pharmacy. L’itération 5 traitera la migration legacy et la stabilisation finale.
