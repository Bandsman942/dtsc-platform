# Rollback non destructif — Itération 08

- Public : revenir au header/home précédents sans supprimer publications, contacts ou abonnés.
- Account : conserver les jetons de récupération ; désactiver temporairement les nouvelles demandes si la messagerie échoue. Un rollback ne restaure jamais un ancien mot de passe.
- Support : revenir à l’ancien shell tout en conservant tickets, commentaires et pagination serveur.
- PWA : désactiver le lien manifest, incrémenter la version du service worker et purger uniquement les caches publics.
- Sessions : ne jamais modifier le domaine du cookie sans tests multisous-domaines. La déconnexion doit supprimer les variantes host-only et partagées.
- Design system : conserver les anciens aliases CSS pendant la transition.
