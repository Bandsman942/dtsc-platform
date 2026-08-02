# Guide utilisateur — Professionnalisation ERP, itération 6

**Version :** 1.0  
**Date :** 3 août 2026  
**Périmètre :** extensions Health et Pharmacy de DTSC Platform

## 1. Principes communs

Les modules Health et Pharmacy utilisent l’expérience DTSC commune : en-tête métier, indicateurs, recherche, filtres, listes structurées, détail, actions contextuelles, formulaires responsives et historique. Les données restent isolées dans l’entreprise active.

Une fiche métier peut exister sans compte DTSC. Une liaison avec un compte global exige un consentement explicite dans **Relations avec les entreprises** et ne donne aucun accès médical, financier ou administratif automatique.

Sur téléphone, le parcours recommandé est : liste → détail plein écran → formulaire plein écran → retour. Les formulaires longs sont organisés par sections et les identifiants techniques ne sont jamais demandés à l’utilisateur.

## 2. Health

### Patients

1. Ouvrir **Patients**.
2. Rechercher un patient par nom, téléphone ou numéro patient.
3. Cliquer sur **Nouveau patient**.
4. Renseigner l’identité, les coordonnées, le contact d’urgence et les informations autorisées.
5. Enregistrer, puis utiliser le menu d’actions pour créer un rendez-vous, ouvrir une consultation, ajouter un document ou consulter le dossier médical.

Un patient peut être créé sans compte DTSC. L’archivage conserve l’historique. Les informations sensibles ne sont visibles qu’avec la permission appropriée.

### Rendez-vous

1. Sélectionner le patient, le praticien, le service, le site, la date et l’heure.
2. Définir la priorité et le statut.
3. Confirmer l’arrivée, reporter, annuler ou marquer l’absence selon le cycle disponible.
4. Convertir le rendez-vous en consultation une seule fois.

Les notifications restent génériques et ouvrent l’objet précis après contrôle d’accès.

### Consultations

Le formulaire regroupe le motif, les antécédents utiles, les allergies, les constantes vitales, l’examen, les diagnostics, les actes, les prescriptions, les examens demandés, la conduite à tenir et le suivi.

Une consultation clôturée n’est pas modifiée silencieusement. Toute réouverture ou correction autorisée est historisée.

### Dossiers médicaux

Le dossier médical présente une vue longitudinale : consultations, allergies, traitements, alertes, résultats, documents et notes confidentielles selon les permissions. Le journal d’accès aux données sensibles n’est disponible qu’aux rôles autorisés.

### Équipe médicale

Créer ou lier les praticiens, spécialités, services, sites, disponibilités, qualifications et documents. La révocation d’une liaison DTSC ne supprime pas la fiche métier et ne partage jamais automatiquement les données RH privées.

### Laboratoire

Le parcours est : demande → prélèvement → analyse → résultat → vérification → validation → publication. Un résultat critique est signalé et audité, mais son contenu n’apparaît pas dans une notification non sécurisée.

### Pharmacie interne

La dispensation suit : prescription → vérification → disponibilité → lot FEFO → validation → dispensation → mouvement de stock → facturation éventuelle. Le catalogue, les lots, le stock et les paiements communs sont réutilisés.

### Facturation médicale et assurances

Une facture médicale possède une facture commune unique. Le total est ventilé entre part patient, part assurance et autre prise en charge. Les paiements patient et assureur utilisent le moteur commun et le statut payé dépend des allocations confirmées.

Finance voit les références, montants, échéances et paiements nécessaires, jamais les diagnostics, observations, résultats ou notes cliniques inutiles.

### Incidents qualité et documents médicaux

Les incidents suivent déclaration, qualification, gravité, analyse, actions correctives, vérification et clôture. Les documents médicaux utilisent un véritable upload privé, sont versionnés, prévisualisables, téléchargeables via une route contrôlée et restent inaccessibles à Finance.

## 3. Pharmacy

### Produits

1. Ouvrir **Produits & médicaments**.
2. Créer un produit par sections : identification, classification pharmaceutique, réglementation, stockage, tarification, documents et statut.
3. Renseigner notamment le nom commercial, la DCI, la forme, le dosage, la voie, les règles de prescription, le contrôle renforcé et les conditions de conservation.

Le produit Pharmacy est relié au catalogue commun lorsque requis.

### Lots

Créer ou recevoir un lot avec numéro, fournisseur, réception, quantité, fabrication, péremption, emplacement, quarantaine, rappel et documents. Les actions de quarantaine, libération, blocage, rappel et destruction restent auditées.

### Stock et inventaire

Les vues couvrent le stock par produit, lot, site et emplacement, ainsi que les mouvements, inventaires, écarts et blocages. Sur mobile : choisir le périmètre, scanner ou rechercher, saisir la quantité, confirmer le lot, justifier l’écart, faire approuver et ajuster une seule fois.

### Réceptions

Le parcours réutilise la commande fournisseur commune : commande → réception → contrôle → lots → péremption → emplacement → validation → entrée de stock. Une réception ne crée qu’un seul mouvement et un seul lien financier.

### Dispensation et ventes

1. Rechercher le patient ou client et la prescription.
2. Ajouter les produits.
3. Laisser le système proposer les lots FEFO vendables.
4. Vérifier les avertissements et la validation pharmacien.
5. Encaisser et remettre le reçu.

Les lots expirés, rappelés, bloqués ou en quantité insuffisante ne peuvent pas être vendus. Une vente utilise une facture, un paiement, une caisse et une comptabilisation communs uniques.

### Prescriptions

Renseigner patient, prescripteur, date, validité, produit, dose, fréquence, durée, quantité, instructions, documents et statut. Le contenu clinique n’est pas exposé aux utilisateurs Finance non autorisés.

### Fournisseurs et achats

La vue Pharmacy enrichit les tiers, fournisseurs, commandes et réceptions communs avec licences, spécialités, qualité, température, délais et documents réglementaires. Elle ne recrée aucun fournisseur financier parallèle.

### Caisse

Ouvrir une session commune, effectuer les ventes, enregistrer les retours autorisés, compter, clôturer et faire valider par une autre personne lorsque requis. Le statut payé dépend d’un paiement et d’une allocation confirmés.

### Retours, pertes, alertes et pharmacovigilance

Toute opération confirmée est corrigée par un mouvement inverse ou une procédure contrôlée, jamais par réécriture silencieuse. Les alertes sont traitées comme une file opérationnelle : nouvelle, prise en charge, en cours, résolue, classée.

La pharmacovigilance minimise les données patient et reste inaccessible à Finance et aux rôles non autorisés.

### Documents, rapports et paramètres

Les documents réglementaires utilisent un upload réel, des versions, des dates d’expiration et des alertes. Les rapports financiers utilisent les sources communes ; les rapports réglementaires utilisent les extensions Pharmacy sans double comptage.

Les paramètres critiques expliquent leur effet, leur date d’effet et leur historique, et exigent permission, confirmation, audit et éventuellement double validation.

## 4. Aide, permissions et support

Chaque module indique la première action, les permissions requises, les limites connues et le chemin de support. Lorsqu’une action est refusée, le message explique le problème, la raison et l’action possible.

## 5. Statut commercial

Les modules sectoriels actifs sont évalués **PROFESSIONAL_READY**. Ils ne sont pas `COMMERCIAL_READY` tant que les scénarios authentifiés en Production n’ont pas été validés manuellement par le propriétaire et qu’une PR de promotion commerciale séparée n’a pas été fusionnée.

**Tests E2E manuels préparés — validation du propriétaire en attente.**
