# Tests E2E manuels — Professionnalisation ERP — Itération 03

## Statut global post-correctif

**Tests E2E manuels préparés — validation du propriétaire en attente**

- Campagne initiale du propriétaire : exécutée ; elle a produit les constats ayant déclenché la PR de durcissement commercial.
- Campagne post-correctif : `NON_EXÉCUTÉ`.
- Statuts possibles : `NON_EXÉCUTÉ`, `RÉUSSI`, `ÉCHOUÉ`, `BLOQUÉ`.
- Testeur attendu : propriétaire de DTSC Platform ou personne explicitement mandatée.
- Environnement attendu : Vercel Production après fusion dans `main`.
- Interdiction : ne jamais remplacer un résultat réel par une supposition issue des tests automatisés.

## Données de preuve obligatoires

Pour chaque scénario, renseigner :

| Champ | Valeur |
|---|---|
| Identifiant | Voir scénario |
| Domaine | Voir scénario |
| Compte utilisé | À renseigner |
| Rôle | À renseigner |
| Entreprise | À renseigner |
| Résultat réel | À renseigner après exécution |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Captures ou preuves | À joindre |
| Ticket correctif | À créer si ÉCHOUÉ ou BLOQUÉ |

---

## E2E-03-HARD-MOBILE-001 — Rails tactiles, filtres et densité

- **Objectif :** vérifier les défauts mobiles remontés sur les captures du propriétaire.
- **Appareils :** Samsung Internet ou Chrome Android à 320, 360, 390 et 412 px ; tablette ; desktop.
- **Étapes :**
  1. Ouvrir chacun des modules professionnels des itérations 1, 2 et 3.
  2. Faire glisser horizontalement chaque rail de filtres ou d’onglets en commençant le geste sur un bouton.
  3. Vérifier que l’onglet actif est automatiquement recentré.
  4. Vérifier l’absence de chevauchement entre recherche, onglets et listes déroulantes.
  5. Ouvrir une ligne comportant un statut et une action.
  6. Vérifier que son titre reste lisible sur plusieurs mots et ne devient pas une colonne d’une lettre.
  7. Vérifier que statut, métadonnées et actions utilisent la largeur disponible sans débordement.
  8. Ouvrir le clavier mobile dans chaque formulaire.
- **Résultat attendu :** rails mobiles réellement manipulables, contenu compact, aucun mot cassé verticalement, aucun débordement horizontal et aucun filtre superposé.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-REL-001 — Relations avec les entreprises

- **Préconditions :** compte standard sans organisation active, une invitation reçue et une entreprise cible connue par son code.
- **Étapes :**
  1. Vérifier le lien dans les navigations desktop et mobile.
  2. Ouvrir le module sans organisation active.
  3. Faire défiler les vues À traiter, Relations actives, Mes demandes et Historique.
  4. Vérifier l’état actif et le badge borné aux décisions réellement attendues.
  5. Ouvrir **Mes demandes**.
  6. Saisir le code entreprise, le type de relation et un message.
  7. Soumettre la demande puis l’annuler lorsque son état le permet.
  8. Accepter ou refuser une invitation reçue.
  9. Révoquer une relation active.
  10. Vérifier qu’aucun annuaire public d’entreprises ou d’employés n’est exposé.
- **Résultat attendu :** quatre vues accessibles, formulaire visible, demande persistée, consentement contrôlé et absence d’annuaire public.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-CONTRACT-001 — Contrat, validateur assigné, correction et commentaires

- **Préconditions :** demandeur et validateur distincts, partie métier active.
- **Étapes :**
  1. Créer un contrat et sélectionner le validateur.
  2. Soumettre le contrat.
  3. Se connecter avec le validateur sélectionné.
  4. Ouvrir la notification profonde et vérifier le badge « Votre décision est requise ».
  5. Vérifier les actions Approuver, Demander une correction et Refuser.
  6. Demander une correction avec un motif obligatoire.
  7. Vérifier le retour du contrat en brouillon et la notification du demandeur.
  8. Ajouter un commentaire comme validateur, le modifier puis le supprimer.
  9. Ajouter un commentaire comme demandeur, le modifier puis le supprimer.
  10. Vérifier qu’un autre utilisateur ne peut ni modifier ni supprimer ces commentaires.
  11. Corriger puis soumettre de nouveau.
  12. Approuver avec le validateur assigné.
  13. Vérifier qu’un utilisateur non assigné ne peut pas décider.
- **Résultat attendu :** décision réservée au validateur assigné, correction traçable, commentaires CRUD auteur uniquement et historique conservé.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-DOC-001 — Document réel lié au contrat

- **Étapes :**
  1. Depuis le détail du contrat, toucher « Téléverser ou ouvrir les documents liés ».
  2. Vérifier que le contrat, sa référence et le type CONTRACT sont préremplis.
  3. Créer les métadonnées documentaires.
  4. Téléverser un fichier PDF ou image réel.
  5. Vérifier la création de la première version privée.
  6. Télécharger la version via une URL signée.
  7. Ajouter une nouvelle version.
  8. Vérifier le lien au contrat et l’isolation par entreprise.
- **Résultat attendu :** fichier réel versionné, privé, téléchargeable et relié au contrat ; aucune demande de chemin technique à l’utilisateur.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-SALES-001 — Devis, commande et livraisons

- **Préconditions :** client actif, article ou service actif, stock si nécessaire.
- **Étapes :** créer un devis avec taxe et remise ; vérifier le calcul serveur ; envoyer ; accepter ; convertir ; livrer partiellement ; vérifier le reliquat ; livrer le solde ; rejouer la clé idempotente ; tenter de dépasser le commandé.
- **Résultat attendu :** transitions cohérentes, calculs exacts, reliquats exacts, dépassement refusé et mouvements uniques.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-PROC-001 — Achats et réception

- **Préconditions :** fournisseur, entrepôt et approbateur distinct actifs.
- **Étapes :** créer la demande ; faire approuver ; créer la commande ; réceptionner partiellement puis totalement ; vérifier le stock ; vérifier les écarts et les documents.
- **Résultat attendu :** réception idempotente et aucune facture ou dette créée implicitement.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-INV-001 — Transfert, inventaire et ajustement

- **Préconditions :** deux entrepôts, article suivi, quantité suffisante.
- **Étapes :** créer un transfert ; sélectionner l’approbateur ; valider ; vérifier le mouvement ; créer un inventaire ; saisir un écart ; valider ; créer un ajustement ; tenter une sortie négative.
- **Résultat attendu :** approbation assignée, historique complet et stock négatif refusé.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-HR-001 — Collaborateur et relation DTSC

- **Étapes :** créer un dossier sans compte ; ajouter poste, département et contrat ; inviter le compte DTSC ; accepter dans Relations ; vérifier les accès ; révoquer ; vérifier la conservation du dossier RH.
- **Résultat attendu :** fiche RH distincte du compte, consentement explicite et confidentialité conservée.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-TIME-001 — Congé et feuille de temps

- **Étapes :** soumettre un congé ; traiter comme validateur ; vérifier le calendrier ; tenter un chevauchement ; créer une feuille de temps ; soumettre ; demander une correction ; corriger ; approuver.
- **Résultat attendu :** chevauchements bloqués, correction traçable et distinction entre temps déclaré, approuvé et paie.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-PAY-001 — Paie et bulletins

- **Étapes :** créer une période ; préparer la population ; ajouter prime et retenue ; contrôler les anomalies ; soumettre à un approbateur distinct ; tenter l’auto-approbation ; approuver ; consulter le bulletin privé ; annuler une paie de test ; recréer la même période ; vérifier l’absence de paiement automatique.
- **Résultat attendu :** auto-approbation interdite, bulletins isolés, recréation possible et paiement distinct.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-PROJ-001 — Projet, équipe, jalon, risque et livrable

- **Étapes :** créer un projet ; ajouter une équipe ; créer jalon et risque ; saisir du temps ; créer un livrable ; soumettre ; demander une correction ; soumettre une nouvelle révision ; approuver.
- **Résultat attendu :** historique et révisions conservés, validation assignée et aucun accès client automatique.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-ASSET-001 — Actif, affectation, incident et maintenance

- **Étapes :** créer un actif ; affecter ; tenter une seconde affectation ; déclarer un incident ; planifier, démarrer et terminer une maintenance ; enregistrer le retour ; vérifier l’historique.
- **Résultat attendu :** double affectation refusée, historique intact et aucune immobilisation comptable automatique.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-GUIDE-001 — Guide dédié par module

- **Étapes :** depuis chaque module, ouvrir Guide utilisateur ; vérifier le titre ; vérifier prérequis, procédure, statuts, contrôles et dépannage ; utiliser retour arrière.
- **Résultat attendu :** chaque lien ouvre le guide du bon module et jamais celui d’un autre module.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-SUPPORT-001 — Support mobile actif et centré

- **Étapes :** ouvrir Support depuis le rail secondaire ; vérifier la surbrillance ; vérifier que l’élément actif est recentré ; ouvrir une sous-route Support ; revenir en arrière.
- **Résultat attendu :** Support reste actif et visible malgré son URL absolue.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-VOICE-001 — Microphone et message vocal

- **Appareils :** au minimum Samsung Internet Android et un second navigateur compatible.
- **Étapes :**
  1. Autoriser le microphone.
  2. Enregistrer puis annuler un vocal.
  3. Enregistrer et envoyer un vocal.
  4. Lire le vocal sur un autre compte.
  5. Refuser temporairement la permission et vérifier le message actionnable.
  6. Réactiver la permission et recommencer.
  7. Tester pendant qu’une autre application utilise le micro.
  8. Vérifier qu’aucune piste micro ne reste active après arrêt ou fermeture.
- **Résultat attendu :** demande de permission réelle, enregistrement et lecture fonctionnels, erreurs explicites et libération du micro.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-RECEIPT-001 — Envoi, réception et lecture de groupe

- **Préconditions :** groupe de trois membres actifs.
- **Étapes :** envoyer un message ; vérifier un trait ; connecter les autres membres et vérifier deux traits ; ouvrir le message avec tous les membres et vérifier deux traits verts ; ouvrir Infos du message et comparer les heures de lecture.
- **Résultat attendu :** un trait après persistance serveur, deux traits lorsque tous les membres actifs l’ont reçu, deux traits verts lorsque tous l’ont lu.
- **Statut :** `NON_EXÉCUTÉ`

## Traitement d’un échec

```text
défaut documenté
→ branche corrective
→ Pull Request
→ GitHub Quality Gates
→ fusion dans main
→ déploiement Production unique
→ nouveau test manuel ciblé
```

Le rapport ne doit afficher « Tests E2E réussis » qu’après confirmation explicite et documentée du propriétaire pour la campagne post-correctif.
