# Expiration périodique des invitations d’identité

La tâche `expireEnterpriseIdentityInvitations()` traite par lots bornés les invitations réellement expirées. Elle utilise statut, révision et date d’expiration pour rester idempotente et sûre en cas d’exécutions concurrentes.

Le cron appelle `/api/internal/identity-links/expire`, protégé par `CRON_SECRET` ou `WORKFLOW_WORKER_SECRET`. Un lancement manuel contrôlé est possible en POST. Les journaux ne contiennent que des agrégats ; aucun token, e-mail ou contenu personnel n’est journalisé.

Après expiration, le condensat du token est supprimé, un événement est créé et les parties autorisées reçoivent une notification profonde. Un token expiré ou déjà utilisé reste inutilisable.
