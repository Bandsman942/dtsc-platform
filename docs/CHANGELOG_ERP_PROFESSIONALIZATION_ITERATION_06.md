# Changelog — Professionnalisation ERP, itération 6

## 3 août 2026

### Ajouté

- manifeste de maturité `module-commercial-readiness-iteration-06.json` pour 25 modules Health/Pharmacy ;
- résolution de ces modules au niveau `PROFESSIONAL_READY` avec `commercializable: false` ;
- gate `qa-erp-professional-iteration-06-sector-checks.mjs` ;
- guide utilisateur sectoriel ;
- campagnes E2E manuelles itération 6 et programme final ;
- audit final de professionnalisation ;
- matrice de préparation commerciale ;
- rapport de clôture technique ;
- contrats UX, confidentialité et packaging sectoriels ;
- documentation dédiée des modules Health et Pharmacy demandés.

### Complément — guides contextuels spécialisés

- ajout d’un guide utilisateur exact pour chacun des 25 codes canoniques Health et Pharmacy ;
- exposition du bouton **Guide utilisateur** dans chaque workspace spécialisé, selon la même logique que les modules Core et Finance ;
- ajout des prérequis, procédures, statuts, contrôles, dépannage et limites réellement supportées ;
- ajout de liens directs entre les modules qui participent au même parcours métier ;
- ajout d’un retour direct du centre d’aide vers le module consulté ;
- conservation du contexte patient lors des parcours Patients → Rendez-vous, Patients → Consultations et Patients → Dossier médical ;
- renforcement de la QA afin qu’un module spécialisé sans guide, sans bouton d’aide ou sans contexte patient fasse échouer la régression.

### Confirmé

- les workspaces actifs Health et Pharmacy sont dédiés ;
- les surfaces génériques Health sans contrat professionnel restent masquées ;
- les dépendances sectorielles convergent vers catalogue, achats, stock, créances, dettes, paiements et caisse communs ;
- Relations avec les entreprises reste un module global ;
- les historiques `EnterpriseCoreRecord`, `EnterpriseSectorRecord` et `EnterpriseWorkflow` restent en lecture seule.

### Sécurité

- aucune donnée clinique inutile n’est promue vers Finance ;
- les documents médicaux restent sous contrôle Health ;
- les documents réglementaires restent sous contrôle Pharmacy ;
- les notifications sensibles restent génériques ;
- les relations DTSC exigent un consentement et ne donnent aucun accès automatique.

### Non modifié

- aucune migration historique ;
- aucun changement de base de données ou d’authentification ;
- aucun nouveau moteur Finance, stock, caisse, catalogue ou fournisseur ;
- aucun déploiement manuel Vercel depuis la branche.

### Statut

**Tests E2E manuels préparés — validation du propriétaire en attente.**

Aucun module de l’itération 6 n’est promu vers `COMMERCIAL_READY` dans cette PR.
