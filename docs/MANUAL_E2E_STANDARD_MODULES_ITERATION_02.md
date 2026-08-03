# E2E manuels — Modules standards — Itération 2

**Statut : NON_EXÉCUTÉ**

## 1. Dashboard personnel

Se connecter dans le compte personnel ; vérifier la salutation, le contexte, les actions attendues, l’abonnement, les notifications, les raccourcis et l’absence de données non autorisées.

## 2. Plusieurs organisations

Avec plusieurs memberships actifs, changer de contexte, vérifier la navigation, les modules, les notifications puis revenir au compte personnel.

## 3. Accès révoqué

Activer un contexte entreprise, révoquer le membership depuis un compte autorisé, actualiser, vérifier le refus du changement de contexte, la redirection sûre et le refus des APIs.

## 4. Abonnement

Vérifier le plan, le statut, la période, les limites, la consommation, les factures SaaS, les paiements et une fonctionnalité hors plan.

## 5. Invitation reçue

Créer une invitation, vérifier sa présence dans le compte personnel, le Dashboard et Notifications, l’ouvrir, l’accepter puis basculer vers l’organisation.

## 6. Idempotence

Rejouer l’acceptation de la même invitation ; vérifier une réponse réussie sans second membership ni notification dupliquée.

## 7. Invitation refusée

Refuser une invitation, vérifier le statut historique, la notification de l’émetteur et l’impossibilité de la réutiliser comme invitation en attente.

## 8. Relations avec les entreprises

Recevoir une demande hors contexte organisation, ouvrir la relation précise, lire les conséquences, consentir, vérifier la relation active puis la révocation.

## 9. Profil

Modifier le nom et l’avatar, enregistrer, actualiser et vérifier la persistance dans la navigation et les surfaces autorisées.

## 10. Paramètres et session

Changer la langue, le thème, le fuseau, une préférence de notification et la durée d’inactivité ; actualiser et vérifier la persistance. Contrôler les dates réelles de la session actuelle.

## 11. Notifications

Créer plus de trente notifications, rechercher, paginer, filtrer, marquer comme lue, ouvrir un lien profond et vérifier les compteurs.

## 12. Web Push

Activer Push, recevoir une notification, cliquer vers la cible précise, désactiver sur un appareil et vérifier que les autres souscriptions ne sont pas supprimées implicitement.

## 13. Mobile

Tester 320, 360, 375, 390, 414 et 768 px : Dashboard, sélecteur de contexte, Abonnement, Entreprise, Profil, Paramètres, Notifications, Invitations, Relations, dialogues, rails horizontaux et clavier mobile.

## Résultat

Tests E2E manuels préparés — validation du propriétaire en attente
