# Tests E2E manuels — Professionnalisation ERP — Itération 03

## Statut global

**Tests E2E manuels préparés — validation du propriétaire en attente**

- Statut autorisé avant exécution : `NON_EXÉCUTÉ`
- Statuts possibles : `NON_EXÉCUTÉ`, `RÉUSSI`, `ÉCHOUÉ`, `BLOQUÉ`
- Testeur attendu : propriétaire de DTSC Platform ou personne explicitement mandatée
- Environnement attendu : Vercel Production après fusion dans `main`
- Interdiction : ne jamais remplacer un résultat réel par une supposition issue des tests automatisés

## Données de preuve obligatoires

Pour chaque scénario, renseigner :

| Champ | Valeur |
|---|---|
| Identifiant | Voir scénario |
| Domaine | Voir scénario |
| Objectif | Voir scénario |
| Compte utilisé | À renseigner |
| Rôle | À renseigner |
| Entreprise | À renseigner |
| Préconditions | Voir scénario |
| Étapes | Voir scénario |
| Résultat attendu | Voir scénario |
| Résultat réel | À renseigner après exécution |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations | À renseigner |
| Captures ou preuves | À joindre |
| Ticket correctif | À créer si ÉCHOUÉ ou BLOQUÉ |

---

## E2E-03-REL-001 — Navigation globale des relations

- **Domaine :** Relations avec les entreprises
- **Objectif :** vérifier la découvrabilité sans organisation active et le traitement d’une invitation.
- **Préconditions :** compte standard DTSC, aucune organisation active, invitation privée valide.
- **Étapes :**
  1. Se connecter avec le compte standard.
  2. Vérifier « Relations avec les entreprises » dans la navigation desktop.
  3. Ouvrir la navigation mobile à 320 px, 360 px, 390 px et 412 px.
  4. Vérifier le lien dans la deuxième ligne mobile défilante.
  5. Vérifier l’état actif et `aria-current="page"`.
  6. Vérifier le badge borné aux décisions attendues.
  7. Ouvrir le module sans entreprise active.
  8. Ouvrir une notification de relation et vérifier l’élément précis.
  9. Accepter ou refuser l’invitation.
  10. Tester le retour arrière.
  11. Révoquer une relation active.
- **Résultat attendu :** accès global, objet précis visible, décision persistée, révocation sans suppression de la fiche métier.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-SALES-001 — Devis, commande et livraisons

- **Domaine :** Ventes
- **Objectif :** vérifier la chaîne client → devis → commande → livraisons.
- **Préconditions :** client/prospect actif, article catalogue actif, stock disponible si produit physique.
- **Étapes :**
  1. Créer ou sélectionner un client.
  2. Créer ou sélectionner un produit/service.
  3. Créer un devis avec remise et taxe.
  4. Vérifier le calcul serveur.
  5. Envoyer puis accepter le devis.
  6. Convertir en commande.
  7. Livrer partiellement.
  8. Vérifier le reliquat.
  9. Livrer le solde.
  10. Tenter de dépasser la quantité commandée.
  11. Vérifier le stock et l’absence de doublon.
- **Résultat attendu :** transitions cohérentes, reliquats exacts, dépassement refusé, mouvements uniques.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-PROC-001 — Achats et réception

- **Domaine :** Achats
- **Objectif :** vérifier demande, validation, commande et réceptions.
- **Préconditions :** fournisseur actif, entrepôt actif, approbateur distinct.
- **Étapes :**
  1. Créer ou sélectionner un fournisseur.
  2. Créer une demande d’achat.
  3. Faire approuver par un autre utilisateur.
  4. Créer la commande fournisseur.
  5. Enregistrer une réception partielle.
  6. Vérifier le stock.
  7. Enregistrer la réception finale.
  8. Rejouer l’action avec la même clé idempotente.
- **Résultat attendu :** stock alimenté une seule fois et écarts conservés pour le rapprochement futur.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-INV-001 — Transfert et inventaire

- **Domaine :** Stock
- **Objectif :** vérifier approbation indépendante, transit, comptage et ajustement.
- **Préconditions :** deux entrepôts distincts, article suivi, quantité suffisante.
- **Étapes :**
  1. Créer un transfert.
  2. Le faire valider par une autre personne.
  3. Vérifier la sortie et la destination.
  4. Créer une campagne d’inventaire.
  5. Saisir une quantité différente du théorique.
  6. Faire valider l’écart.
  7. Vérifier l’historique des mouvements.
  8. Tenter une sortie rendant le stock négatif.
- **Résultat attendu :** stock négatif interdit selon la règle, transfert et ajustement traçables.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-HR-001 — Collaborateur et relation DTSC

- **Domaine :** Ressources humaines
- **Objectif :** vérifier qu’un dossier RH existe sans compte DTSC puis peut être lié volontairement.
- **Préconditions :** utilisateur DTSC cible existant, entreprise cliente active.
- **Étapes :**
  1. Créer manuellement un collaborateur sans compte DTSC.
  2. Ajouter poste, département et contrat.
  3. Inviter son compte DTSC.
  4. Ouvrir Relations avec les entreprises depuis le compte cible.
  5. Accepter la relation.
  6. Vérifier le statut `ACTIVE` et les accès explicitement autorisés.
  7. Révoquer la relation.
  8. Vérifier le retrait des accès.
  9. Vérifier la conservation du dossier RH et du contrat.
- **Résultat attendu :** aucune liaison automatique, consentement explicite, données RH conservées et confidentielles.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-TIME-001 — Congé et feuille de temps

- **Domaine :** Temps, présence et congés
- **Objectif :** vérifier les workflows indépendants.
- **Préconditions :** collaborateur actif, approbateur distinct, projet actif pour le temps projet.
- **Étapes :**
  1. Soumettre un congé.
  2. Traiter la demande comme manager autorisé.
  3. Vérifier le calendrier.
  4. Tenter un chevauchement.
  5. Créer une feuille de temps.
  6. Ajouter une activité et un projet.
  7. Soumettre et faire approuver.
  8. Vérifier le temps approuvé disponible pour la paie.
- **Résultat attendu :** chevauchement refusé, temps déclaré distinct du temps approuvé et de la paie.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-PAY-001 — Paie, bulletins, annulation et recréation

- **Domaine :** Paie
- **Objectif :** vérifier la chaîne période → calcul → approbation → bulletins.
- **Préconditions :** contrats actifs, temps approuvé, préparateur et approbateur distincts.
- **Étapes :**
  1. Créer une période ouverte.
  2. Sélectionner la population.
  3. Ajouter une prime et une retenue valides.
  4. Préparer la paie.
  5. Vérifier les anomalies remontées.
  6. Soumettre à un autre utilisateur.
  7. Tenter l’auto-approbation.
  8. Approuver avec l’utilisateur autorisé.
  9. Vérifier les bulletins privés.
  10. Annuler une paie de test autorisée.
  11. Recréer la paie pour la même période.
  12. Vérifier qu’aucun paiement financier n’est créé automatiquement.
- **Résultat attendu :** auto-approbation interdite, bulletins isolés, recréation après annulation possible, une seule paie active.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-PROJ-001 — Projet, équipe, jalon et livrable

- **Domaine :** Projets
- **Objectif :** vérifier le pilotage et la validation indépendante.
- **Préconditions :** client actif, collaborateurs actifs, approbateur distinct.
- **Étapes :**
  1. Créer un projet.
  2. Ajouter une équipe.
  3. Ajouter un jalon.
  4. Ajouter un risque.
  5. Saisir du temps projet.
  6. Créer un livrable.
  7. Soumettre le livrable.
  8. Demander une correction.
  9. Soumettre une nouvelle révision.
  10. Faire valider par un autre utilisateur.
- **Résultat attendu :** équipe et historique conservés, livrable validé non écrasé silencieusement.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-ASSET-001 — Actif, affectation, incident et maintenance

- **Domaine :** Actifs
- **Objectif :** vérifier le cycle de vie opérationnel.
- **Préconditions :** catégorie, collaborateur et site actifs.
- **Étapes :**
  1. Créer un actif.
  2. L’affecter à un collaborateur.
  3. Tenter une seconde affectation active.
  4. Déclarer un incident.
  5. Planifier et démarrer une maintenance.
  6. Terminer la maintenance.
  7. Enregistrer le retour avec état.
  8. Vérifier l’historique complet.
- **Résultat attendu :** double affectation refusée, historique intact, actif opérationnel distinct de l’immobilisation comptable.
- **Statut :** `NON_EXÉCUTÉ`

## E2E-03-MOBILE-FR-001 — Mobile et français commercial

- **Domaine :** Transversal
- **Objectif :** vérifier l’expérience 320–412 px, tablette et desktop.
- **Étapes :**
  1. Parcourir chaque module à 320, 360, 390 et 412 px.
  2. Vérifier le rail KPI horizontal.
  3. Vérifier la navigation active et auto-centrée.
  4. Ouvrir chaque formulaire avec clavier mobile.
  5. Vérifier les dialogues plein écran et scrollables.
  6. Vérifier les actions contextuelles.
  7. Vérifier l’absence d’UUID, d’enum brute et de mot normal cassé.
  8. Vérifier qu’aucun statut métier visible n’est en anglais en locale française.
- **Résultat attendu :** aucun débordement horizontal, champs iOS à 16 px minimum, boutons tactiles, libellés humains.
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

Le rapport ne doit afficher « Tests E2E réussis » qu’après confirmation explicite et documentée du propriétaire.
