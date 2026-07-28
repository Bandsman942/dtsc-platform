# Règles locales — API Web Push

- Toute mutation Push exige session valide, utilisateur ACTIVE, validation stricte, protection d'origine et rate limiting.
- Ne jamais accepter un `userId` fourni par le client pour associer un abonnement ; utiliser uniquement le `userId` de la session.
- Un endpoint déjà associé à un autre compte ne peut pas être transféré silencieusement.
- Ne jamais renvoyer ou journaliser les secrets d'abonnement, la clé VAPID privée ou les endpoints complets dans des logs généraux.
- La suppression d'un abonnement expiré ou révoqué ne doit jamais supprimer les abonnements des autres appareils du même utilisateur.
