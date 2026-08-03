# Notifications collaboratives

Le moteur canonique de `Notification` et Web Push est réutilisé. Les notifications de message, mention, invitation, appel, annonce, commentaire et modération possèdent une cible interne précise.

Les clés d’idempotence sont dérivées de l’événement, de l’objet et du destinataire. Un retry, une reconnexion ou une double émission ne crée donc pas une seconde notification.

Les groupes ou conversations en sourdine réduisent les notifications selon les préférences existantes. Les données sensibles ne sont pas copiées inutilement dans le titre ou le Push.

Au clic, la route cible revérifie l’accès. Un objet supprimé ou devenu interdit retourne un état sûr sans révéler son existence.
