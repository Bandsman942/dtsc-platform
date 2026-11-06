# UX-03B / #986 — Erreurs métier Finance Caisse, Paiements et Factures

Ce lot prolonge #938 sur les surfaces professionnelles existantes. Le service partagé
`financeMutation` demeure autoritatif : un statut HTTP non réussi lève `FinanceApiError`
avec le code et le statut du serveur. Les échecs de connexion sont typés sans propager
de message technique brut. Le composant de feedback ne traite jamais un refus comme succès.

Les trois workspaces transmettent désormais la locale active (`fr` ou `en`) au catalogue
Finance. Les codes métier connus restent prioritaires. Un code inconnu reçoit un retour
utilisateur adapté à son statut HTTP, notamment authentification, permission, conflit,
limitation de fréquence ou service indisponible. Les messages métier sûrs de validation
restent disponibles en français et les traductions anglaises évitent de présenter
par erreur une phrase française dans une interface anglaise.

## E2E propriétaire #986 — requis avant fusion

1. Dans Caisse, tester ouverture, clôture, assignation d'un validateur et décision ; dans
   Paiements et Factures, tester création et transition. Vérifier le toast de succès
   uniquement après réponse HTTP réussie.
2. Déclencher une permission insuffisante (403), un conflit de révision (409), une
   validation invalide (400/422) et une déconnexion réseau. Aucun formulaire rempli
   ne doit disparaître après un refus et aucune opération ne doit être présentée comme confirmée.
3. Répéter un refus, vérifier l'affichage du message au premier plan et une indication
   corrective sans erreur technique. Refaire en FR/EN, thème clair/sombre, 320/390/1440 px.
4. Contrôler un second tenant sans droit d'accès ; aucune information financière de l'autre
   entreprise ne doit être visible.

## Hors scope, risques et rollback

Pas de migration, de changement d'autorisation, de modèle Prisma, de données financières,
ni de modification des transitions métier. Les autres domaines Gaming/CRM/Health restent
suivis par #938. La traduction de messages de fallback peut modifier le libellé perçu,
mais jamais le résultat de l'API. Le rollback est un revert applicatif par PR depuis `main`.
