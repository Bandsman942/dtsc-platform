# Tests E2E manuels — Professionnalisation ERP, itération 6

**Branche de préparation :** `feat/erp-professionalization-iteration-06-sector-harmonization`  
**Environnement cible :** Vercel Production provenant exclusivement de `main`  
**Statut global :** NON_EXÉCUTÉ

> **Tests E2E manuels préparés — validation du propriétaire en attente.**

Aucun scénario de ce document ne doit être marqué réussi par une automatisation ou par Codex. Le propriétaire renseigne le résultat réel après exécution authentifiée en Production.

## Comptes et rôles à préparer

- Propriétaire DTSC Platform.
- Administrateur d’une entreprise Health.
- Médecin.
- Laborantin.
- Utilisateur Finance Health.
- Patient lié à un compte DTSC.
- Utilisateur d’une autre entreprise.
- Administrateur d’une entreprise Pharmacy.
- Pharmacien.
- Caissier Pharmacy.
- Magasinier / responsable stock.
- Validateur indépendant.

## Données de test

Créer des données clairement préfixées `E2E-I06-` : patient, rendez-vous, consultation, demande de laboratoire, assureur, facture, paiement, produit, lot vendable, lot expiré, prescription, caisse, vente, retour, rappel et inventaire.

Après la campagne, archiver ou conserver les données selon la politique métier. Ne jamais supprimer un historique financier, clinique ou de stock confirmé.

---

## I06-H-001 — Patient et relation DTSC

| Champ | Contenu |
|---|---|
| Identifiant | I06-H-001 |
| Module | Patients / Relations avec les entreprises |
| Secteur | Health |
| Objectif | Vérifier la création indépendante d’un patient et le consentement explicite |
| Entreprise | Entreprise Health de test |
| Compte | Admin Health puis patient global |
| Rôle | Admin Health / utilisateur standard |
| Préconditions | Module Patients actif ; deux comptes disponibles |
| Étapes | 1. Créer `E2E-I06-Patient` sans compte DTSC. 2. Proposer une liaison. 3. Se connecter avec le patient global. 4. Ouvrir Relations avec les entreprises. 5. Accepter. 6. Vérifier la relation ACTIVE. 7. Révoquer. 8. Vérifier le retrait des accès dérivés et la conservation du dossier patient. |
| Résultat attendu | Dossier créé sans compte ; consentement obligatoire ; relation active puis révoquée ; aucune suppression du patient ; aucun accès médical automatique |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-H-002 — Rendez-vous et consultation

| Champ | Contenu |
|---|---|
| Identifiant | I06-H-002 |
| Module | Rendez-vous / Consultations / Dossier médical |
| Secteur | Health |
| Objectif | Valider le cycle rendez-vous → consultation → clôture |
| Entreprise | Entreprise Health de test |
| Compte | Médecin et accueil |
| Rôle | Réceptionniste / médecin |
| Préconditions | Patient et praticien actifs |
| Étapes | 1. Créer le rendez-vous. 2. Confirmer. 3. Enregistrer l’arrivée. 4. Ouvrir une consultation. 5. Saisir constantes, examen, diagnostic de test et conduite à tenir. 6. Clôturer. 7. Tenter une modification silencieuse. 8. Vérifier l’historique. |
| Résultat attendu | Transition cohérente ; consultation unique ; modification silencieuse refusée ; correction/reouverture auditée |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-H-003 — Laboratoire et résultat critique

| Champ | Contenu |
|---|---|
| Identifiant | I06-H-003 |
| Module | Laboratoire / Notifications |
| Secteur | Health |
| Objectif | Vérifier le parcours laboratoire, la double intervention et la notification sécurisée |
| Entreprise | Entreprise Health de test |
| Compte | Prescripteur, laborantin, validateur |
| Rôle | Médecin / laboratoire |
| Préconditions | Patient et consultation disponibles |
| Étapes | 1. Créer la demande. 2. Enregistrer le prélèvement. 3. Saisir un résultat critique de test. 4. Faire vérifier et valider par un autre utilisateur. 5. Consulter la notification depuis un écran non clinique. 6. Ouvrir le lien profond. |
| Résultat attendu | Résultat validé immuable ; alerte critique auditée ; notification générique sans contenu clinique ; lien profond protégé |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-H-004 — Facturation médicale et assurance

| Champ | Contenu |
|---|---|
| Identifiant | I06-H-004 |
| Module | Facturation médicale / Assurance / Paiements / Comptabilité |
| Secteur | Health |
| Objectif | Vérifier facture commune unique, ventilation et allocations |
| Entreprise | Entreprise Health de test |
| Compte | Facturation Health, Finance, validateur |
| Rôle | Agent facturation / Finance |
| Préconditions | Services facturables, assureur, patient et consultation disponibles |
| Étapes | 1. Créer une prestation. 2. Générer la facture. 3. Ventiler part patient et assurance. 4. Enregistrer un paiement patient. 5. Enregistrer un paiement assureur. 6. Confirmer les allocations. 7. Vérifier le solde et l’écriture comptable. 8. Rechercher un éventuel doublon. |
| Résultat attendu | Une seule facture commune ; total = patient + assurance + autre ; deux paiements communs correctement alloués ; une seule écriture par événement |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-H-005 — Confidentialité Health

| Champ | Contenu |
|---|---|
| Identifiant | I06-H-005 |
| Module | Tous modules Health |
| Secteur | Health |
| Objectif | Vérifier la minimisation et l’isolation des données cliniques |
| Entreprise | Entreprise Health de test et autre tenant |
| Compte | Médecin, laboratoire, Finance, patient lié, utilisateur standard, autre tenant |
| Rôle | Plusieurs rôles |
| Préconditions | Patient, consultation, résultat, facture et document médical existants |
| Étapes | Tester la même URL et les liens profonds avec chaque rôle ; tenter le téléchargement du document ; inspecter les notifications ; tester après révocation ; tenter un identifiant de l’autre tenant. |
| Résultat attendu | Chaque acteur ne voit que son périmètre ; Finance ne voit aucune donnée clinique inutile ; autre tenant refusé ; document privé ; notification verrouillée générique |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-P-001 — Produit, catalogue commun et lot

| Champ | Contenu |
|---|---|
| Identifiant | I06-P-001 |
| Module | Produits / Lots / Stock |
| Secteur | Pharmacy |
| Objectif | Vérifier le référentiel spécialisé relié au catalogue commun |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Admin Pharmacy / responsable stock |
| Rôle | Pharmacien / magasinier |
| Préconditions | Modules actifs, site et entrepôt disponibles |
| Étapes | 1. Créer `E2E-I06-Produit` avec DCI, dosage, forme et règles. 2. Vérifier le lien catalogue. 3. Créer ou réceptionner un lot vendable. 4. Vérifier péremption, emplacement et stock. |
| Résultat attendu | Un produit Pharmacy et un article commun reliés sans doublon ; lot traçable ; quantité disponible exacte |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-P-002 — Prescription, FEFO et dispensation

| Champ | Contenu |
|---|---|
| Identifiant | I06-P-002 |
| Module | Prescriptions / Ventes / Stock / Paiements |
| Secteur | Pharmacy |
| Objectif | Valider la dispensation complète et les sources communes |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Prescripteur, pharmacien, caissier |
| Rôle | Pharmacien / caissier |
| Préconditions | Produit, deux lots vendables avec péremptions différentes, caisse ouverte |
| Étapes | 1. Créer la prescription. 2. Faire valider par le pharmacien. 3. Rechercher le produit. 4. Vérifier la proposition FEFO. 5. Encaisser. 6. Remettre le reçu. 7. Vérifier stock, facture, paiement, allocation et écriture. |
| Résultat attendu | Lot le plus proche choisi ; une seule sortie stock ; une facture, un paiement et une écriture communs uniques |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-P-003 — Lot expiré et lot bloqué

| Champ | Contenu |
|---|---|
| Identifiant | I06-P-003 |
| Module | Lots / Ventes |
| Secteur | Pharmacy |
| Objectif | Vérifier les blocages réglementaires |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Pharmacien / caissier |
| Rôle | Pharmacy |
| Préconditions | Lot expiré de test et lot en quarantaine ou rappelé |
| Étapes | 1. Tenter une vente du lot expiré. 2. Tenter une vente du lot bloqué. 3. Examiner les messages et l’historique. |
| Résultat attendu | Deux refus explicites en français ; aucune sortie, facture ou paiement créé ; tentative auditée |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-P-004 — Caisse et retour

| Champ | Contenu |
|---|---|
| Identifiant | I06-P-004 |
| Module | Caisse / Ventes / Retours / Comptabilité |
| Secteur | Pharmacy |
| Objectif | Vérifier la session commune, le retour et la validation indépendante |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Caissier puis validateur |
| Rôle | Caissier / superviseur |
| Préconditions | Caisse commune disponible et produit vendable |
| Étapes | 1. Ouvrir la caisse. 2. Effectuer plusieurs ventes. 3. Enregistrer un retour autorisé. 4. Compter. 5. Clôturer. 6. Faire valider par un autre utilisateur. 7. Vérifier écritures et stock. |
| Résultat attendu | Session commune unique ; retour traçable ; stock corrigé une fois ; aucune auto-validation interdite ; écritures non dupliquées |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-P-005 — Rappel de lot

| Champ | Contenu |
|---|---|
| Identifiant | I06-P-005 |
| Module | Alertes / Lots / Qualité |
| Secteur | Pharmacy |
| Objectif | Vérifier le traitement opérationnel d’un rappel |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Responsable qualité / pharmacien |
| Rôle | Qualité Pharmacy |
| Préconditions | Lot actif et stock disponible |
| Étapes | 1. Créer le rappel. 2. Bloquer le lot. 3. Tenter une vente. 4. Vérifier les notifications génériques. 5. Documenter les actions. 6. Clôturer le rappel. |
| Résultat attendu | Vente impossible ; lot et mouvements traçables ; responsables notifiés ; clôture auditée |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-P-006 — Inventaire mobile

| Champ | Contenu |
|---|---|
| Identifiant | I06-P-006 |
| Module | Stock & inventaire |
| Secteur | Pharmacy |
| Objectif | Vérifier le parcours téléphone et l’ajustement unique |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Magasinier / validateur |
| Rôle | Stock |
| Préconditions | Téléphone 320–412 px, produit et lot disponibles |
| Étapes | 1. Ouvrir un inventaire. 2. Rechercher ou scanner. 3. Saisir les quantités. 4. Constater un écart. 5. Justifier. 6. Faire valider. 7. Vérifier l’ajustement. |
| Résultat attendu | Aucun débordement ; clavier utilisable ; lot confirmé ; un seul ajustement ; historique conservé |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## I06-X-001 — Navigation, français, mobile et liens profonds

| Champ | Contenu |
|---|---|
| Identifiant | I06-X-001 |
| Module | Navigation globale et sectorielle |
| Secteur | Transversal |
| Objectif | Vérifier l’expérience DTSC unifiée |
| Entreprise | Health puis Pharmacy |
| Compte | Admin et utilisateur standard |
| Rôle | Plusieurs rôles |
| Préconditions | Modules actifs et notifications disponibles |
| Étapes | Tester desktop, tablette, 320, 360, 390 et 412 px ; vérifier ordre canonique, icônes, état actif, rail horizontal, clavier, dialogs, retour arrière, Relations avec les entreprises sans tenant actif, absence d’anglais, enum brute, UUID et module fantôme ; ouvrir plusieurs notifications. |
| Résultat attendu | Navigation cohérente, module actif visible, liens profonds précis, aucun débordement global, aucun identifiant technique ou texte anglais en français |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## Décision après campagne

- Tout scénario réussi est daté et signé par le propriétaire.
- Tout scénario échoué ou bloqué crée un ticket correctif et une PR dédiée.
- Les modules restent `PROFESSIONAL_READY` jusqu’à confirmation explicite de la campagne.
- La promotion `COMMERCIAL_READY` se fait uniquement dans une PR séparée : `chore: promote manually validated ERP modules to commercial ready`.
