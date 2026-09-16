# OWNER_E2E #656 — Gaming Lounge commercial readiness

Cette checklist est la preuve manuelle propriétaire requise avant de sortir la PR #656 du Draft et avant toute fusion sur `main`. Les validations GitHub Actions restent des preuves `CI_PROVEN` distinctes.

## Préconditions

- utiliser le head final exact de la PR #656 ;
- aucune Preview Vercel ;
- entreprise de test créée comme `HOSPITALITY_EVENTS -> GAMING_LOUNGE` ;
- plan autorisant les modules Gaming ;
- un compte propriétaire/admin entreprise et, si possible, des comptes représentant opérateur, technicien et finance.

## Parcours propriétaire complet

1. **Création DTSC et invitation**
   - depuis l’Administration DTSC, créer une entreprise `HOSPITALITY_EVENTS -> GAMING_LOUNGE` ;
   - vérifier la preview en trois couches `ERP commun + HOSPITALITY_EVENTS + GAMING_LOUNGE` ;
   - vérifier qu’aucune donnée privée d’une autre entreprise n’est visible ;
   - inviter l’administrateur entreprise puis accepter l’invitation.

2. **Onboarding**
   - ouvrir `Vue d’ensemble Gaming` ;
   - vérifier la carte `Mise en service Gaming Lounge` ;
   - sélectionner/configurer le site ;
   - suivre les huit étapes et vérifier que chaque lien ouvre le module canonique propriétaire de la donnée ;
   - vérifier qu’aucun assistant ne crée automatiquement un client, actif, service catalogue, compte Finance ou stock parallèle.

3. **Cinq postes initiaux et extensibilité**
   - créer/associer cinq actifs canoniques à cinq postes Gaming ;
   - vérifier que l’étape stations devient complète ;
   - ajouter une sixième station pour confirmer qu’il n’existe aucun plafond produit à cinq ;
   - archiver/réactiver selon les flux permis sans perdre l’historique Actifs.

4. **Équipe et permissions**
   - vérifier les postes recommandés : Gérant/Admin Gaming, Caissier/Opérateur, Technicien, Finance/Comptable ;
   - vérifier qu’un opérateur sans permission de gestion n’obtient pas un accès administrateur ;
   - vérifier que les détails Finance/Actifs restent masqués quand les permissions correspondantes manquent.

5. **Catalogue et tarification**
   - créer un service Gaming dans le Catalogue commun ;
   - créer au moins une règle tarifaire Gaming ;
   - tester une simulation puis démarrer une session ;
   - modifier ensuite le tarif courant et vérifier qu’une session historique conserve son snapshot.

6. **Réservation -> session**
   - créer une réservation ;
   - confirmer/check-in ;
   - convertir en session ;
   - vérifier le refus d’un conflit/double occupation ;
   - tester pause/reprise/prolongation/fin selon le parcours prévu.

7. **Paiement et clôture**
   - préparer le checkout de la session terminée ;
   - effectuer un paiement canonique autorisé ;
   - vérifier facture/reçu/réconciliation ;
   - rejouer un retry et confirmer l’absence de doublon ;
   - réaliser une clôture journalière ;
   - vérifier que les devises différentes restent séparées.

8. **Panne et maintenance**
   - utiliser `Signaler une panne Gaming` ou un raccourci station/session ;
   - vérifier l’ouverture de l’actif exact dans `ASSETS_MAINTENANCE` ;
   - créer/suivre l’incident ou la maintenance dans le domaine Actifs ;
   - confirmer que le poste Gaming reflète l’indisponibilité sans créer un second registre de maintenance.

9. **Rapport et DTSC AI**
   - générer un rapport Gaming et vérifier son export ;
   - demander à DTSC AI un résumé Gaming autorisé ;
   - vérifier les montants par devise séparée ;
   - vérifier qu’une permission manquante provoque le masquage/refus attendu ;
   - vérifier que l’IA ne formule pas de causalité inventée.

10. **UX finale**
    - FR puis EN ;
    - clair puis sombre ;
    - mobile 320, 360, 375, 390, 414 px ;
    - tablette et desktop ;
    - aucun débordement horizontal involontaire, libellé coupé de manière bloquante, modal inaccessible ou action sans feedback.

## Résultat attendu

Une confirmation `E2E #656 bon` signifie uniquement que le propriétaire a validé le parcours manuel sur le head final annoncé. Après cette confirmation, la PR peut être marquée Ready puis fusionnée selon `docs/CONTRIBUTING.md`; le déploiement Vercel Production ne doit partir qu’après le merge `main`.
