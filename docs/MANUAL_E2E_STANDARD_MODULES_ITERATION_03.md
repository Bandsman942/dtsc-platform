# Tests E2E manuels — Modules standards, itération 03

**Statut : NON_EXÉCUTÉ**

## 1. Conversation directe
Deux utilisateurs autorisés recherchent leur collaborateur, ouvrent deux fois la conversation, vérifient sa réutilisation, envoient un message, ouvrent la notification sur le message exact et vérifient la lecture.

## 2. Messages
Tester envoi, double clic, retry hors ligne, réponse, modification, réaction, mention, épinglage, suppression logique, historique et pagination.

## 3. Pièces jointes
Envoyer image et document, vérifier taille/MIME, ouvrir l’image plein écran, zoomer, naviguer et télécharger seulement avec accès valide.

## 4. Groupe
Créer, inviter, accepter/refuser, promouvoir/rétrograder, retirer un membre, transférer la propriété, quitter et fermer.

## 5. Présence
Ouvrir deux sessions, vérifier online, expiration heartbeat, confidentialité et présence pendant appel.

## 6. Appel audio
Lancer, recevoir la sonnerie globale, accepter, couper le microphone, quitter/terminer et vérifier l’historique.

## 7. Appel vidéo
Accepter/refuser les permissions caméra, reconnecter et terminer.

## 8. Appel manqué et annulation
Ne pas répondre pendant 45 secondes, vérifier `MISSED`; relancer puis annuler avant acceptation et vérifier `CANCELLED`.

## 9. Appel de groupe
Tester plusieurs participants uniquement lorsque la configuration fournisseur l’autorise. Sinon vérifier que l’action n’est pas disponible.

## 10. Annonce
Créer un brouillon, publier avec audience, ouvrir les médias, réagir, commenter, répondre, modifier et archiver.

## 11. Commentaire ciblé
Replier les commentaires, ouvrir une notification, vérifier le dépliage automatique et le positionnement exact.

## 12. Modération
Signaler, masquer, restaurer, clôturer et vérifier l’audit avec un rôle autorisé ; vérifier le refus d’un rôle non autorisé.

## 13. Révocation
Retirer un membership ou un participant puis vérifier la perte immédiate de lecture, mutation, événement et lien profond.

## 14. Perte réseau et PWA
Envoyer pendant une coupure, vérifier l’état non envoyé, reprendre, retry sans doublon, compteurs cohérents et ouverture Push dans le bon contexte.

## 15. Responsive
Tester 320, 360, 375, 390, 414 et 768 px : liste, conversation, compositeur, clavier, pièces jointes, menus, appels, annonce, galerie, commentaires et filtres horizontaux.

Tests E2E manuels préparés — validation du propriétaire en attente
