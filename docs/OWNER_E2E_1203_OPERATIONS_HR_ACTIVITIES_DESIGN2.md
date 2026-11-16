# OWNER E2E — Issue #1203 · Design 2.0 Opérations / RH / Activités entreprise

**Statut : NON EXÉCUTÉ — validation propriétaire impérative avant fusion.** Branche candidate uniquement. Aucun E2E authentifié n'est certifié par la QA statique. Vérifier le SHA final de la PR.

## Matrice navigateur et accessibilité
Effectuer les tests en FR/EN et clair/sombre, Chrome desktop, Samsung Internet et PWA selon disponibilité, aux largeurs **320, 360, 375, 390, 414, 768, 1024, 1440 px**. Vérifier rail KPI local, barres de statuts tactiles, saisie de date exacte et de période, absence de scroll horizontal global, navigation clavier, focus visible, safe areas, ouverture/fermeture des détails et formulaires plein écran.

## Opérations — 5 modules
1. **Tâches & opérations** : créer/assigner, commencer, bloquer avec motif, reprendre, terminer et archiver. Le rail doit filtrer exactement côté serveur, le calendrier porte sur l'échéance; filtres recherche/priorité/assignation/département/retard combinables. Tester pagination sur 30+ données et export CSV/Excel/PDF filtré sur plusieurs pages.
2. **Demandes internes** : demande, demande d'information, réponse, résolution, clôture, réouverture et validation désignée. Filtrer les créations par date, statut, type, priorité, département; export conforme. Vérifier historique et liens directs.
3. **Validations** : en attente, corrections, traitées ; demandeur différent du validateur. Le rail statut doit rester cohérent avec la file sélectionnée. Tester correction/resoumission, refus motivé, idempotence et absence de validation de sa propre demande.
4. **Réunions** : créer, inviter, tenir, compte rendu versionné, décisions et conversion en tâche. Filtrer période de début, statut, participant/département et vues à venir/passées/annulées. Export des seuls champs métier visibles.
5. **Workflows** : ouvrir les définitions et versions, vérifier la version publiée immuable, lancer si autorisé, filtrer les exécutions par statut et date, exporter les résultats filtrés sans divulguer les étapes confidentielles. Tester reprise/annulation selon droits.

## Ressources humaines — 3 modules et sous-vues
6. **Ressources humaines** : fiche collaborateur liée au RH canonique, identité, postes, départements, organigramme, contrats. Recherche référence/personne, statut, dates, pagination, export **sans salaire individuel ni clauses**. Tester création, révision, approbation indépendante, archive/restauration.
7. **Temps, présences & congés** : horaires planifiés, présences observées, demandes de congés, feuilles de temps et Mon espace RH. Tester chaque registre avec statut/date exacte/plage et export. La présence ne doit jamais générer des minutes approuvées ni de rémunération.
8. **Paie opérationnelle** : créer période, préparer run, soumettre, approuver/refuser par une autre personne, bulletins privés, lien explicite vers Finance Paiements. Export seulement des synthèses autorisées, pas de bulletin individuel. Vérifier qu'une paie préparée ne décaisse rien et ne crée pas d'écriture comptable prématurée.

## Activités entreprise
9. **Actions disponibles** : sélectionner une action commune et sectorielle, remplir formulaire métier, confirmer une seule demande suivie, pas de vente/achat/transfert implicite. Vérifier l'accès sans autorisation d'administration.
10. **Demandes soumises** : générer plus de 80 demandes, recherche/statut/aujourd'hui/semaine/mois/date précise/intervalle réellement côté API, pagination, CSV/Excel/PDF complet (limite 1 000 explicite), retour via deep link exact et workflow canonique associé. Tester que les demandes d'une autre entreprise ne sont pas visibles.
11. **Workflows partagés** : ouvrir uniquement les workflows auxquels le membre a droit ; les exécutions sensibles restent limitées au rôle d'origine.
12. **Health/Pharmacy et autres secteurs** : tests de non-régression dans leurs workspaces dédiés, contrôles des données sensibles et des droits sectoriels.

## Contrôles transversaux
13. **Multi-tenant** : entreprise A, entreprise B, collaborateur standard, administrateur, valideur, préparateur RH, gestionnaire Paie. Tenter les accès par URL/API et exports inter-organisations, par ID forcé, par retrait de permission et d'abonnement : 403/404 attendu.
14. **Exports** : filtres réappliqués **avant pagination**, identifiants d'entreprise exacts, 1 000 lignes maximum, aucune exportation du seul écran, aucune fuite de rémunération individuelle, raison médicale ou pièce privée.
15. **UX** : toasts succès/erreur, actions « … » autorisées uniquement, aucun bouton fictif, responsive 320 px et Android clavier ouvert. Vérifier champs obligatoires et erreurs humaines.
16. **Performance** : 2e page, recherche longue, filtre combiné et absence de chargement de milliers de lignes en navigateur. Contrôler les index et alertes si nécessaire.

## Preuve finale
Renseigner PR, SHA final, navigateur, largeurs, captures anonymisées, exemples de filtres et exports, réponses API positives et refus, résultat CI exact, écarts éventuels. Verdict requis : `E2E final #<PR> BON` **après** Quality Gates, et autorisation explicite de fusion. Aucun déploiement de branche, aucune preview considérée comme test.
