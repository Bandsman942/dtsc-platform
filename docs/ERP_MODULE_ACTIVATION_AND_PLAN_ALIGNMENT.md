# Activation des modules ERP, offres et navigation

## Objectif

Ce contrat garantit qu’un module visible, activé et facturé correspond à un service réellement disponible pour l’entreprise sélectionnée.

L’autorité reste le registre canonique. Une ligne `EnterpriseModule` configure un tenant, mais ne peut jamais contourner :

```text
statut du module
→ secteur de l’entreprise
→ offre souscrite
→ abonnement actif
→ prérequis du module
→ permissions de l’utilisateur
```

## Activation sécurisée

L’activation manuelle passe par `activateEnterpriseModule`.

Elle :

1. résout le code canonique et les anciens aliases ;
2. parcourt les prérequis dans un ordre déterministe ;
3. refuse les cycles de dépendances ;
4. vérifie le secteur, l’offre et l’abonnement ;
5. active le module et ses prérequis dans une transaction ;
6. journalise tous les modules concernés.

La désactivation est refusée lorsqu’un autre module actif dépend encore du service demandé.

## Réconciliation avec l’abonnement

`reconcileOrganizationModulesWithSubscription` aligne les modules lors :

- de la création d’un abonnement ;
- d’une modification ou d’un renouvellement ;
- d’une activation, suspension, annulation ou expiration ;
- de l’ouverture autorisée de l’administration entreprise, afin de corriger les anciens tenants.

La réconciliation :

- crée les lignes canoniques manquantes ;
- actualise libellés, descriptions, icônes, ordre et niveau d’offre ;
- active les modules réellement inclus et leurs prérequis ;
- désactive les aliases dupliqués ;
- désactive les anciennes lignes inconnues comme `NOTIFICATIONS` sans supprimer l’historique ;
- désactive les services hors secteur, hors offre ou non commercialisés.

Elle ne crée aucune donnée métier, facture, écriture comptable ou mouvement de stock.

## Offres commerciales

### Essentiel

Pour les petites structures et équipes qui démarrent leur gestion numérique.

Couverture : référentiels de base, clients, catalogue, documents, demandes, rapports simples et premiers projets.

### Professionnel

Pour les PME structurées avec ventes, achats, stocks, équipes et trésorerie opérationnelle.

Couverture : opérations de bout en bout, CRM, commandes, achats, inventaire, ressources humaines, workflows, comptabilité courante, créances, dettes, paiements, caisse et trésorerie.

### Entreprise

Pour les organisations multisites, les secteurs réglementés et les directions ayant besoin d’une gouvernance avancée.

Couverture : fiscalité avancée, rapprochement bancaire, clôture, états financiers, immobilisations, valorisation du stock, paie avancée et extensions Health/Pharmacy.

Les prix restent configurables dans Administration DTSC. Les identifiants de plan et la frontière des modules restent gouvernés par le code pour éviter une divergence entre marketing, facturation et contrôle d’accès.

## Ordre de navigation

L’ordre commun est :

1. Opérations
2. Ventes & relation client
3. Achats & ressources
4. Ressources humaines
5. Projets & actifs
6. Finances
7. Secteur Health ou Pharmacy
8. Intelligence
9. Administration

Le même comparateur est utilisé par :

- la navigation desktop ;
- le hub des modules ERP ;
- la navigation mobile ;
- la section Modules de l’administration entreprise.

## Navigation mobile

La navigation basse possède :

- une ligne principale pour les fonctions quotidiennes ;
- une seconde ligne horizontale avec icônes pour les modules et services complémentaires.

Le module correspondant à la route active :

- porte `aria-current="page"` ;
- utilise un style sélectionné ;
- est recentré automatiquement dans le rail horizontal.

## Langue de l’interface

En français :

- les codes techniques ne sont pas utilisés comme titres ;
- les statuts et erreurs sont reformulés en langage commercial ;
- les offres sont affichées comme Essentiel, Professionnel et Entreprise ;
- Health/Pharmacy ne remplacent pas les libellés français lorsqu’une traduction existe.

Lorsque la langue utilisateur est l’anglais, les traductions anglaises restent utilisées.

## QA

```bash
pnpm qa:erp-module-experience
```

Le contrôle vérifie :

- activation des prérequis ;
- protection des modules dépendants ;
- réconciliation abonnement/secteur ;
- nettoyage des aliases ;
- ordre partagé ;
- surveillance mobile ;
- catalogue commercial ;
- capacité maximale de chaque offre ;
- absence de dépendance vendue dans une offre supérieure à son module parent.

Ce contrôle est intégré à `pnpm qa:regression`.
